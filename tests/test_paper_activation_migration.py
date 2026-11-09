import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "web" / "migrations"


def iso(value):
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def database():
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys = ON")
    for migration in sorted(MIGRATIONS.glob("*.sql")):
        db.executescript(migration.read_text())
    return db


def seed_strategy(db, now):
    db.execute(
        """
        UPDATE northstar_strategy_approval
        SET approved=1, strategy_version=?, report_version=1, report_sha256=?,
            report_uri=?, approved_at=?, reviewer=?, updated_at=?
        WHERE id=1
        """,
        (
            "northstar-provisional-gates-v1",
            "a" * 64,
            "https://example.test/strategy-validation-report",
            iso(now),
            "Independent Strategy Reviewer",
            iso(now),
        ),
    )


def seed_snapshots(db, now, weekly=True):
    baseline = now - timedelta(days=8) if weekly else now - timedelta(hours=1)
    latest = now - timedelta(seconds=5)
    db.execute(
        """
        INSERT INTO paper_equity_snapshots
          (captured_at, equity_usd, cash_usd, buying_power_usd, source)
        VALUES (?, 100000, 50000, 400000, 'alpaca_paper_read_only_sync')
        """,
        (iso(baseline),),
    )
    db.execute(
        """
        INSERT INTO paper_equity_snapshots
          (captured_at, equity_usd, cash_usd, buying_power_usd, source)
        VALUES (?, 100000, 50000, 400000, 'alpaca_paper_read_only_sync')
        """,
        (iso(latest),),
    )
    return iso(latest), iso(baseline)


def activation_details():
    return {
        "accountId": "11111111-1111-4111-8111-111111111111",
        "strategyReportSha256": "a" * 64,
        "executionEnabled": True,
        "killSwitchEngaged": False,
        "noBrokerOrderCreated": True,
        "accountSyncStatus": "READ_ONLY_ACCOUNT_SYNC_PASSED",
        "fillSyncStatus": "FILL_IMPORT_AND_ORDER_SYNC_PASSED_READ_ONLY",
        "intentReviewConfigured": True,
        "accountStatus": "ACTIVE",
        "currency": "USD",
        "paperApiHost": "paper-api.alpaca.markets",
        "reconciliationStatus": "RECONCILIATION_PASSED_READ_ONLY",
        "brokerPositions": 0,
        "brokerOrders": 0,
        "ledgerPositions": 0,
        "ledgerOrders": 0,
        "fillDerivedPositions": 0,
        "marketOpen": True,
        "quoteAgeMs": 5000,
        "quoteSpreadPct": 0.1,
        "dailyLossUsd": 0,
        "maxDrawdownUsd": 0,
        "virtualCapitalUsd": 1000,
        "maxPositionUsd": 250,
        "maxRiskUsd": 10,
        "dailyLossCapUsd": 20,
        "maxDrawdownCapUsd": 80,
    }


def insert_activation_request(db, now, latest, baseline, details=None):
    request_id = "paper-activation-test-0001"
    checked = iso(now - timedelta(seconds=5))
    db.execute(
        """
        INSERT INTO paper_execution_activation_requests (
          request_id, approver, requested_at, account_id, strategy_report_sha256,
          reconciliation_checked_at, latest_snapshot_at, weekly_baseline_at, quote_at, details_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            request_id,
            "Hamza Ijaz",
            iso(now),
            "11111111-1111-4111-8111-111111111111",
            "a" * 64,
            checked,
            latest,
            baseline,
            checked,
            json.dumps(details or activation_details()),
        ),
    )
    return request_id


def enable(db, request_id, now):
    return db.execute(
        """
        UPDATE execution_control
        SET enabled=1, kill_switch=0, last_activation_request_id=?, updated_at=?
        WHERE id=1
        """,
        (request_id, iso(now)),
    )


def test_direct_enable_without_a_fresh_approval_request_is_rejected():
    db = database()
    try:
        enable(db, "missing-request", datetime.now(timezone.utc))
        raise AssertionError("direct PAPER enablement must be rejected")
    except sqlite3.IntegrityError:
        pass
    assert db.execute("SELECT enabled, kill_switch FROM execution_control WHERE id=1").fetchone() == (0, 1)
    db.close()


def test_activation_requires_a_verified_seven_day_equity_baseline():
    db = database()
    now = datetime.now(timezone.utc)
    seed_strategy(db, now)
    latest, baseline = seed_snapshots(db, now, weekly=False)
    request_id = insert_activation_request(db, now, latest, baseline)
    try:
        enable(db, request_id, now)
        raise AssertionError("a recent-only equity history must not enable PAPER execution")
    except sqlite3.IntegrityError:
        pass
    assert db.execute("SELECT enabled, kill_switch FROM execution_control WHERE id=1").fetchone() == (0, 1)
    db.close()


def test_pending_intent_blocks_activation_even_with_other_evidence_valid():
    db = database()
    now = datetime.now(timezone.utc)
    seed_strategy(db, now)
    latest, baseline = seed_snapshots(db, now)
    db.execute(
        """
        INSERT INTO paper_trade_intents (
          id, idempotency_key, request_hash, symbol, side, qty, reference_price,
          stop_price, estimated_notional_usd, planned_risk_usd, status, evidence_json
        ) VALUES ('intent-1', 'intent-key-1', ?, 'AAPL', 'buy', 1, 100, 95, 100, 5, 'PENDING_REVIEW', '{}')
        """,
        ("b" * 64,),
    )
    request_id = insert_activation_request(db, now, latest, baseline)
    try:
        enable(db, request_id, now)
        raise AssertionError("a pending intent must block initial PAPER activation")
    except sqlite3.IntegrityError:
        pass
    assert db.execute("SELECT enabled, kill_switch FROM execution_control WHERE id=1").fetchone() == (0, 1)
    db.close()


def test_valid_activation_creates_immutable_event_and_audit_without_creating_orders():
    db = database()
    now = datetime.now(timezone.utc)
    seed_strategy(db, now)
    latest, baseline = seed_snapshots(db, now)
    request_id = insert_activation_request(db, now, latest, baseline)
    enable(db, request_id, now)

    assert db.execute(
        "SELECT enabled, mode, kill_switch, last_activation_request_id FROM execution_control WHERE id=1"
    ).fetchone() == (1, "paper", 0, request_id)
    assert db.execute(
        "SELECT request_id, event_type, actor, outcome FROM paper_execution_activation_events"
    ).fetchone() == (request_id, "PAPER_EXECUTION_ENABLED", "Hamza Ijaz", "SUCCESS")
    assert db.execute(
        "SELECT actor, action, outcome, request_id FROM execution_audit_log WHERE action='ENABLE_PAPER_EXECUTION'"
    ).fetchone() == ("Hamza Ijaz", "ENABLE_PAPER_EXECUTION", "SUCCESS", request_id)
    assert db.execute("SELECT COUNT(*) FROM paper_orders").fetchone()[0] == 0

    for statement in (
        "UPDATE paper_execution_activation_requests SET approver='Changed' WHERE request_id=?",
        "DELETE FROM paper_execution_activation_requests WHERE request_id=?",
        "UPDATE paper_execution_activation_events SET actor='Changed' WHERE request_id=?",
        "DELETE FROM paper_execution_activation_events WHERE request_id=?",
    ):
        try:
            db.execute(statement, (request_id,))
            raise AssertionError("activation evidence must be immutable")
        except sqlite3.IntegrityError:
            pass

    db.execute(
        "UPDATE execution_control SET enabled=0, kill_switch=1, updated_at=? WHERE id=1",
        (iso(now + timedelta(seconds=1)),),
    )
    assert db.execute("SELECT enabled, kill_switch FROM execution_control WHERE id=1").fetchone() == (0, 1)
    db.close()

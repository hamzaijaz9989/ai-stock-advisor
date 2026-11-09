import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = ROOT / "web" / "migrations"


def test_intent_review_migration_requires_immutable_reviewer_and_audits_decision():
    db = sqlite3.connect(":memory:")
    db.execute(
        "CREATE TABLE execution_audit_log (actor TEXT, action TEXT, outcome TEXT, request_id TEXT, details_json TEXT)"
    )
    db.executescript((MIGRATIONS / "0005_paper_trade_intents.sql").read_text())
    db.executescript((MIGRATIONS / "0010_paper_intent_review_audit.sql").read_text())

    columns = {row[1] for row in db.execute("PRAGMA table_info(paper_trade_intents)")}
    assert "reviewer" in columns

    db.execute(
        """
        INSERT INTO paper_trade_intents (
            id, idempotency_key, request_hash, symbol, side, qty, reference_price,
            stop_price, estimated_notional_usd, planned_risk_usd, status, evidence_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_REVIEW', ?)
        """,
        ("intent-1", "intent-key-0001", "a" * 64, "AAPL", "buy", 1, 100, 95, 100, 5, "{}"),
    )

    try:
        db.execute(
            "UPDATE paper_trade_intents SET status='APPROVED_REVIEW_ONLY' WHERE id='intent-1'"
        )
        raise AssertionError("approval without reviewer metadata must fail")
    except sqlite3.IntegrityError:
        pass

    evidence = json.dumps(
        {
            "review": {
                "reviewer": "Independent Risk Reviewer",
                "decision": "APPROVE",
                "requestId": "northstar-review-12345678",
                "preflight": {"checkedAt": "2026-11-09T00:00:00.000Z"},
            }
        }
    )
    db.execute(
        """
        UPDATE paper_trade_intents
        SET status='APPROVED_REVIEW_ONLY', reviewer=?, decided_at=?, decision_note=?, evidence_json=?, updated_at=?
        WHERE id='intent-1' AND status='PENDING_REVIEW'
        """,
        (
            "Independent Risk Reviewer",
            "2026-11-09T00:00:00.000Z",
            "Reviewed current risk policy and source evidence.",
            evidence,
            "2026-11-09T00:00:00.000Z",
        ),
    )

    audit = db.execute(
        "SELECT actor, action, outcome, request_id, details_json FROM execution_audit_log"
    ).fetchone()
    assert audit[:4] == (
        "Independent Risk Reviewer",
        "PAPER_INTENT_APPROVED",
        "SUCCESS",
        "intent-1",
    )
    assert json.loads(audit[4])["reviewer"] == "Independent Risk Reviewer"

    for sql in (
        "UPDATE paper_trade_intents SET reviewer='Different Reviewer' WHERE id='intent-1'",
        "UPDATE paper_trade_intents SET decided_at='2026-11-10T00:00:00.000Z' WHERE id='intent-1'",
        "UPDATE paper_trade_intents SET decision_note='Changed after review' WHERE id='intent-1'",
        "DELETE FROM paper_trade_intents WHERE id='intent-1'",
    ):
        try:
            db.execute(sql)
            raise AssertionError(f"immutable review record mutation must fail: {sql}")
        except sqlite3.IntegrityError:
            pass

    db.execute(
        "UPDATE paper_trade_intents SET status='REJECTED', updated_at='2026-11-09T00:01:00.000Z' WHERE id='intent-1'"
    )
    assert db.execute(
        "SELECT status, reviewer FROM paper_trade_intents WHERE id='intent-1'"
    ).fetchone() == ("REJECTED", "Independent Risk Reviewer")
    db.close()

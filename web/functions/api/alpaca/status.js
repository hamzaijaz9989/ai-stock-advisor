// Read-only Alpaca Paper Trading connection check.
// This endpoint deliberately uses the paper API only and exposes no order-placement route.
const PAPER_API = "https://paper-api.alpaca.markets";

export async function onRequestGet({ env }) {
  const key = env?.ALPACA_API_KEY_ID;
  const secret = env?.ALPACA_API_SECRET_KEY;
  if (!key || !secret) {
    return Response.json({
      connected: false,
      error: "Alpaca credentials are not configured. Add ALPACA_API_KEY_ID and ALPACA_API_SECRET_KEY as Cloudflare Pages secrets."
    }, { status: 503, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }

  const headers = {
    "APCA-API-KEY-ID": key,
    "APCA-API-SECRET-KEY": secret,
    "Accept": "application/json"
  };

  try {
    const accountResponse = await fetch(PAPER_API + "/v2/account", {
      method: "GET", headers, signal: AbortSignal.timeout(8000)
    });
    if (!accountResponse.ok) {
      const status = accountResponse.status;
      return Response.json({
        connected: false,
        error: status === 401
          ? "Alpaca rejected the credentials. Confirm these are the matching Paper Trading key and secret."
          : status === 403
            ? "Alpaca denied access. Check your Paper Trading account permissions."
            : "Alpaca account check failed (HTTP " + status + ")."
      }, { status: status === 401 || status === 403 ? 502 : 502, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
    }

    const account = await accountResponse.json();
    const positionsResponse = await fetch(PAPER_API + "/v2/positions", {
      method: "GET", headers, signal: AbortSignal.timeout(8000)
    });
    let positions = [];
    let positionsWarning = null;
    if (positionsResponse.ok) {
      const rawPositions = await positionsResponse.json();
      positions = Array.isArray(rawPositions) ? rawPositions.map(position => ({
        symbol: position.symbol,
        qty: position.qty,
        side: position.side,
        avgEntryPrice: position.avg_entry_price,
        currentPrice: position.current_price,
        marketValue: position.market_value,
        unrealizedPl: position.unrealized_pl,
        unrealizedPlPercent: position.unrealized_plpc
      })) : [];
    } else {
      positionsWarning = "Account connected, but current positions could not be loaded (HTTP " + positionsResponse.status + ").";
    }

    return Response.json({
      connected: true,
      environment: "paper",
      account: {
        status: account.status,
        currency: account.currency,
        cash: account.cash,
        buyingPower: account.buying_power,
        equity: account.equity,
        portfolioValue: account.portfolio_value,
        tradingBlocked: account.trading_blocked,
        accountBlocked: account.account_blocked
      },
      positions,
      positionsWarning,
      checkedAt: new Date().toISOString(),
      mode: "Read-only connection check. No orders are submitted."
    }, { headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) {
    return Response.json({
      connected: false,
      error: error?.name === "TimeoutError"
        ? "Alpaca did not respond in time. Try again shortly."
        : "Could not reach Alpaca Paper Trading. Try again shortly."
    }, { status: 502, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
}

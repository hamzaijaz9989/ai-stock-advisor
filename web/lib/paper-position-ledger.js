// Deterministic FIFO ledger for Northstar-tracked paper fills only.
// Pure computation: no broker calls and no database writes.
const EPSILON = 1e-8;
const finitePositive = value => value !== null && value !== undefined &&
  value !== "" && Number.isFinite(Number(value)) && Number(value) > 0;
const round8 = value => Math.round(value * 1e8) / 1e8;

export function derivePaperPositionLedger(input) {
  if (!Array.isArray(input)) return {ok:false, reason:"FILL_INPUT_NOT_ARRAY"};
  const seen = new Set();
  const fills = [];
  for (const raw of input) {
    const activityId = String(raw?.activity_id ?? raw?.activityId ?? "");
    const orderId = String(raw?.order_id ?? raw?.orderId ?? "");
    const brokerOrderId = String(raw?.broker_order_id ?? raw?.brokerOrderId ?? "");
    const symbol = String(raw?.symbol ?? "").toUpperCase();
    const side = String(raw?.side ?? "").toLowerCase();
    const qty = Number(raw?.qty);
    const price = Number(raw?.price);
    const transactionTime = String(raw?.transaction_time ?? raw?.transactionTime ?? "");
    const at = Date.parse(transactionTime);
    if (!activityId || !orderId || !brokerOrderId || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol) ||
        !["buy","sell"].includes(side) || !finitePositive(qty) || !finitePositive(price) ||
        !Number.isFinite(at)) return {ok:false,reason:"FILL_ROW_INVALID",activityId:activityId||null};
    if (seen.has(activityId)) return {ok:false,reason:"DUPLICATE_FILL_ACTIVITY_ID",activityId};
    seen.add(activityId);
    fills.push({activityId,orderId,brokerOrderId,symbol,side,qty,price,transactionTime,at});
  }
  fills.sort((a,b)=>a.at-b.at || a.activityId.localeCompare(b.activityId));
  const lots = [];
  const realized = [];
  for (const fill of fills) {
    if (fill.side === "buy") {
      lots.push({
        lotId:fill.activityId,
        sourceActivityId:fill.activityId,
        orderId:fill.orderId,
        symbol:fill.symbol,
        openedAt:fill.transactionTime,
        entryPrice:fill.price,
        originalQty:fill.qty,
        openQty:fill.qty
      });
      continue;
    }
    let remaining = fill.qty;
    const candidates = lots.filter(lot=>lot.symbol===fill.symbol && lot.openQty>EPSILON);
    for (const lot of candidates) {
      if (remaining <= EPSILON) break;
      const matched = Math.min(remaining,lot.openQty);
      if (matched <= EPSILON) continue;
      realized.push({
        closeActivityId:fill.activityId,
        openActivityId:lot.sourceActivityId,
        openOrderId:lot.orderId,
        closeOrderId:fill.orderId,
        symbol:fill.symbol,
        qty:round8(matched),
        entryPrice:lot.entryPrice,
        exitPrice:fill.price,
        realizedPl:round8((fill.price-lot.entryPrice)*matched),
        closedAt:fill.transactionTime
      });
      lot.openQty=round8(lot.openQty-matched);
      remaining=round8(remaining-matched);
    }
    if (remaining > EPSILON) {
      return {
        ok:false,
        reason:"SELL_EXCEEDS_TRACKED_LONG_POSITION",
        activityId:fill.activityId,
        orderId:fill.orderId,
        symbol:fill.symbol,
        excessQty:round8(remaining),
        execution:false
      };
    }
  }
  const openLots=lots.filter(lot=>lot.openQty>EPSILON).map(lot=>({...lot,openQty:round8(lot.openQty)}));
  const bySymbol=new Map();
  for (const lot of openLots) {
    const current=bySymbol.get(lot.symbol)||{symbol:lot.symbol,qty:0,cost:0,openLots:0};
    current.qty+=lot.openQty;
    current.cost+=lot.openQty*lot.entryPrice;
    current.openLots++;
    bySymbol.set(lot.symbol,current);
  }
  const positions=[...bySymbol.values()].map(row=>({
    symbol:row.symbol,
    qty:round8(row.qty),
    avgEntryPrice:round8(row.cost/row.qty),
    costBasisUsd:round8(row.cost),
    openLots:row.openLots
  })).sort((a,b)=>a.symbol.localeCompare(b.symbol));
  return {
    ok:true,
    fillsProcessed:fills.length,
    lots:openLots,
    realized,
    positions,
    grossRealizedPlUsd:round8(realized.reduce((sum,row)=>sum+row.realizedPl,0)),
    execution:false
  };
}

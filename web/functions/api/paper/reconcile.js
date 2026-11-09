// Authenticated, read-only broker-to-ledger reconciliation. Never submits or mutates orders.
import {verifyOtoStopLeg} from "../../../lib/paper-execution-policy.js";
import {verifyStandaloneRecoveryStop} from "../../../lib/paper-recovery-policy.js";
const H = {"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Referrer-Policy":"no-referrer"};
const fail = (error,status=400,extra={}) => Response.json({ok:false,reconciled:false,execution:false,error,...extra},{status,headers:H});
function safeEqual(a,b) {
  if(typeof a!=="string"||typeof b!=="string"||!a||!b) return false;
  let diff=a.length^b.length;
  for(let i=0;i<Math.max(a.length,b.length);i++) diff|=(a.charCodeAt(i)||0)^(b.charCodeAt(i)||0);
  return diff===0;
}
function authorized(request,env) {
  return !!env?.NORTHSTAR_OPERATOR_TOKEN && safeEqual(request.headers.get("Authorization")||"","Bearer "+env.NORTHSTAR_OPERATOR_TOKEN);
}
async function alpaca(path,key,secret) {
  const response=await fetch("https://paper-api.alpaca.markets"+path,{
    headers:{"APCA-API-KEY-ID":key,"APCA-API-SECRET-KEY":secret,"Accept":"application/json"},
    signal:AbortSignal.timeout(10000)
  });
  if(!response.ok) throw new Error("BROKER_HTTP_"+response.status);
  return response.json();
}
const num = value => value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const statusOf = value => {
  const raw=String(value || "").trim().toLowerCase();
  // Alpaca's broker vocabulary is normalized to Northstar's durable ledger states.
  // Unknown broker states remain UNKNOWN and therefore fail closed during reconciliation.
  return ({
    new:"ACCEPTED", pending_new:"ACCEPTED", held:"ACCEPTED",
    accepted:"ACCEPTED", accepted_for_bidding:"ACCEPTED",
    partially_filled:"PARTIALLY_FILLED", filled:"FILLED",
    canceled:"CANCELED", cancelled:"CANCELED", rejected:"REJECTED",
    unknown:"UNKNOWN"
  })[raw] || "UNKNOWN";
};
function storedFill(row) {
  try {
    const data=JSON.parse(row.response_json || "{}");
    return {
      qty:num(data.filled_qty ?? data.filledQty ?? data.filled_quantity),
      avg:num(data.filled_avg_price ?? data.filledAvgPrice ?? data.average_fill_price)
    };
  } catch { return {qty:null,avg:null}; }
}
const close = (a,b,tol=0.0001) => Math.abs(Number(a)-Number(b))<=tol;
export async function onRequestPost({request,env}) {
  if(!authorized(request,env)) return fail("Unauthorized.",401);
  const db=env?.NORTHSTAR_DB, key=env?.ALPACA_API_KEY_ID, secret=env?.ALPACA_API_SECRET_KEY;
  if(!db||!key||!secret) return fail("Paper ledger or Alpaca Paper credentials unavailable; reconciliation blocked.",503);
  let control,ledgerPositions,ledgerOrders,fillDerivedPositions;
  try {
    control=await db.prepare("SELECT enabled,mode,kill_switch FROM execution_control WHERE id=1").first();
    ledgerPositions=await db.prepare("SELECT symbol,qty,avg_entry_price FROM paper_positions ORDER BY symbol").all();
    ledgerOrders=await db.prepare("SELECT id,idempotency_key,broker_order_id,symbol,side,qty,order_type,time_in_force,stop_price,status,response_json FROM paper_orders ORDER BY updated_at DESC").all();
    fillDerivedPositions=await db.prepare("SELECT symbol,SUM(open_qty) AS qty,SUM(open_qty*entry_price)/SUM(open_qty) AS avg_entry_price FROM paper_position_lots WHERE open_qty>0 GROUP BY symbol ORDER BY symbol").all();
  } catch { return fail("Could not read the complete paper ledger and fill-derived position ledger; fail-closed. Verify migration 0006.",503); }
  if(!control||control.mode!=="paper") return fail("Paper mode is required for read-only reconciliation.",503);
  let account,brokerPositions,brokerOrders=[],pageToken=null,pages=0;
  try {
    [account,brokerPositions]=await Promise.all([
      alpaca("/v2/account",key,secret),
      alpaca("/v2/positions",key,secret)
    ]);
    do {
      const query=new URLSearchParams({status:"all",limit:"500",direction:"desc",nested:"true"});
      if(pageToken) query.set("page_token",pageToken);
      const result=await alpaca("/v2/orders?"+query.toString(),key,secret);
      if(!Array.isArray(result)) throw new Error("BROKER_INVALID_ORDERS");
      brokerOrders.push(...result);
      pageToken=result.length===500 ? (result[result.length-1]?.id||null) : null;
      pages++;
      if(pages>=5 && pageToken) throw new Error("BROKER_ORDER_HISTORY_LIMIT");
    } while(pageToken);
  } catch(error) {
    const code=String(error?.message||"");
    return fail(code==="BROKER_ORDER_HISTORY_LIMIT"?"Broker order history exceeds the safe reconciliation page limit; results are incomplete.":code.startsWith("BROKER_HTTP_")?"Alpaca Paper reconciliation request failed ("+code.slice(12)+").":"Alpaca Paper data unavailable or malformed; reconciliation blocked.",503);
  }
  if(account?.status!=="ACTIVE"||account?.trading_blocked||account?.account_blocked) return fail("Alpaca Paper account is not active or is blocked.",503);
  if(!Array.isArray(brokerPositions)) return fail("Alpaca returned an invalid positions payload.",503);
  const posRows=Array.isArray(ledgerPositions?.results)?ledgerPositions.results:[];
  const orderRows=Array.isArray(ledgerOrders?.results)?ledgerOrders.results:[];
  const derivedRows=Array.isArray(fillDerivedPositions?.results)?fillDerivedPositions.results:[];
  const normPos=rows=>rows.map(p=>({symbol:String(p.symbol||"").toUpperCase(),qty:num(p.qty),avg:num(p.avg_entry_price),side:String(p.side||"").toLowerCase()})).sort((a,b)=>a.symbol.localeCompare(b.symbol));
  const bp=normPos(brokerPositions), lp=normPos(posRows), dp=normPos(derivedRows);
  const positionMismatches=[];
  const fillDerivedPositionMismatches=[];
  const posSymbols=[...new Set([...bp.map(x=>x.symbol),...lp.map(x=>x.symbol)])].sort();
  for(const symbol of posSymbols) {
    const b=bp.find(x=>x.symbol===symbol), l=lp.find(x=>x.symbol===symbol);
    if(!b||!l||b.qty===null||l.qty===null||b.avg===null||l.avg===null||!close(b.qty,l.qty)||!close(b.avg,l.avg,0.01)) {
      positionMismatches.push({symbol,broker:b||null,ledger:l||null});
    }
  }
  const derivedSymbols=[...new Set([...bp.map(x=>x.symbol),...dp.map(x=>x.symbol)])].sort();
  for(const symbol of derivedSymbols) {
    const broker=bp.find(x=>x.symbol===symbol), derived=dp.find(x=>x.symbol===symbol);
    if(!broker||!derived||broker.qty===null||derived.qty===null||broker.avg===null||derived.avg===null||
       !close(broker.qty,derived.qty)||!close(broker.avg,derived.avg,0.01)) {
      fillDerivedPositionMismatches.push({symbol,reason:"BROKER_FILL_DERIVED_POSITION_MISMATCH",broker:broker||null,fillDerived:derived||null});
    }
  }
  const brokerById=new Map();
  const orderMismatches=[];
  for(const order of brokerOrders) {
    const id=String(order?.id || "");
    if(!id || brokerById.has(id)) {
      orderMismatches.push({brokerOrderId:id||null,reason:"MISSING_OR_DUPLICATE_BROKER_ORDER_ID"});
      continue;
    }
    brokerById.set(id,order);
  }
  const ledgerByBrokerId=new Map();
  for(const l of orderRows) {
    const id=l.broker_order_id?String(l.broker_order_id):"";
    if(!id) { orderMismatches.push({ledgerOrderId:l.id,reason:"LEDGER_ORDER_MISSING_BROKER_ID"}); continue; }
    if(ledgerByBrokerId.has(id)) { orderMismatches.push({brokerOrderId:id,reason:"DUPLICATE_LEDGER_BROKER_ID"}); continue; }
    ledgerByBrokerId.set(id,l);
    const b=brokerById.get(id);
    if(!b) { orderMismatches.push({ledgerOrderId:l.id,brokerOrderId:id,reason:"LEDGER_ORDER_NOT_FOUND_AT_BROKER"}); continue; }
    const lqty=num(l.qty), bqty=num(b.qty);
    const fieldDiff=String(l.symbol||"").toUpperCase()!==String(b.symbol||"").toUpperCase() ||
      String(l.side||"").toLowerCase()!==String(b.side||"").toLowerCase() ||
      lqty===null||bqty===null||!close(lqty,bqty);
    if(fieldDiff) orderMismatches.push({ledgerOrderId:l.id,brokerOrderId:id,reason:"ORDER_FIELDS_DIFFER",ledger:{symbol:l.symbol,side:l.side,qty:l.qty},broker:{symbol:b.symbol,side:b.side,qty:b.qty}});
    const ledgerStatus=statusOf(l.status), brokerStatus=statusOf(b.status);
    if(!ledgerStatus || !brokerStatus || ledgerStatus!==brokerStatus) {
      orderMismatches.push({ledgerOrderId:l.id,brokerOrderId:id,reason:"ORDER_STATUS_DIFFER",ledgerStatus:ledgerStatus||null,brokerStatus:brokerStatus||null});
    }
    const brokerFilledQty=num(b.filled_qty);
    const brokerFilledAvg=num(b.filled_avg_price);
    const ledgerFill=storedFill(l);
    if(brokerFilledQty===null || ledgerFill.qty===null || !close(brokerFilledQty,ledgerFill.qty)) {
      orderMismatches.push({ledgerOrderId:l.id,brokerOrderId:id,reason:"FILLED_QUANTITY_NOT_RECONCILED",ledgerFilledQty:ledgerFill.qty,brokerFilledQty});
    }
    if(brokerFilledQty>0 && (brokerFilledAvg===null || ledgerFill.avg===null || !close(brokerFilledAvg,ledgerFill.avg,0.01))) {
      orderMismatches.push({ledgerOrderId:l.id,brokerOrderId:id,reason:"AVERAGE_FILL_PRICE_NOT_RECONCILED",ledgerFilledAvgPrice:ledgerFill.avg,brokerFilledAvgPrice:brokerFilledAvg});
    }
    const stopPrice=num(l.stop_price);
    if(String(l.side||"").toLowerCase()==="sell"){
      const directStopType=String(b.type||b.order_type||"").toLowerCase();
      const directStopTif=String(b.time_in_force||"").toLowerCase();
      const directStopPrice=num(b.stop_price);
      const leaves=num(b.leaves_qty)??(bqty-(brokerFilledQty??0));
      const position=bp.find(p=>p.symbol===String(l.symbol||"").toUpperCase())||null;
      const activeStop=["ACCEPTED","PARTIALLY_FILLED"].includes(brokerStatus);
      const terminalNoExposure=["FILLED","CANCELED","REJECTED"].includes(brokerStatus)&&brokerFilledQty===lqty;
      if(directStopType!=="stop"||directStopTif!=="gtc"||String(b.client_order_id||"")!==String(l.id)||stopPrice===null||directStopPrice===null||!close(directStopPrice,stopPrice)){
        orderMismatches.push({ledgerOrderId:l.id,brokerOrderId:id,reason:"STANDALONE_RECOVERY_STOP_FIELDS_MISMATCH"});
      }else if(activeStop&&(!position||position.qty===null||position.qty<=0||!close(position.qty,leaves)||String(b.side||"").toLowerCase()!=="sell")){
        orderMismatches.push({ledgerOrderId:l.id,brokerOrderId:id,reason:"STANDALONE_RECOVERY_STOP_DOES_NOT_COVER_POSITION",leaves,brokerPosition:position});
      }else if(!activeStop&&(!terminalNoExposure||position&&position.qty>0)){
        orderMismatches.push({ledgerOrderId:l.id,brokerOrderId:id,reason:"STANDALONE_RECOVERY_STOP_TERMINAL_WITH_REMAINING_EXPOSURE",brokerStatus,brokerFilledQty,brokerPosition:position});
      }
    }else{
      const noExposureTerminal=(brokerStatus==="REJECTED"&&brokerFilledQty===0)||(brokerStatus==="CANCELED"&&brokerFilledQty===0);
      if(!noExposureTerminal){
        if(stopPrice===null){
          orderMismatches.push({ledgerOrderId:l.id,brokerOrderId:id,reason:"PROTECTIVE_STOP_PRICE_MISSING",brokerFilledQty});
        }else{
          const stopCheck=verifyOtoStopLeg(b,{symbol:l.symbol,qty:lqty,stopPrice});
          const linkedRecovery=orderRows.find(x=>x.idempotency_key==="recovery:"+l.id)||null;
          const linkedRecoveryBroker=linkedRecovery?brokerById.get(String(linkedRecovery.broker_order_id||""))||null:null;
          const linkedRecoveryStatus=String(linkedRecoveryBroker?.status||"").toLowerCase();
          const linkedRecoveryActive=["new","accepted","pending_new","accepted_for_bidding","partially_filled"].includes(linkedRecoveryStatus);
          if(stopCheck.ok&&linkedRecoveryActive){
            orderMismatches.push({ledgerOrderId:l.id,brokerOrderId:id,reason:"DUPLICATE_ACTIVE_OTO_AND_STANDALONE_PROTECTIVE_STOPS"});
          }else if(!stopCheck.ok){
            const matchingPositions=bp.filter(p=>p.symbol===String(l.symbol||"").toUpperCase());
            const recoveryCheck=verifyStandaloneRecoveryStop({
              parent:b,parentRow:l,recoveryOrder:linkedRecoveryBroker,recoveryRow:linkedRecovery,
              brokerPosition:matchingPositions.length===1?matchingPositions[0]:null
            });
            if(!recoveryCheck.ok)orderMismatches.push({ledgerOrderId:l.id,brokerOrderId:id,reason:"PROTECTIVE_STOP_LEG_NOT_RECONCILED",stopReason:stopCheck.reason,recoveryReason:recoveryCheck.reason||null,expectedStopPrice:stopPrice});
          }
        }
      }
    }
  }
  for(const b of brokerOrders) {
    if(!ledgerByBrokerId.has(String(b.id))) orderMismatches.push({brokerOrderId:String(b.id),reason:"BROKER_ORDER_MISSING_FROM_LEDGER",symbol:b.symbol,status:b.status});
  }
  const mismatches=positionMismatches.length+fillDerivedPositionMismatches.length+orderMismatches.length;
  return Response.json({
    ok:mismatches===0,reconciled:mismatches===0,execution:false,
    status:mismatches===0?"RECONCILIATION_PASSED_READ_ONLY":"RECONCILIATION_MISMATCH_FAIL_CLOSED",
    account:{status:account.status,currency:account.currency},
    counts:{brokerPositions:bp.length,ledgerPositions:lp.length,fillDerivedPositions:dp.length,brokerOrders:brokerOrders.length,ledgerOrders:orderRows.length,orderHistoryPages:pages},
    mismatches:{positions:positionMismatches,fillDerivedPositions:fillDerivedPositionMismatches,orders:orderMismatches},
    warnings:["Read-only reconciliation. No broker orders were submitted, modified, or cancelled.","No ledger rows were changed.","Broker positions are compared against both the latest account snapshot mirror and the independent FIFO position ledger derived from Northstar-tracked fills.","Order status, cumulative filled quantity, and average fill price are compared; missing fill snapshots are treated as mismatches.","Order history is limited to the broker's most recent 2,500 orders; older ledger references may be reported missing.","This endpoint never changes execution-control settings or broker orders."],
    checkedAt:new Date().toISOString()
  },{status:mismatches===0?200:409,headers:H});
}

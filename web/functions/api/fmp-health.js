// Safe diagnostic for the FMP Pages secret binding.
// Never returns, logs, or echoes the API key.
export async function onRequestGet(context) {
  const env = context?.env || {};
  const key = env.FMP_API_KEY;
  const configured = typeof key === "string" && key.trim().length > 0;
  const result = {
    runtime: "Cloudflare Pages Functions",
    envObjectPresent: !!context?.env,
    fmpBindingPresent: Object.prototype.hasOwnProperty.call(env, "FMP_API_KEY"),
    fmpConfigured: configured,
    alpacaBindingPresent: Object.prototype.hasOwnProperty.call(env, "ALPACA_API_KEY_ID"),
    checkedAt: new Date().toISOString()
  };
  if (!configured) {
    return Response.json({...result, status:"MISSING_BINDING"}, {
      status:503, headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
    });
  }
  try {
    const url = new URL("https://financialmodelingprep.com/stable/historical-price-eod/full");
    url.searchParams.set("symbol","NVDA");
    url.searchParams.set("from",new Date(Date.now()-45*86400000).toISOString().slice(0,10));
    url.searchParams.set("to",new Date().toISOString().slice(0,10));
    url.searchParams.set("apikey",key);
    const response = await fetch(url.toString(), {
      headers:{"Accept":"application/json"}, signal:AbortSignal.timeout(12000)
    });
    const body = await response.json().catch(()=>null);
    const rows = Array.isArray(body) ? body : [];
    const message = !Array.isArray(body) ? String(body?.["Error Message"]||body?.message||body?.error||"Unexpected provider response").slice(0,180) : null;
    return Response.json({...result,status:response.ok?"FMP_REACHABLE":"FMP_REJECTED",httpStatus:response.status,rowCount:rows.length,latestDate:rows.map(x=>x?.date).filter(Boolean).sort().at(-1)||null,providerMessage:message}, {
      status:response.ok?200:502, headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
    });
  } catch (error) {
    return Response.json({...result,status:"FMP_NETWORK_ERROR",errorName:error?.name||"Error"}, {
      status:502, headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
    });
  }
}

import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet } from "../web/functions/api/quote.js";

const request = () => new Request("https://northstar.test/api/quote?ticker=AAPL");
const yahooPayload = ({ price = 100, timestamp = 1794492000 } = {}) => ({
  chart: { result: [{
    meta: { longName: "Example Inc.", currency: "USD", regularMarketTime: timestamp },
    timestamp: [timestamp],
    indicators: { quote: [{ close: [price] }] }
  }] }
});

test("Yahoo quotes require a positive finite price and an observation timestamp", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname.includes("finance.yahoo.com")) return Response.json(yahooPayload({ price: 0, timestamp: 0 }));
    if (url.hostname === "api.nasdaq.com") return Response.json({ data: {
      symbol: "AAPL", primaryData: { lastSalePrice: "$0.00", lastTradeTimestamp: "" }
    } });
    throw new Error("Unexpected provider request: " + url.hostname);
  };
  try {
    const response = await onRequestGet({ request: request(), env: {} });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /unavailable/);
  } finally {
    globalThis.fetch = original;
  }
});

test("untimestamped Nasdaq data falls through to a valid timestamped Finnhub quote", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname.includes("finance.yahoo.com")) return new Response("unavailable", { status: 503 });
    if (url.hostname === "api.nasdaq.com") return Response.json({ data: {
      symbol: "AAPL", primaryData: { lastSalePrice: "$100.00", lastTradeTimestamp: "" }
    } });
    if (url.hostname === "finnhub.io") return Response.json({ c: 101, pc: 99, d: 2, dp: 2.02, t: 1794492000 });
    throw new Error("Unexpected provider request: " + url.hostname);
  };
  try {
    const response = await onRequestGet({ request: request(), env: { FINNHUB_API_KEY: "test" } });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.source, "Finnhub");
    assert.equal(payload.price, 101);
    assert.ok(Number.isFinite(Date.parse(payload.quoteTime)));
  } finally {
    globalThis.fetch = original;
  }
});

test("valid positive timestamped Yahoo quote remains the preferred source", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname.includes("finance.yahoo.com")) return Response.json(yahooPayload());
    throw new Error("Unexpected fallback provider request: " + url.hostname);
  };
  try {
    const response = await onRequestGet({ request: request(), env: {} });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.source, "Yahoo Finance chart endpoint");
    assert.equal(payload.price, 100);
    assert.ok(Number.isFinite(Date.parse(payload.quoteTime)));
  } finally {
    globalThis.fetch = original;
  }
});

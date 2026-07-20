import { describe, expect, test } from "bun:test";
import { IJT_SUPABASE_URL } from "../auth";
import { createIjtDataCapability } from "./capability";
import { createIjtDataClient } from "./client";

const publishableKey = `sb_publishable_${"a".repeat(24)}`;
const config = { supabaseUrl: IJT_SUPABASE_URL, publishableKey };

function json(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
}

describe("IJT canonical Supabase data", () => {
  test("fetches credentials per request and pins explicit position columns", async () => {
    let credentialCalls = 0;
    let request: { url: URL; headers: Headers } | undefined;
    const client = createIjtDataClient({
      config,
      credentialProvider: async () => {
        credentialCalls += 1;
        return "access-token-1234567890";
      },
      fetcher: (async (input: string | URL | Request, init?: RequestInit) => {
        request = { url: new URL(String(input)), headers: new Headers(init?.headers) };
        return json([{
          account_id: "DU123", conid: 265598, ticker: "AAPL", asset_class: "STK",
          position: 10, avg_price: 100, market_price: 110, market_value: 1100,
          unrealized_pnl: 100, currency: "USD", as_of: "2026-07-19T12:00:00Z",
          fetched_at: "2026-07-19T12:01:00Z",
        }]);
      }) as typeof fetch,
    });

    const positions = await client.fetchIbkrPositions();

    expect(credentialCalls).toBe(1);
    expect(request?.url.pathname).toBe("/rest/v1/v_ibkr_positions");
    expect(request?.url.searchParams.get("select")).toContain("account_id,conid,ticker");
    expect(request?.url.searchParams.get("order")).toBe("ticker.asc");
    expect(request?.headers.get("authorization")).toBe("Bearer access-token-1234567890");
    expect(positions[0]?.ticker).toBe("AAPL");
  });

  test("coerces only documented nullable numeric fields to zero", async () => {
    const client = createIjtDataClient({
      config,
      credentialProvider: async () => "access-token-1234567890",
      fetcher: (async () => json([{
        account_id: "DU123", net_liquidation: 1000, total_cash: 200, accrued_cash: 0,
        stock_mv: null, option_mv: null, futures_mv: null, unrealized_pnl: null,
        realized_pnl: null, currency: "USD", as_of: "2026-07-19T12:00:00Z",
        fetched_at: "2026-07-19T12:01:00Z",
      }])) as typeof fetch,
    });

    await expect(client.fetchIbkrAccountSummary()).resolves.toMatchObject({
      stock_mv: 0,
      option_mv: 0,
      unrealized_pnl: 0,
    });
  });

  test("returns only rows from the latest COT report date", async () => {
    const cot = (reportDate: string, market: string) => ({
      report_date: reportDate, market_name: market, cftc_commodity_code: "001",
      long_noncommercial: 1, short_noncommercial: 2, long_commercial: 3,
      short_commercial: 4, asset_mgr_long: null, asset_mgr_short: null,
      swap_long: null, swap_short: null, as_of: "2026-07-19T12:00:00Z",
    });
    const client = createIjtDataClient({
      config,
      credentialProvider: async () => "access-token-1234567890",
      fetcher: (async () => json([
        cot("2026-07-15", "Gold"),
        cot("2026-07-15", "Oil"),
        cot("2026-07-08", "Gold"),
      ])) as typeof fetch,
    });

    expect((await client.fetchCotReport()).map(({ market_name }) => market_name))
      .toEqual(["Gold", "Oil"]);
  });

  test("rejects malformed canonical rows instead of returning partial data", async () => {
    const client = createIjtDataClient({
      config,
      credentialProvider: async () => "access-token-1234567890",
      fetcher: (async () => json([{ ticker: "AAPL" }])) as typeof fetch,
    });
    await expect(client.fetchIbkrPositions()).rejects.toThrow("invalid-supabase-row");
  });

  test("declares all data operations renderer-safe and read-only", () => {
    const capability = createIjtDataCapability(null);
    expect(Object.keys(capability.operations)).toEqual([
      "positions", "accountSummary", "cot", "lpRoster", "navHistory",
    ]);
    for (const operation of Object.values(capability.operations)) {
      expect(operation.rendererSafe).toBe(true);
      expect(operation.kind).toBe("read");
      expect(operation.cli?.sideEffectLevel).toBe("none");
    }
  });
});

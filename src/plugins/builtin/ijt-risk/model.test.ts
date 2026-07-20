import { describe, expect, test } from "bun:test";
import type { IjtPortfolioSnapshot } from "../../../ijt/data";
import { buildIjtPortfolioSimulationRequest, type IjtHistorySeries } from "./model";

function snapshot(): IjtPortfolioSnapshot {
  return {
    accountSummary: null,
    positions: [{
      account_id: "DU123",
      conid: 265598,
      ticker: "AAPL",
      asset_class: "STK",
      position: 100,
      avg_price: 175,
      market_price: 210,
      market_value: 21_000,
      unrealized_pnl: 3_500,
      currency: "USD",
      as_of: "2026-07-18T20:00:00Z",
      fetched_at: "2026-07-18T20:01:00Z",
    }],
  };
}

function history(stale = false): IjtHistorySeries {
  return {
    symbol: "AAPL",
    source: "yahoo",
    fetchedAt: Date.parse("2026-07-18T20:02:00Z"),
    stale,
    points: Array.from({ length: 12 }, (_, index) => ({
      date: new Date(Date.UTC(2026, 6, 1 + index)),
      close: 100 * (1 + index * 0.01 + (index % 2 === 0 ? 0.003 : -0.002)),
    })),
  };
}

describe("IJT portfolio simulation adapter", () => {
  test("derives bounded GBM inputs from canonical positions and aligned native history", () => {
    const request = buildIjtPortfolioSimulationRequest(snapshot(), [history()]);

    expect(request.kind).toBe("ready");
    if (request.kind !== "ready") return;
    expect(request.input.initialValue).toBe(21_000);
    expect(request.input.seed).toBe(20_260_719);
    expect(request.input.dailyMeanReturn).toBeGreaterThan(0);
    expect(request.input.dailyVolatility).toBeGreaterThan(0);
    expect(request.currency).toBe("USD");
    expect(request.provenance).toEqual({
      positionAsOf: "2026-07-18T20:01:00Z",
      historyAsOf: "2026-07-12",
      sources: ["yahoo"],
      observations: 11,
      stale: false,
    });
  });

  test("fails closed on stale histories", () => {
    expect(buildIjtPortfolioSimulationRequest(snapshot(), [history(true)]))
      .toEqual({ kind: "insufficient", reason: "history-unavailable:AAPL" });
  });

  test("reports an honest empty canonical portfolio", () => {
    expect(buildIjtPortfolioSimulationRequest({ accountSummary: null, positions: [] }, []))
      .toEqual({ kind: "no-positions" });
  });
});

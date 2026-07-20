import { describe, expect, test } from "bun:test";
import type { IjtPortfolioSnapshot } from "../../../ijt/data";
import type { IjtHistorySeries } from "./model";
import { calculateIjtRiskSnapshot, PARAMETRIC_VAR_Z } from "./risk-model";

function series(symbol: string, multiplier: number): IjtHistorySeries {
  let value = 100;
  const points = Array.from({ length: 13 }, (_, index) => {
    if (index > 0) value *= 1 + multiplier * (index % 3 === 0 ? -0.01 : 0.008);
    return { date: new Date(Date.UTC(2026, 6, 1 + index)), close: value };
  });
  return { symbol, points, source: "native-test", fetchedAt: 1, stale: false };
}

function portfolio(): IjtPortfolioSnapshot {
  const base = {
    account_id: "DU123",
    asset_class: "STK",
    avg_price: 100,
    market_price: 100,
    unrealized_pnl: 0,
    currency: "USD",
    as_of: "2026-07-18T20:00:00Z",
    fetched_at: "2026-07-18T20:01:00Z",
  };
  return {
    accountSummary: {
      account_id: "DU123",
      net_liquidation: 100_000,
      total_cash: 20_000,
      accrued_cash: 0,
      stock_mv: 80_000,
      option_mv: 0,
      futures_mv: 0,
      unrealized_pnl: 0,
      realized_pnl: 0,
      currency: "USD",
      as_of: base.as_of,
      fetched_at: base.fetched_at,
    },
    positions: [
      { ...base, conid: 1, ticker: "AAPL", position: 600, market_value: 60_000 },
      { ...base, conid: 2, ticker: "MSFT", position: 200, market_value: 20_000 },
    ],
  };
}

describe("IJT deterministic risk model", () => {
  test("ports exposure, VaR, concentration, correlation, and beta shock semantics", () => {
    const risk = calculateIjtRiskSnapshot(portfolio(), [
      series("AAPL", 1.5),
      series("MSFT", 0.5),
      series("SPY", 1),
    ]);

    expect(risk.grossExposure).toBe(80_000);
    expect(risk.netExposure).toBe(80_000);
    expect(risk.betaAdjustedExposure).toBeCloseTo(100_000, 0);
    expect(risk.valueAtRisk).not.toBeNull();
    expect(risk.valueAtRisk!).toBeGreaterThan(0);
    expect(risk.returnObservations).toBe(12);
    expect(risk.correlationSymbols).toEqual(["AAPL", "MSFT"]);
    expect(risk.correlations[0]?.values[0]).toBeCloseTo(1, 5);
    expect(risk.watchItems).toEqual([
      { symbol: "AAPL", weight: 0.75, policyMaximum: 0.25 },
    ]);
    expect(risk.scenarios.map(({ label }) => label)).toEqual(["SPY -5%", "SPY -2%", "SPY +2%"]);
    expect(risk.scenarios[0]?.pnl).toBeCloseTo(-5_000, 0);
    expect(PARAMETRIC_VAR_Z).toBe(1.645);
    expect(risk.sources).toEqual(["native-test"]);
  });

  test("keeps history-dependent values unavailable when SPY is missing", () => {
    const risk = calculateIjtRiskSnapshot(portfolio(), [series("AAPL", 1.5), series("MSFT", 0.5)]);
    expect(risk.betaAdjustedExposure).toBeNull();
    expect(risk.scenarios).toEqual([]);
    expect(risk.valueAtRisk).not.toBeNull();
  });
});

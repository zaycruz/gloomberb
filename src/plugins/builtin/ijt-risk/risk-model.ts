import type { IjtPortfolioSnapshot } from "../../../ijt/data";
import { correlateDatedReturns } from "../correlation/compute";
import {
  computeDatedBeta,
  computeDatedReturns,
  computeWeightedPortfolioReturns,
  type DatedReturn,
} from "../analytics/metrics";
import type { IjtHistorySeries } from "./model";

export interface ConcentrationWatchItem {
  symbol: string;
  weight: number;
  policyMaximum: number;
}

export interface RiskScenario {
  label: string;
  shock: number;
  pnl: number;
}

export interface RiskSnapshot {
  grossExposure: number;
  netExposure: number;
  betaAdjustedExposure: number | null;
  valueAtRisk: number | null;
  returnObservations: number;
  correlationSymbols: string[];
  correlations: Array<{ symbol: string; values: Array<number | null> }>;
  scenarios: RiskScenario[];
  watchItems: ConcentrationWatchItem[];
  positionAsOf: string;
  historyAsOf: string;
  sources: string[];
}

export const PARAMETRIC_VAR_Z = 1.645;
export const SINGLE_NAME_POLICY_MAX = 0.25;
const MIN_RETURN_OBSERVATIONS = 10;
const MAX_CORRELATION_HOLDINGS = 4;
const SCENARIO_SHOCKS = [-0.05, -0.02, 0.02] as const;

function pairObservationCount(left: DatedReturn[], right: DatedReturn[]): number {
  const rightDates = new Set(right.map(({ dateKey }) => dateKey));
  return left.reduce((count, { dateKey }) => count + Number(rightDates.has(dateKey)), 0);
}

function commonDates(series: DatedReturn[][]): Set<string> {
  if (series.length === 0) return new Set();
  const dates = new Set(series[0]!.map(({ dateKey }) => dateKey));
  for (const returns of series.slice(1)) {
    const available = new Set(returns.map(({ dateKey }) => dateKey));
    for (const date of dates) if (!available.has(date)) dates.delete(date);
  }
  return dates;
}

function sampleStandardDeviation(values: number[]): number | null {
  if (values.length < MIN_RETURN_OBSERVATIONS) return null;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0)
    / (values.length - 1);
  return Number.isFinite(variance) ? Math.sqrt(variance) : null;
}

/** Ports IJT RISK v1 exactly over canonical positions and native daily histories. */
export function calculateIjtRiskSnapshot(
  snapshot: IjtPortfolioSnapshot,
  histories: IjtHistorySeries[],
): RiskSnapshot {
  const positions = snapshot.positions.filter((position) => (
    position.ticker.trim().length > 0
    && Number.isFinite(position.market_value)
    && position.market_value !== 0
  ));
  const exposures = new Map<string, { marketValue: number; grossMarketValue: number }>();
  for (const position of positions) {
    const symbol = position.ticker.trim().toUpperCase();
    const current = exposures.get(symbol) ?? { marketValue: 0, grossMarketValue: 0 };
    current.marketValue += position.market_value;
    current.grossMarketValue += Math.abs(position.market_value);
    exposures.set(symbol, current);
  }
  const symbolExposures = [...exposures.entries()]
    .map(([symbol, values]) => ({ symbol, ...values }))
    .filter(({ grossMarketValue }) => grossMarketValue > 0);
  const holdings = symbolExposures.filter(({ marketValue }) => marketValue !== 0);
  const grossExposure = positions.reduce((sum, position) => sum + Math.abs(position.market_value), 0);
  const netExposure = positions.reduce((sum, position) => sum + position.market_value, 0);
  const usableHistories = new Map(histories
    .filter((history) => !history.stale && history.points.length > 0 && history.source.trim().length > 0)
    .map((history) => [history.symbol.trim().toUpperCase(), history]));
  const returnsBySymbol = new Map([...usableHistories.entries()].map(([symbol, history]) => [
    symbol,
    computeDatedReturns(history.points),
  ]));
  const marketReturns = returnsBySymbol.get("SPY");
  const betas = new Map<string, number>();
  if (marketReturns && marketReturns.length >= MIN_RETURN_OBSERVATIONS) {
    for (const holding of holdings) {
      const returns = returnsBySymbol.get(holding.symbol);
      if (!returns || pairObservationCount(returns, marketReturns) < MIN_RETURN_OBSERVATIONS) continue;
      const beta = computeDatedBeta(returns, marketReturns);
      if (beta !== null && Number.isFinite(beta)) betas.set(holding.symbol, beta);
    }
  }
  const betaAdjustedExposure = holdings.length > 0 && holdings.every(({ symbol }) => betas.has(symbol))
    ? holdings.reduce((sum, holding) => sum + holding.marketValue * betas.get(holding.symbol)!, 0)
    : null;

  const holdingReturns = holdings.map(({ symbol }) => returnsBySymbol.get(symbol) ?? []);
  const overlap = commonDates(holdingReturns);
  const nettedGrossExposure = holdings.reduce((sum, holding) => sum + Math.abs(holding.marketValue), 0);
  const netLiquidation = snapshot.accountSummary?.net_liquidation ?? Number.NaN;
  const weightedReturns = holdings.length > 0 && overlap.size >= MIN_RETURN_OBSERVATIONS && nettedGrossExposure > 0
    ? computeWeightedPortfolioReturns(holdings.map((holding, index) => ({
      weight: Math.abs(holding.marketValue),
      returns: holdingReturns[index]!
        .filter(({ dateKey }) => overlap.has(dateKey))
        .map(({ dateKey, value }) => ({ dateKey, value: Math.sign(holding.marketValue) * value })),
    }))).map(({ dateKey, value }) => ({
      dateKey,
      value: Number.isFinite(netLiquidation) && netLiquidation > 0
        ? value * (nettedGrossExposure / netLiquidation)
        : Number.NaN,
    }))
    : [];
  const dailyVolatility = sampleStandardDeviation(weightedReturns.map(({ value }) => value).filter(Number.isFinite));
  const valueAtRisk = dailyVolatility !== null && Number.isFinite(netLiquidation) && netLiquidation > 0
    ? PARAMETRIC_VAR_Z * dailyVolatility * netLiquidation
    : null;

  const topHoldings = [...symbolExposures]
    .sort((left, right) => right.grossMarketValue - left.grossMarketValue)
    .slice(0, MAX_CORRELATION_HOLDINGS)
    .filter(({ symbol }) => (returnsBySymbol.get(symbol)?.length ?? 0) >= MIN_RETURN_OBSERVATIONS);
  const correlations = topHoldings.map(({ symbol }) => ({
    symbol,
    values: topHoldings.map((other) => {
      const left = returnsBySymbol.get(symbol)!;
      const right = returnsBySymbol.get(other.symbol)!;
      return pairObservationCount(left, right) < MIN_RETURN_OBSERVATIONS
        ? null
        : correlateDatedReturns(left, right, 2).correlation;
    }),
  }));
  const scenarios = betaAdjustedExposure === null ? [] : SCENARIO_SHOCKS.map((shock) => ({
    label: `SPY ${shock > 0 ? "+" : ""}${(shock * 100).toFixed(0)}%`,
    shock,
    pnl: betaAdjustedExposure * shock,
  }));
  const watchItems = grossExposure > 0 ? symbolExposures
    .map(({ symbol, grossMarketValue }) => ({
      symbol,
      weight: grossMarketValue / grossExposure,
      policyMaximum: SINGLE_NAME_POLICY_MAX,
    }))
    .filter(({ weight }) => weight > SINGLE_NAME_POLICY_MAX)
    .sort((left, right) => right.weight - left.weight) : [];
  const used = [...usableHistories.values()];

  return {
    grossExposure,
    netExposure,
    betaAdjustedExposure,
    valueAtRisk,
    returnObservations: weightedReturns.length,
    correlationSymbols: topHoldings.map(({ symbol }) => symbol),
    correlations,
    scenarios,
    watchItems,
    positionAsOf: positions.map((position) => position.fetched_at || position.as_of).sort()[0] ?? "unavailable",
    historyAsOf: used.flatMap((history) => history.points.map((point) => point.date.toISOString().slice(0, 10))).sort().at(-1) ?? "unavailable",
    sources: [...new Set(used.map((history) => history.source))].sort(),
  };
}

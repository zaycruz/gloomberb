import type { IjtPortfolioSnapshot } from "../../../ijt/data";
import type { MonteCarloSimulationInput } from "../../../ijt/risk/simulation";
import type { PricePoint } from "../../../types/financials";
import {
  computeDatedReturns,
  computeWeightedPortfolioReturns,
} from "../analytics/metrics";

export interface IjtHistorySeries {
  symbol: string;
  points: PricePoint[];
  source: string;
  fetchedAt: number | null;
  stale: boolean;
}

export interface SimulationProvenance {
  positionAsOf: string;
  historyAsOf: string;
  sources: string[];
  observations: number;
  stale: boolean;
}

export type IjtPortfolioSimulationRequest =
  | { kind: "no-positions" }
  | { kind: "insufficient"; reason: string }
  | {
    kind: "ready";
    input: MonteCarloSimulationInput;
    currency: string;
    provenance: SimulationProvenance;
  };

function sampleStandardDeviation(values: number[]): number {
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(
    values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1),
  );
}

export function buildIjtPortfolioSimulationRequest(
  snapshot: IjtPortfolioSnapshot,
  histories: IjtHistorySeries[],
  seed = 20_260_719,
): IjtPortfolioSimulationRequest {
  const positions = snapshot.positions.filter((position) => (
    position.ticker.trim().length > 0
    && Number.isFinite(position.position)
    && position.position !== 0
    && Number.isFinite(position.market_value)
    && position.market_value !== 0
  ));
  if (positions.length === 0) return { kind: "no-positions" };

  const currencies = [...new Set(positions.map((position) => position.currency.trim().toUpperCase()))];
  if (currencies.length !== 1) return { kind: "insufficient", reason: "multiple-position-currencies" };
  const historyBySymbol = new Map(histories.map((history) => [history.symbol.toUpperCase(), history]));
  const returnsBySymbol = new Map<string, ReturnType<typeof computeDatedReturns>>();
  for (const symbol of new Set(positions.map((position) => position.ticker.trim().toUpperCase()))) {
    const history = historyBySymbol.get(symbol);
    if (!history || history.stale) return { kind: "insufficient", reason: `history-unavailable:${symbol}` };
    const returns = computeDatedReturns(history.points);
    if (returns.length < 10) return { kind: "insufficient", reason: `insufficient-history:${symbol}` };
    returnsBySymbol.set(symbol, returns);
  }

  const dateSets = [...returnsBySymbol.values()].map((returns) => new Set(returns.map(({ dateKey }) => dateKey)));
  const firstReturns = [...returnsBySymbol.values()][0] ?? [];
  const commonDates = new Set(
    firstReturns
      .map(({ dateKey }) => dateKey)
      .filter((dateKey) => dateSets.every((dates) => dates.has(dateKey))),
  );
  if (commonDates.size < 10) return { kind: "insufficient", reason: "insufficient-common-history" };

  const grossValue = positions.reduce((sum, position) => sum + Math.abs(position.market_value), 0);
  const portfolioReturns = computeWeightedPortfolioReturns(positions.map((position) => ({
    weight: Math.abs(position.market_value) / grossValue,
    returns: returnsBySymbol.get(position.ticker.trim().toUpperCase())!
      .filter(({ dateKey }) => commonDates.has(dateKey))
      .map((point) => ({
        ...point,
        value: Math.sign(position.market_value) * point.value,
      })),
  }))).map(({ value }) => value);
  if (portfolioReturns.length < 10) return { kind: "insufficient", reason: "insufficient-portfolio-history" };

  const dailyMeanReturn = portfolioReturns.reduce((sum, value) => sum + value, 0)
    / portfolioReturns.length;
  const dailyVolatility = sampleStandardDeviation(portfolioReturns);
  const usedHistories = [...new Set(positions.map((position) => position.ticker.trim().toUpperCase()))]
    .map((symbol) => historyBySymbol.get(symbol)!);
  const historyAsOf = usedHistories
    .flatMap((history) => history.points.map((point) => point.date.toISOString().slice(0, 10)))
    .sort()
    .at(-1) ?? "unavailable";
  const positionAsOf = positions
    .map((position) => position.fetched_at || position.as_of)
    .sort()[0] ?? "unavailable";

  return {
    kind: "ready",
    input: {
      initialValue: grossValue,
      dailyMeanReturn,
      dailyVolatility,
      seed,
    },
    currency: currencies[0]!,
    provenance: {
      positionAsOf,
      historyAsOf,
      sources: [...new Set(usedHistories.map((history) => history.source || "unknown"))].sort(),
      observations: portfolioReturns.length,
      stale: usedHistories.some((history) => history.stale),
    },
  };
}

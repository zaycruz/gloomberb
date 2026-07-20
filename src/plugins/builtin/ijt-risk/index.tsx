import { useEffect, useMemo, useState } from "react";
import { Box, Text, TextAttributes } from "../../../ui";
import { colors } from "../../../theme/colors";
import type { IjtPortfolioSnapshot } from "../../../ijt/data";
import type { MonteCarloSimulationResult } from "../../../ijt/risk/simulation";
import { useChartQueries } from "../../../market-data/hooks";
import type { ChartRequest } from "../../../market-data/request-types";
import { buildChartKey } from "../../../market-data/selectors";
import type { GloomPlugin, PaneProps } from "../../../types/plugin";
import { formatCurrency } from "../../../utils/format";
import { useCapabilityInvoker } from "../../runtime";
import {
  buildIjtPortfolioSimulationRequest,
  type IjtHistorySeries,
  type SimulationProvenance,
} from "./model";
import { calculateIjtRiskSnapshot, type RiskSnapshot } from "./risk-model";

type SnapshotState =
  | { status: "loading" }
  | { status: "ready"; snapshot: IjtPortfolioSnapshot }
  | { status: "error" };

function usePortfolioSnapshot(): SnapshotState {
  const invoke = useCapabilityInvoker();
  const [state, setState] = useState<SnapshotState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    void invoke<IjtPortfolioSnapshot>("plugin-service.ijt-data", "portfolioSnapshot", {}).then(
      (snapshot) => { if (active) setState({ status: "ready", snapshot }); },
      () => { if (active) setState({ status: "error" }); },
    );
    return () => { active = false; };
  }, [invoke]);
  return state;
}

function simulationMoney(value: number, currency: string): string {
  return formatCurrency(value, currency);
}

export function SimulationResultView({
  result,
  currency,
  provenance,
}: {
  result: MonteCarloSimulationResult;
  currency: string;
  provenance: SimulationProvenance;
}) {
  const terminal = result.bands.at(-1)!;
  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text fg={colors.accent} attributes={TextAttributes.BOLD}>IJT MONTE CARLO · SEEDED GBM</Text>
      <Text fg={colors.textBright} attributes={TextAttributes.BOLD}>
        MEDIAN {simulationMoney(terminal.p50, currency)}   RUIN {(result.probabilityOfRuin * 100).toFixed(2)}%
      </Text>
      <Text fg={colors.text}>
        P01 {simulationMoney(terminal.p01, currency)}   P25 {simulationMoney(terminal.p25, currency)}
      </Text>
      <Text fg={colors.text}>
        P75 {simulationMoney(terminal.p75, currency)}   P99 {simulationMoney(terminal.p99, currency)}
      </Text>
      <Text fg={colors.border}>DAY       P01             P25             P50             P75             P99</Text>
      {result.bands.map((band) => (
        <Text key={band.day} fg={colors.text}>
          {String(band.day).padEnd(10)}
          {simulationMoney(band.p01, currency).padEnd(16)}
          {simulationMoney(band.p25, currency).padEnd(16)}
          {simulationMoney(band.p50, currency).padEnd(16)}
          {simulationMoney(band.p75, currency).padEnd(16)}
          {simulationMoney(band.p99, currency)}
        </Text>
      ))}
      <Text fg={colors.textMuted}>
        {result.modelVersion} · SEED {result.seed} · {result.paths} PATHS · {result.days} DAYS
      </Text>
      <Text fg={colors.textMuted}>
        {provenance.sources.join(" + ")} · {provenance.observations} COMMON RETURNS · HISTORY {provenance.historyAsOf}
      </Text>
      <Text fg={colors.textMuted}>POSITIONS {provenance.positionAsOf}</Text>
    </Box>
  );
}

export function IjtSimulationPane(_props: PaneProps) {
  const invoke = useCapabilityInvoker();
  const snapshotState = usePortfolioSnapshot();
  const requests = useMemo<ChartRequest[]>(() => {
    if (snapshotState.status !== "ready") return [];
    return [...new Set(snapshotState.snapshot.positions.map(({ ticker }) => ticker.trim().toUpperCase()))]
      .filter(Boolean)
      .sort()
      .map((symbol) => ({
        instrument: { symbol, exchange: "" },
        bufferRange: "1Y",
        granularity: "resolution" as const,
        resolution: "1d" as const,
      }));
  }, [snapshotState]);
  const chartEntries = useChartQueries(requests);
  const histories = useMemo<IjtHistorySeries[]>(() => requests.flatMap((request) => {
    const entry = chartEntries.get(buildChartKey(request));
    const points = entry?.data ?? entry?.lastGoodData;
    if (!points) return [];
    return [{
      symbol: request.instrument.symbol,
      points,
      source: entry?.source ?? "unknown",
      fetchedAt: entry?.fetchedAt ?? null,
      stale: entry?.staleAt != null && Date.now() > entry.staleAt,
    }];
  }), [chartEntries, requests]);
  const request = useMemo(() => (
    snapshotState.status === "ready"
      ? buildIjtPortfolioSimulationRequest(snapshotState.snapshot, histories)
      : null
  ), [histories, snapshotState]);
  const [simulation, setSimulation] = useState<
    | { status: "idle" | "loading" | "error" }
    | { status: "ready"; result: MonteCarloSimulationResult }
  >({ status: "idle" });

  useEffect(() => {
    if (!request || request.kind !== "ready") return;
    let active = true;
    setSimulation({ status: "loading" });
    void invoke<MonteCarloSimulationResult>("plugin-service.ijt-simulation", "run", request.input).then(
      (result) => { if (active) setSimulation({ status: "ready", result }); },
      () => { if (active) setSimulation({ status: "error" }); },
    );
    return () => { active = false; };
  }, [invoke, request]);

  if (snapshotState.status === "loading") {
    return <Box padding={1}><Text fg={colors.textDim}>Loading canonical IJT positions...</Text></Box>;
  }
  if (snapshotState.status === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text fg={colors.negative} attributes={TextAttributes.BOLD}>IJT SIMULATION UNAVAILABLE</Text>
        <Text fg={colors.textDim}>Authenticate with IJT Login, then reopen this pane.</Text>
      </Box>
    );
  }
  if (request?.kind === "no-positions") {
    return <Box padding={1}><Text fg={colors.textMuted}>NO CANONICAL POSITIONS</Text></Box>;
  }
  if (!request || request.kind === "insufficient") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text fg={colors.warning} attributes={TextAttributes.BOLD}>INSUFFICIENT CURRENT PRICE HISTORY</Text>
        <Text fg={colors.textDim}>{request?.kind === "insufficient" ? request.reason : "Loading 1Y daily histories..."}</Text>
      </Box>
    );
  }
  if (simulation.status === "ready") {
    return <SimulationResultView result={simulation.result} currency={request.currency} provenance={request.provenance} />;
  }
  return (
    <Box padding={1}>
      <Text fg={simulation.status === "error" ? colors.negative : colors.textDim}>
        {simulation.status === "error" ? "SIMULATION FAILED CLOSED" : "Running bounded seeded simulation..."}
      </Text>
    </Box>
  );
}

function riskMoney(value: number | null, currency: string): string {
  return value === null ? "—" : formatCurrency(value, currency);
}

export function RiskResultView({ snapshot, currency }: { snapshot: RiskSnapshot; currency: string }) {
  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text fg={colors.accent} attributes={TextAttributes.BOLD}>IJT PORTFOLIO RISK MANAGER</Text>
      <Text fg={colors.textBright} attributes={TextAttributes.BOLD}>
        GROSS {riskMoney(snapshot.grossExposure, currency)}   NET {riskMoney(snapshot.netExposure, currency)}
      </Text>
      <Text fg={colors.text}>
        BETA-ADJ {riskMoney(snapshot.betaAdjustedExposure, currency)}   95% 1D VaR {riskMoney(snapshot.valueAtRisk, currency)}
      </Text>
      <Text fg={colors.textMuted}>{snapshot.returnObservations} COMMON LEVERED RETURNS · Z 1.645</Text>
      <Text fg={colors.border}>CONCENTRATION WATCH · POLICY MAX 25%</Text>
      {snapshot.watchItems.length > 0 ? snapshot.watchItems.map((item) => (
        <Text key={item.symbol} fg={colors.warning}>
          {item.symbol.padEnd(12)} {(item.weight * 100).toFixed(1)}% GROSS WEIGHT
        </Text>
      )) : <Text fg={colors.positive}>No concentration breaches.</Text>}
      <Text fg={colors.border}>DETERMINISTIC BETA SHOCKS</Text>
      {snapshot.scenarios.length > 0 ? snapshot.scenarios.map((scenario) => (
        <Text key={scenario.label} fg={scenario.pnl >= 0 ? colors.positive : colors.negative}>
          {scenario.label.padEnd(12)} {riskMoney(scenario.pnl, currency)}
        </Text>
      )) : <Text fg={colors.textDim}>Beta scenarios unavailable.</Text>}
      <Text fg={colors.border}>TOP-HOLDING CORRELATIONS</Text>
      {snapshot.correlations.length > 0 ? snapshot.correlations.map((row) => (
        <Text key={row.symbol} fg={colors.text}>
          {row.symbol.padEnd(10)} {row.values.map((value) => value === null ? "   —" : value.toFixed(2).padStart(5)).join(" ")}
        </Text>
      )) : <Text fg={colors.textDim}>Correlation history unavailable.</Text>}
      <Text fg={colors.textMuted}>
        {snapshot.sources.join(" + ") || "NO PRICE SOURCE"} · HISTORY {snapshot.historyAsOf}
      </Text>
      <Text fg={colors.textMuted}>POSITIONS {snapshot.positionAsOf}</Text>
    </Box>
  );
}

export function IjtRiskPane(_props: PaneProps) {
  const snapshotState = usePortfolioSnapshot();
  const requests = useMemo<ChartRequest[]>(() => {
    if (snapshotState.status !== "ready") return [];
    return [...new Set([
      ...snapshotState.snapshot.positions.map(({ ticker }) => ticker.trim().toUpperCase()),
      "SPY",
    ])]
      .filter(Boolean)
      .sort()
      .map((symbol) => ({
        instrument: { symbol, exchange: "" },
        bufferRange: "1Y",
        granularity: "resolution" as const,
        resolution: "1d" as const,
      }));
  }, [snapshotState]);
  const chartEntries = useChartQueries(requests);
  const histories = useMemo<IjtHistorySeries[]>(() => requests.flatMap((request) => {
    const entry = chartEntries.get(buildChartKey(request));
    const points = entry?.data ?? entry?.lastGoodData;
    if (!points) return [];
    return [{
      symbol: request.instrument.symbol,
      points,
      source: entry?.source ?? "unknown",
      fetchedAt: entry?.fetchedAt ?? null,
      stale: entry?.staleAt != null && Date.now() > entry.staleAt,
    }];
  }), [chartEntries, requests]);

  if (snapshotState.status === "loading") {
    return <Box padding={1}><Text fg={colors.textDim}>Loading canonical IJT risk inputs...</Text></Box>;
  }
  if (snapshotState.status === "error") {
    return (
      <Box flexDirection="column" padding={1}>
        <Text fg={colors.negative} attributes={TextAttributes.BOLD}>IJT RISK UNAVAILABLE</Text>
        <Text fg={colors.textDim}>Authenticate with IJT Login, then reopen this pane.</Text>
      </Box>
    );
  }
  if (snapshotState.snapshot.positions.length === 0) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text fg={colors.accent} attributes={TextAttributes.BOLD}>IJT PORTFOLIO RISK MANAGER</Text>
        <Text fg={colors.textMuted}>NO CANONICAL POSITIONS</Text>
      </Box>
    );
  }
  const risk = calculateIjtRiskSnapshot(snapshotState.snapshot, histories);
  const currency = snapshotState.snapshot.accountSummary?.currency
    ?? snapshotState.snapshot.positions[0]?.currency
    ?? "USD";
  return <RiskResultView snapshot={risk} currency={currency} />;
}

export const ijtRiskPlugin: GloomPlugin = {
  id: "ijt-risk",
  name: "IJT Risk Quant",
  version: "1.0.0",
  description: "Deterministic IJT portfolio simulation and risk models.",
  toggleable: true,
  panes: [{
    id: "ijt-simulation",
    name: "IJT Monte Carlo",
    icon: "S",
    component: IjtSimulationPane,
    defaultPosition: "right",
    defaultMode: "floating",
    defaultFloatingSize: { width: 96, height: 28 },
  }, {
    id: "ijt-risk",
    name: "IJT Portfolio Risk",
    icon: "R",
    component: IjtRiskPane,
    defaultPosition: "right",
    defaultMode: "floating",
    defaultFloatingSize: { width: 96, height: 30 },
  }],
  paneTemplates: [
    {
      id: "ijt-simulation-pane",
      paneId: "ijt-simulation",
      label: "IJT Monte Carlo",
      description: "Seeded GBM over canonical positions and current aligned daily histories.",
      keywords: ["sim", "monte carlo", "risk", "ruin", "percentiles", "gbm"],
      shortcut: { prefix: "SIM" },
      createInstance: () => ({ placement: "floating" }),
    },
    {
      id: "ijt-risk-pane",
      paneId: "ijt-risk",
      label: "IJT Portfolio Risk",
      description: "Canonical exposures, parametric VaR, concentration, correlation, and beta shocks.",
      keywords: ["risk", "var", "exposure", "concentration", "correlation", "shock"],
      shortcut: { prefix: "RISK" },
      createInstance: () => ({ placement: "floating" }),
    },
  ],
};

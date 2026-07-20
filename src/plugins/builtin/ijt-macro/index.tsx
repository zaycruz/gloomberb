import { useEffect, useMemo, useState } from "react";
import { Box, Text, TextAttributes } from "../../../ui";
import { colors } from "../../../theme/colors";
import {
  MACRO_RULES,
  scoreMacroIndicators,
  type MacroIndicatorsResponse,
  type MacroScoreResult,
} from "../../../ijt/macro";
import type { GloomPlugin, PaneProps } from "../../../types/plugin";
import { useCapabilityInvoker } from "../../runtime";

type MacroState =
  | { status: "loading" }
  | { status: "ready"; response: MacroIndicatorsResponse }
  | { status: "error" };

function useMacroIndicators(): MacroState {
  const invoke = useCapabilityInvoker();
  const [state, setState] = useState<MacroState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    void invoke<MacroIndicatorsResponse>("plugin-service.ijt-macro", "indicators", {}).then(
      (response) => { if (active) setState({ status: "ready", response }); },
      () => { if (active) setState({ status: "error" }); },
    );
    return () => { active = false; };
  }, [invoke]);
  return state;
}

function scoreColor(regime: MacroScoreResult["regime"]): string {
  return regime === "RISK-ON" ? colors.positive
    : regime === "TRANSITION" ? colors.warning
      : colors.negative;
}

export function MacroRegimeView({ response }: { response: MacroIndicatorsResponse }) {
  const score = scoreMacroIndicators(response.indicators);
  const included = new Map(score.included.map((indicator) => [indicator.key, indicator]));
  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text fg={colors.accent} attributes={TextAttributes.BOLD}>IJT MACRO REGIME DETECTOR</Text>
      {score.included.length > 0 ? (
        <Text fg={scoreColor(score.regime)} attributes={TextAttributes.BOLD}>
          {score.regime} · SCORE {score.score >= 0 ? "+" : ""}{score.score.toFixed(2)}
        </Text>
      ) : <Text fg={colors.warning}>NO SCORABLE MACRO INDICATORS</Text>}
      <Text fg={colors.border}>INDICATOR                         VALUE                  SIGNAL       WEIGHT</Text>
      {response.indicators.map((indicator) => {
        const scored = included.get(indicator.key);
        const value = indicator.value === null
          ? "—"
          : `${indicator.value.toLocaleString("en-US", { maximumFractionDigits: 3 })} ${indicator.unit}`;
        const state = scored?.signal.toUpperCase() ?? (indicator.stale ? "STALE / EXCLUDED" : "UNAVAILABLE / EXCLUDED");
        return (
          <Box key={indicator.key} flexDirection="column">
            <Text fg={scored ? colors.text : colors.textDim}>
              {indicator.label.slice(0, 32).padEnd(34)}{value.slice(0, 22).padEnd(23)}{state.padEnd(13)}{scored ? `${scored.normalizedWeight.toFixed(2)}%` : "—"}
            </Text>
            <Text fg={colors.textMuted}>
              FRED · {indicator.observation_date ? `OBS ${indicator.observation_date}` : "NO OBS"} · {indicator.as_of ? `AS OF ${indicator.as_of}` : "NO AS OF"}
            </Text>
          </Box>
        );
      })}
      <Text fg={colors.textMuted}>
        RULE WEIGHTS {Object.entries(MACRO_RULES).map(([key, rule]) => `${key.toUpperCase()} ${rule.weight}`).join(" · ")}
      </Text>
      <Text fg={colors.textMuted}>GENERATED {response.generated_at} · PUBLIC FRED DATA</Text>
    </Box>
  );
}

export function IjtMacroPane(_props: PaneProps) {
  const state = useMacroIndicators();
  const response = useMemo(() => state.status === "ready" ? state.response : null, [state]);
  if (state.status === "loading") {
    return <Box padding={1}><Text fg={colors.textDim}>Loading owned public macro data...</Text></Box>;
  }
  if (!response) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text fg={colors.negative} attributes={TextAttributes.BOLD}>IJT MACRO REGIME UNAVAILABLE</Text>
        <Text fg={colors.textDim}>Public FRED data could not be verified.</Text>
      </Box>
    );
  }
  return <MacroRegimeView response={response} />;
}

export const ijtMacroPlugin: GloomPlugin = {
  id: "ijt-macro",
  name: "IJT Macro Regime",
  version: "1.0.0",
  description: "Deterministic macro regime scoring over owned public FRED inputs.",
  toggleable: true,
  panes: [{
    id: "ijt-macro",
    name: "IJT Macro Regime",
    icon: "M",
    component: IjtMacroPane,
    defaultPosition: "right",
    defaultMode: "floating",
    defaultFloatingSize: { width: 104, height: 28 },
  }],
  paneTemplates: [{
    id: "ijt-macro-pane",
    paneId: "ijt-macro",
    label: "IJT Macro Regime",
    description: "Owned public-data VIX, curve, credit, dollar, and copper regime model.",
    keywords: ["macro", "regime", "vix", "yield curve", "credit", "dollar", "copper"],
    shortcut: { prefix: "MACRO" },
    createInstance: () => ({ placement: "floating" }),
  }],
};

import type { MacroIndicator } from "./client";

export type MacroRegimeName = "RISK-ON" | "RISK-OFF" | "TRANSITION" | "RECESSION";
export type MacroSignal = "risk-on" | "risk-off" | "neutral";
export type ScoredMacroKey = MacroIndicator["key"];

export const POUNDS_PER_METRIC_TONNE = 2204.62262185;
export const MACRO_RULES = {
  vix: { weight: 25, on: (value: number) => value <= 18, off: (value: number) => value >= 25 },
  us_2s10s: { weight: 25, on: (value: number) => value >= 0.5, off: (value: number) => value <= 0 },
  hy_oas: { weight: 25, on: (value: number) => value <= 3.5, off: (value: number) => value >= 5 },
  dxy: { weight: 15, on: (value: number) => value <= 120, off: (value: number) => value >= 126 },
  copper: { weight: 10, on: (value: number) => value >= 4.25, off: (value: number) => value <= 3.75 },
} as const;

export interface MacroScoreResult {
  score: number;
  regime: MacroRegimeName;
  included: Array<{ key: ScoredMacroKey; signal: MacroSignal; normalizedWeight: number; value: number }>;
  excludedKeys: ScoredMacroKey[];
}

export function normalizeCopperUsdPerPound(value: number, unit: string): number | null {
  const normalized = unit.trim().toLowerCase().replace(/\s+/g, " ");
  if (/^(?:usd|us\$|\$)\s*(?:\/|per)\s*(?:lb|lbs|pound|pounds)$/.test(normalized)) return value;
  if (/^(?:usd|us\$|\$)\s*(?:\/|per)\s*(?:metric tonnes?|metric tons?|tonnes?)$/.test(normalized)) {
    return value / POUNDS_PER_METRIC_TONNE;
  }
  return null;
}

function signal(key: ScoredMacroKey, value: number): MacroSignal {
  const rule = MACRO_RULES[key];
  return rule.on(value) ? "risk-on" : rule.off(value) ? "risk-off" : "neutral";
}

export function scoreMacroIndicators(indicators: readonly MacroIndicator[]): MacroScoreResult {
  const available = indicators.flatMap((indicator) => {
    if (
      indicator.availability !== "available"
      || indicator.stale
      || indicator.value === null
      || !Number.isFinite(indicator.value)
      || !indicator.source
      || !indicator.as_of
    ) return [];
    const value = indicator.key === "copper"
      ? normalizeCopperUsdPerPound(indicator.value, indicator.unit)
      : indicator.value;
    return value === null ? [] : [{ indicator, value }];
  });
  const total = available.reduce((sum, { indicator }) => sum + MACRO_RULES[indicator.key].weight, 0);
  let allocated = 0;
  const included = available.map(({ indicator, value }, index) => {
    const normalizedWeight = index === available.length - 1
      ? Math.round((100 - allocated) * 100) / 100
      : Math.round((MACRO_RULES[indicator.key].weight / total * 100 + Number.EPSILON) * 100) / 100;
    allocated = Math.round((allocated + normalizedWeight) * 100) / 100;
    return { key: indicator.key, signal: signal(indicator.key, value), normalizedWeight, value };
  });
  const signals = new Map(included.map((item) => [item.key, item.signal]));
  const score = Math.round(included.reduce((sum, item) => (
    sum + item.normalizedWeight * (item.signal === "risk-on" ? 1 : item.signal === "risk-off" ? -1 : 0)
  ), 0) * 100) / 100;
  const regime: MacroRegimeName = score <= -60
    && signals.get("us_2s10s") === "risk-off"
    && signals.get("copper") === "risk-off"
    ? "RECESSION"
    : score <= -35 ? "RISK-OFF" : score >= 35 ? "RISK-ON" : "TRANSITION";
  const includedKeys = new Set(included.map(({ key }) => key));
  return {
    score,
    regime,
    included,
    excludedKeys: (Object.keys(MACRO_RULES) as ScoredMacroKey[]).filter((key) => !includedKeys.has(key)),
  };
}

import type { CapabilitySchema, PluginCapability } from "../../capabilities";

export type ThesisType = "Commodity" | "Sector" | "Macro";
export type ThesisChoice =
  | "Gold"
  | "Oil"
  | "Natural Gas"
  | "Wheat"
  | "Mega-cap Tech"
  | "Semiconductors"
  | "Consumer Discretionary"
  | "Energy"
  | "Industrials"
  | "Risk-On"
  | "Volatility";
export type Direction = "Up" | "Down";

export interface ThesisEntry {
  type: ThesisType;
  choice: ThesisChoice;
  direction: Direction;
  beneficiaries: string[];
  hedges: string[];
  rationale: string;
}

export interface TriadResult extends ThesisEntry {
  modelVersion: "ijt-triad-v1";
}

function pair(
  type: ThesisType,
  choice: ThesisChoice,
  upBeneficiaries: string[],
  upHedges: string[],
  upRationale: string,
  downRationale: string,
): ThesisEntry[] {
  return [
    {
      type,
      choice,
      direction: "Up",
      beneficiaries: upBeneficiaries,
      hedges: upHedges,
      rationale: upRationale,
    },
    {
      type,
      choice,
      direction: "Down",
      beneficiaries: upHedges,
      hedges: upBeneficiaries,
      rationale: downRationale,
    },
  ];
}

export const THESIS_CATALOG: ThesisEntry[] = [
  ...pair("Commodity", "Gold", ["GC1", "NQ1"], ["CL1", "VIX"],
    "Gold up signals risk-off / inflation hedge demand; growth equities benefit from accommodative flows, oil and VIX suffer.",
    "Gold down signals risk appetite and rising real rates; cyclicals and vol longs benefit, gold and growth hedges underperform."),
  ...pair("Commodity", "Oil", ["CL1", "XLE"], ["GC1", "VIX"],
    "Oil up lifts energy equities and signals demand strength; safe havens and volatility decay.",
    "Oil down hurts energy sector and signals demand weakness; gold and vol benefit as hedges."),
  ...pair("Commodity", "Natural Gas", ["NG1", "XLE"], ["GC1", "VIX"],
    "Natgas up lifts energy producers and MLPs; demand-driven spike favors sector ETFs, safe havens lag.",
    "Natgas down hurts producers; mild weather or oversupply signals risk-off for energy."),
  ...pair("Commodity", "Wheat", ["ZW1", "VIX"], ["NQ1", "SPY"],
    "Wheat up signals supply disruption or inflation pressure; volatility rises, growth equities face headwinds.",
    "Wheat down signals benign supply and lower food inflation; growth equities benefit, vol decays."),
  ...pair("Sector", "Mega-cap Tech", ["AAPL", "NVDA", "MSFT"], ["VIX", "GC1"],
    "Mega-cap tech up signals growth confidence and AI capex cycle; vol and gold underperform.",
    "Mega-cap tech down signals growth rotation or rate fear; safe havens benefit."),
  ...pair("Sector", "Semiconductors", ["NVDA", "NQ1"], ["VIX", "GC1"],
    "Semis up signals chip cycle expansion and AI demand; growth indices benefit, hedges lag.",
    "Semis down signals cycle peak or inventory build; safe havens outperform."),
  ...pair("Sector", "Consumer Discretionary", ["TSLA", "SPY"], ["VIX", "GC1"],
    "Discretionary up signals consumer confidence and risk-on; broad market lifts, hedges lag.",
    "Discretionary down signals consumer weakness; vol and gold outperform."),
  ...pair("Sector", "Energy", ["XLE", "CL1"], ["NQ1", "VIX"],
    "Energy up signals commodity strength and capex cycle; growth and vol lag.",
    "Energy down signals demand weakness or oversupply; growth and vol benefit from rotation."),
  ...pair("Sector", "Industrials", ["XLI", "ES1"], ["GC1", "VIX"],
    "Industrials up signals infrastructure cycle and economic expansion; safe havens underperform.",
    "Industrials down signals recession risk; gold and vol benefit as hedges."),
  ...pair("Macro", "Risk-On", ["ES1", "NQ1", "SPY"], ["VIX", "GC1"],
    "Risk-on regime: broad equity strength, vol and gold decay.",
    "Risk-off regime: equities sell, safe havens bid."),
  ...pair("Macro", "Volatility", ["VIX", "GC1"], ["ES1", "NQ1"],
    "Vol expansion: fear drives flight to safety, equities suffer.",
    "Vol compression: calm favors growth, hedges decay."),
];

const ALIASES: Record<string, ThesisChoice> = {
  gold: "Gold", xau: "Gold", "gold futures": "Gold", gc1: "Gold",
  oil: "Oil", crude: "Oil", "crude oil": "Oil", wti: "Oil", cl1: "Oil",
  natgas: "Natural Gas", "natural gas": "Natural Gas", ng: "Natural Gas", ng1: "Natural Gas",
  wheat: "Wheat", zw: "Wheat", zw1: "Wheat",
  tech: "Mega-cap Tech", technology: "Mega-cap Tech", "mega-cap tech": "Mega-cap Tech", "mega cap tech": "Mega-cap Tech",
  semis: "Semiconductors", semiconductors: "Semiconductors", chips: "Semiconductors", nvda: "Semiconductors",
  "consumer discretionary": "Consumer Discretionary", discretionary: "Consumer Discretionary", consumer: "Consumer Discretionary", tsla: "Consumer Discretionary",
  energy: "Energy", xle: "Energy",
  industrials: "Industrials", industrial: "Industrials", xli: "Industrials",
  "risk-on": "Risk-On", "risk on": "Risk-On", riskon: "Risk-On",
  volatility: "Volatility", vix: "Volatility", fear: "Volatility",
};

export const THESIS_TYPES: ThesisType[] = ["Commodity", "Sector", "Macro"];
export const DIRECTIONS: Direction[] = ["Up", "Down"];

export function normalizeThesisInput(input: string): ThesisChoice | null {
  return ALIASES[input.trim().toLowerCase()] ?? null;
}

export function inferThesisType(choice: ThesisChoice): ThesisType | null {
  return THESIS_CATALOG.find((entry) => entry.choice === choice)?.type ?? null;
}

export function thesisChoicesForType(type: ThesisType): ThesisChoice[] {
  return [...new Set(
    THESIS_CATALOG.filter((entry) => entry.type === type).map((entry) => entry.choice),
  )];
}

export function resolveThesis(
  type: ThesisType,
  choice: ThesisChoice,
  direction: Direction,
): TriadResult | null {
  const entry = THESIS_CATALOG.find(
    (candidate) =>
      candidate.type === type &&
      candidate.choice === choice &&
      candidate.direction === direction,
  );
  return entry ? {
    ...entry,
    beneficiaries: [...entry.beneficiaries],
    hedges: [...entry.hedges],
    modelVersion: "ijt-triad-v1",
  } : null;
}

export function resolveTriadQuery(query: string): TriadResult | null {
  const trimmed = query.trim();
  const directionMatch = trimmed.match(/\s+(up|down)$/i);
  const direction: Direction = directionMatch?.[1]?.toLowerCase() === "down" ? "Down" : "Up";
  const thesisText = directionMatch ? trimmed.slice(0, directionMatch.index).trim() : trimmed;
  const choice = normalizeThesisInput(thesisText || "gold");
  if (!choice) return null;
  const type = inferThesisType(choice);
  return type ? resolveThesis(type, choice, direction) : null;
}

const querySchema: CapabilitySchema<{ query: string }> = {
  parse(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid TRIAD query");
    }
    const query = (value as Record<string, unknown>).query;
    if (typeof query !== "string" || query.length > 128) {
      throw new Error("invalid TRIAD query");
    }
    return { query };
  },
};

export const ijtTriadCapability: PluginCapability = {
  id: "plugin-service.ijt-triad",
  kind: "plugin-service",
  name: "IJT TRIAD",
  operations: {
    resolve: {
      kind: "query",
      rendererSafe: true,
      input: querySchema,
      cli: {
        summary: "Resolve an IJT thesis into beneficiaries, hedges, and rationale.",
        inputShape: "{ query: string }",
        outputShape: "TriadResult | null",
        sideEffectLevel: "none",
        formats: ["text", "json"],
      },
      handler: ({ query }) => resolveTriadQuery(query),
    },
  },
};

import type { CapabilitySchema, PluginCapability } from "../../capabilities";

const DEFAULT_PATHS = 10_000;
const DEFAULT_DAYS = 252;
const DEFAULT_RUIN_FRACTION = 0.5;
const DEFAULT_CHECKPOINT_DAYS = [0, 63, 126, 189, 252];
const MAX_UINT32 = 0xffff_ffff;
const MAX_SIMULATION_STEPS = 5_000_000;

export interface MonteCarloSimulationInput {
  initialValue: number;
  dailyMeanReturn: number;
  dailyVolatility: number;
  seed: number;
  paths?: number;
  days?: number;
  ruinFraction?: number;
  checkpointDays?: number[];
}

export interface PercentileBand {
  day: number;
  p01: number;
  p25: number;
  p50: number;
  p75: number;
  p99: number;
}

export interface MonteCarloSimulationResult {
  modelVersion: "ijt-monte-carlo-v1";
  seed: number;
  paths: number;
  days: number;
  ruinFraction: number;
  probabilityOfRuin: number;
  bands: PercentileBand[];
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function createStandardNormal(random: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) {
      const value = spare;
      spare = null;
      return value;
    }
    let first = 0;
    let second = 0;
    while (first === 0) first = random();
    while (second === 0) second = random();
    const magnitude = Math.sqrt(-2 * Math.log(first));
    const angle = 2 * Math.PI * second;
    spare = magnitude * Math.sin(angle);
    return magnitude * Math.cos(angle);
  };
}

function percentile(sortedValues: number[], probability: number): number {
  const index = (sortedValues.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower]!;
  const weight = index - lower;
  return sortedValues[lower]! * (1 - weight) + sortedValues[upper]! * weight;
}

export function runMonteCarloSimulation(
  input: MonteCarloSimulationInput,
): MonteCarloSimulationResult {
  const paths = input.paths ?? DEFAULT_PATHS;
  const days = input.days ?? DEFAULT_DAYS;
  const ruinFraction = input.ruinFraction ?? DEFAULT_RUIN_FRACTION;
  const requestedCheckpoints = input.checkpointDays
    ?? DEFAULT_CHECKPOINT_DAYS.filter((day) => day <= days);
  if (
    !Number.isFinite(input.initialValue) ||
    input.initialValue <= 0 ||
    !Number.isFinite(input.dailyMeanReturn) ||
    !Number.isFinite(input.dailyVolatility) ||
    input.dailyVolatility < 0 ||
    !Number.isSafeInteger(input.seed) ||
    input.seed < 0 ||
    input.seed > MAX_UINT32 ||
    !Number.isSafeInteger(paths) ||
    paths <= 0 ||
    !Number.isSafeInteger(days) ||
    days <= 0 ||
    paths * days > MAX_SIMULATION_STEPS ||
    !Number.isFinite(ruinFraction) ||
    ruinFraction < 0 ||
    ruinFraction > 1 ||
    requestedCheckpoints.some(
      (day) => !Number.isSafeInteger(day) || day < 0 || day > days,
    )
  ) {
    throw new Error("invalid-monte-carlo-input");
  }

  const checkpointDays = [...new Set(requestedCheckpoints)].sort((left, right) => left - right);
  if (!checkpointDays.includes(0)) checkpointDays.unshift(0);
  if (!checkpointDays.includes(days)) checkpointDays.push(days);
  const checkpointValues = new Map<number, number[]>(
    checkpointDays.map((day) => [day, day === 0 ? Array(paths).fill(input.initialValue) : []]),
  );
  const normal = createStandardNormal(createSeededRandom(input.seed));
  const drift = input.dailyMeanReturn - 0.5 * input.dailyVolatility ** 2;
  const ruinValue = input.initialValue * ruinFraction;
  let ruinedPaths = 0;

  for (let path = 0; path < paths; path += 1) {
    let value = input.initialValue;
    let ruined = value <= ruinValue;
    for (let day = 1; day <= days; day += 1) {
      value *= Math.exp(drift + input.dailyVolatility * normal());
      if (value <= ruinValue) ruined = true;
      checkpointValues.get(day)?.push(value);
    }
    if (ruined) ruinedPaths += 1;
  }

  return {
    modelVersion: "ijt-monte-carlo-v1",
    seed: input.seed,
    paths,
    days,
    ruinFraction,
    probabilityOfRuin: ruinedPaths / paths,
    bands: checkpointDays.map((day) => {
      const values = checkpointValues.get(day)!.sort((left, right) => left - right);
      return {
        day,
        p01: percentile(values, 0.01),
        p25: percentile(values, 0.25),
        p50: percentile(values, 0.5),
        p75: percentile(values, 0.75),
        p99: percentile(values, 0.99),
      };
    }),
  };
}

const simulationSchema: CapabilitySchema<MonteCarloSimulationInput> = {
  parse(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid-monte-carlo-input");
    }
    const input = value as Record<string, unknown>;
    return {
      initialValue: input.initialValue as number,
      dailyMeanReturn: input.dailyMeanReturn as number,
      dailyVolatility: input.dailyVolatility as number,
      seed: input.seed as number,
      ...(input.paths === undefined ? {} : { paths: input.paths as number }),
      ...(input.days === undefined ? {} : { days: input.days as number }),
      ...(input.ruinFraction === undefined ? {} : { ruinFraction: input.ruinFraction as number }),
      ...(input.checkpointDays === undefined
        ? {}
        : { checkpointDays: input.checkpointDays as number[] }),
    };
  },
};

export const ijtSimulationCapability: PluginCapability = {
  id: "plugin-service.ijt-simulation",
  kind: "plugin-service",
  name: "IJT Monte Carlo Simulation",
  operations: {
    run: {
      kind: "query",
      rendererSafe: true,
      input: simulationSchema,
      cli: {
        summary: "Run reproducible daily geometric-Brownian-motion paths.",
        inputShape: "MonteCarloSimulationInput",
        outputShape: "MonteCarloSimulationResult",
        sideEffectLevel: "none",
        safety: [`At most ${MAX_SIMULATION_STEPS.toLocaleString()} path-days per request.`],
        formats: ["text", "json"],
      },
      handler: runMonteCarloSimulation,
    },
  },
};

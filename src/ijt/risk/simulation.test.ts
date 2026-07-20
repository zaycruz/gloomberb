import { describe, expect, test } from "bun:test";
import { ijtSimulationCapability, runMonteCarloSimulation } from "./simulation";

const input = {
  initialValue: 100_000,
  dailyMeanReturn: 0.0005,
  dailyVolatility: 0.012,
  seed: 42,
  paths: 2_000,
};

describe("IJT seeded Monte Carlo", () => {
  test("reproduces identical percentile output for the same seed", () => {
    expect(runMonteCarloSimulation(input)).toEqual(runMonteCarloSimulation(input));
  });

  test("changes percentile output for a different seed", () => {
    const first = runMonteCarloSimulation(input);
    const second = runMonteCarloSimulation({ ...input, seed: 43 });
    expect(first.bands.at(-1)?.p50).not.toBe(second.bands.at(-1)?.p50);
  });

  test("counts ruin as ever breaching the supplied fraction", () => {
    const result = runMonteCarloSimulation({
      initialValue: 100,
      dailyMeanReturn: -0.02,
      dailyVolatility: 0,
      seed: 1,
      paths: 10,
      days: 40,
      ruinFraction: 0.5,
      checkpointDays: [40],
    });
    expect(result.probabilityOfRuin).toBe(1);
    expect(result.bands.map(({ day }) => day)).toEqual([0, 40]);
  });

  test("rejects invalid inputs and excessive renderer workloads", () => {
    expect(() => runMonteCarloSimulation({ ...input, seed: -1 })).toThrow(
      "invalid-monte-carlo-input",
    );
    expect(() => runMonteCarloSimulation({ ...input, paths: 100_000, days: 100 })).toThrow(
      "invalid-monte-carlo-input",
    );
    expect(() => runMonteCarloSimulation({ ...input, checkpointDays: [253] })).toThrow(
      "invalid-monte-carlo-input",
    );
  });

  test("declares a renderer-safe, side-effect-free bounded capability", () => {
    const operation = ijtSimulationCapability.operations.run;
    expect(operation.rendererSafe).toBe(true);
    expect(operation.cli?.sideEffectLevel).toBe("none");
    expect(operation.cli?.safety?.[0]).toContain("5,000,000");
    expect(operation.handler?.(
      { ...input, paths: 10, days: 10 },
      { capability: ijtSimulationCapability, operationId: "run" },
    )).toMatchObject({ modelVersion: "ijt-monte-carlo-v1", paths: 10, days: 10 });
  });
});

import { describe, expect, test } from "bun:test";
import {
  DIRECTIONS,
  THESIS_CATALOG,
  THESIS_TYPES,
  ijtTriadCapability,
  normalizeThesisInput,
  resolveThesis,
  resolveTriadQuery,
  thesisChoicesForType,
} from "./triad";

describe("IJT TRIAD model parity", () => {
  test("preserves all 11 theses in both directions", () => {
    expect(THESIS_CATALOG).toHaveLength(22);
    for (const type of THESIS_TYPES) {
      for (const choice of thesisChoicesForType(type)) {
        for (const direction of DIRECTIONS) {
          expect(resolveThesis(type, choice, direction)).not.toBeNull();
        }
      }
    }
  });

  test("normalizes Bloomberg-style and natural-language aliases", () => {
    expect(normalizeThesisInput("GC1")).toBe("Gold");
    expect(normalizeThesisInput("crude oil")).toBe("Oil");
    expect(normalizeThesisInput("mega cap tech")).toBe("Mega-cap Tech");
    expect(normalizeThesisInput("fear")).toBe("Volatility");
  });

  test("resolves command queries with an optional direction", () => {
    expect(resolveTriadQuery("natural gas up")?.beneficiaries).toEqual(["NG1", "XLE"]);
    expect(resolveTriadQuery("wheat down")?.beneficiaries).toEqual(["NQ1", "SPY"]);
    expect(resolveTriadQuery("energy")?.direction).toBe("Up");
    expect(resolveTriadQuery("unsupported")).toBeNull();
  });

  test("returns independent result arrays with model provenance", () => {
    const first = resolveTriadQuery("gold")!;
    const second = resolveTriadQuery("gold")!;
    expect(first.modelVersion).toBe("ijt-triad-v1");
    expect(first.beneficiaries).not.toBe(second.beneficiaries);
    expect(first.hedges).not.toBe(second.hedges);
  });

  test("exposes a renderer-safe, side-effect-free capability", async () => {
    const operation = ijtTriadCapability.operations.resolve;
    expect(operation.rendererSafe).toBe(true);
    expect(operation.cli?.sideEffectLevel).toBe("none");
    expect(operation.handler?.(
      { query: "industrials up" },
      { capability: ijtTriadCapability, operationId: "resolve" },
    )).toMatchObject({ beneficiaries: ["XLI", "ES1"] });
  });
});

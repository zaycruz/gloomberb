import { describe, expect, test } from "bun:test";
import { createIjtMacroCapability } from "./capability";
import { createIjtMacroClient, parseFredCsv, type MacroIndicator } from "./client";
import { normalizeCopperUsdPerPound, scoreMacroIndicators } from "./model";

const now = new Date("2026-07-20T12:00:00Z");
const values: Record<string, string> = {
  VIXCLS: "2026-07-17,17.0",
  DGS10: "2026-07-16,4.57",
  DGS2: "2026-07-16,4.16",
  BAMLH0A0HYM2: "2026-07-16,2.71",
  DTWEXBGS: "2026-07-10,119.5",
  PCOPPUSDM: "2026-06-01,11023.11310925",
};

function csv(id: string, row = values[id]) {
  return new Response(`observation_date,${id}\n${row}\n`, {
    headers: { "content-type": "text/csv" },
  });
}

describe("IJT owned macro data", () => {
  test("strictly parses FRED CSV and ignores documented missing observations", () => {
    expect(parseFredCsv("observation_date,VIXCLS\n2026-07-16,.\n2026-07-17,18.77\n", "VIXCLS"))
      .toEqual([{ date: "2026-07-17", value: 18.77 }]);
    expect(() => parseFredCsv("date,VIXCLS\n2026-07-17,18.77", "VIXCLS")).toThrow("invalid-fred-response");
  });

  test("loads only the fixed public FRED series and derives the matched 2s10s spread", async () => {
    const requested: string[] = [];
    const client = createIjtMacroClient({
      now: () => now,
      fetcher: (async (input: string | URL | Request) => {
        const url = new URL(String(input));
        expect(url.origin).toBe("https://fred.stlouisfed.org");
        const id = url.searchParams.get("id")!;
        requested.push(id);
        return csv(id);
      }) as typeof fetch,
    });

    const response = await client.fetchIndicators();

    expect(requested.sort()).toEqual([
      "BAMLH0A0HYM2", "DGS10", "DGS2", "DTWEXBGS", "PCOPPUSDM", "VIXCLS",
    ]);
    const spread = response.indicators.find(({ key }) => key === "us_2s10s");
    expect(spread).toMatchObject({
      observation_date: "2026-07-16",
      stale: false,
      source: "FRED",
    });
    expect(spread?.value).toBeCloseTo(0.41, 8);
    expect(response.indicators.find(({ key }) => key === "copper")?.stale).toBe(false);
  });

  test("keeps a failed series explicit and reweights only current sourced indicators", async () => {
    const client = createIjtMacroClient({
      now: () => now,
      fetcher: (async (input: string | URL | Request) => {
        const id = new URL(String(input)).searchParams.get("id")!;
        if (id === "VIXCLS") return new Response("upstream", { status: 503 });
        return csv(id);
      }) as typeof fetch,
    });
    const response = await client.fetchIndicators();
    const vix = response.indicators.find(({ key }) => key === "vix");
    expect(vix).toMatchObject({ availability: "unavailable", value: null, as_of: null });
    const score = scoreMacroIndicators(response.indicators);
    expect(score.excludedKeys).toContain("vix");
    expect(score.included.reduce((sum, indicator) => sum + indicator.normalizedWeight, 0)).toBe(100);
  });

  test("preserves IJT regime thresholds and copper unit normalization", () => {
    const indicator = (
      key: MacroIndicator["key"],
      value: number,
      unit = "index",
    ): MacroIndicator => ({
      key, label: key, unit, source: "FRED", value,
      observation_date: "2026-07-17", as_of: "2026-07-17T00:00:00Z",
      stale: false, availability: "available", null_reason: null,
    });
    const result = scoreMacroIndicators([
      indicator("vix", 16),
      indicator("us_2s10s", 0.75),
      indicator("hy_oas", 3),
      indicator("dxy", 118),
      indicator("copper", 11_023.11310925, "USD / metric tonne"),
    ]);
    expect(result.regime).toBe("RISK-ON");
    expect(result.score).toBe(100);
    expect(normalizeCopperUsdPerPound(11_023.11310925, "USD / metric tonne")).toBeCloseTo(5, 5);
  });

  test("exposes a renderer-safe public read capability", () => {
    const capability = createIjtMacroCapability(createIjtMacroClient({ now: () => now }));
    expect(capability.operations.indicators.kind).toBe("read");
    expect(capability.operations.indicators.rendererSafe).toBe(true);
    expect(capability.operations.indicators.cli?.sideEffectLevel).toBe("none");
  });
});

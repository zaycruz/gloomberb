import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { Box } from "../../../ui";
import { testRender } from "../../../renderers/opentui/test-utils";
import type { MacroIndicatorsResponse } from "../../../ijt/macro";
import { createTestPluginRuntime } from "../../../test-support/plugin-runtime";
import { PluginRenderProvider } from "../../runtime";
import { IjtMacroPane, ijtMacroPlugin, MacroRegimeView } from ".";

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined;

async function flushFrames(count = 4) {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await testSetup!.renderOnce();
    });
  }
}

afterEach(async () => {
  if (!testSetup) return;
  await act(async () => testSetup!.renderer.destroy());
  testSetup = undefined;
});

function response(): MacroIndicatorsResponse {
  const indicator = (
    key: MacroIndicatorsResponse["indicators"][number]["key"],
    label: string,
    value: number,
    unit: string,
  ) => ({
    key, label, value, unit, source: "FRED" as const,
    observation_date: "2026-07-17", as_of: "2026-07-17T00:00:00Z",
    stale: false, availability: "available" as const, null_reason: null,
  });
  return {
    source: "FRED",
    generated_at: "2026-07-20T12:00:00Z",
    indicators: [
      indicator("vix", "VIX", 16, "index"),
      indicator("us_2s10s", "US 2s10s", 0.75, "percentage points"),
      indicator("hy_oas", "HY OAS", 3, "percentage points"),
      indicator("dxy", "Broad USD proxy (FRED DTWEXBGS)", 118, "index"),
      indicator("copper", "Copper (monthly)", 11_023.11310925, "USD / metric tonne"),
    ],
  };
}

describe("ijtMacroPlugin", () => {
  test("registers the exact MACRO shortcut", () => {
    expect(ijtMacroPlugin.paneTemplates?.[0]?.shortcut?.prefix).toBe("MACRO");
  });

  test("renders sourced deterministic regime inputs and normalized weights", async () => {
    await act(async () => {
      testSetup = await testRender(
        <Box flexDirection="column" width={110} height={28}>
          <MacroRegimeView response={response()} />
        </Box>,
        { width: 110, height: 28 },
      );
    });
    await flushFrames(3);

    const frame = testSetup!.captureCharFrame();
    expect(frame).toContain("IJT MACRO REGIME DETECTOR");
    expect(frame).toContain("RISK-ON · SCORE +100.00");
    expect(frame).toContain("US 2s10s");
    expect(frame).toContain("RISK-ON");
    expect(frame).toContain("FRED · OBS 2026-07-17 · AS OF 2026-07-17T00:00:00Z");
    expect(frame).toContain("RULE WEIGHTS VIX 25 · US_2S10S 25 · HY_OAS 25 · DXY 15 · COPPER 10");
    expect(frame).toContain("PUBLIC FRED DATA");
  });

  test("fails closed when the backend cannot verify public data", async () => {
    const runtime = createTestPluginRuntime({
      invokeCapability: async <T,>() => Promise.reject(new Error("fred-unavailable")) as Promise<T>,
    });
    await act(async () => {
      testSetup = await testRender(
        <PluginRenderProvider pluginId={ijtMacroPlugin.id} runtime={runtime}>
          <Box width={104} height={28}>
            <IjtMacroPane paneId="ijt-macro:test" paneType="ijt-macro" focused width={104} height={28} />
          </Box>
        </PluginRenderProvider>,
        { width: 104, height: 28 },
      );
    });
    await flushFrames();

    expect(testSetup!.captureCharFrame()).toContain("IJT MACRO REGIME UNAVAILABLE");
  });
});

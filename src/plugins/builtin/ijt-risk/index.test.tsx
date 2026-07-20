import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { Box } from "../../../ui";
import { testRender } from "../../../renderers/opentui/test-utils";
import { setSharedMarketDataCoordinator } from "../../../market-data/coordinator";
import { createTestPluginRuntime } from "../../../test-support/plugin-runtime";
import { PluginRenderProvider } from "../../runtime";
import { IjtSimulationPane, ijtRiskPlugin, SimulationResultView } from ".";

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

beforeEach(() => setSharedMarketDataCoordinator(null));

afterEach(async () => {
  if (testSetup) {
    await act(async () => testSetup!.renderer.destroy());
    testSetup = undefined;
  }
  setSharedMarketDataCoordinator(null);
});

describe("ijtRiskPlugin", () => {
  test("registers the exact SIM shortcut", () => {
    expect(ijtRiskPlugin.paneTemplates?.[0]?.shortcut?.prefix).toBe("SIM");
  });

  test("fails closed before requesting histories when authentication is unavailable", async () => {
    const runtime = createTestPluginRuntime({
      invokeCapability: async <T,>() => Promise.reject(new Error("unauthenticated")) as Promise<T>,
    });
    await act(async () => {
      testSetup = await testRender(
        <PluginRenderProvider pluginId={ijtRiskPlugin.id} runtime={runtime}>
          <Box width={100} height={28}>
            <IjtSimulationPane paneId="ijt-sim:test" paneType="ijt-simulation" focused width={100} height={28} />
          </Box>
        </PluginRenderProvider>,
        { width: 100, height: 28 },
      );
    });
    await flushFrames();

    const frame = testSetup!.captureCharFrame();
    expect(frame).toContain("IJT SIMULATION UNAVAILABLE");
    expect(frame).toContain("Authenticate with IJT Login, then reopen this pane.");
  });

  test("renders seeded percentiles and complete model provenance", async () => {
    await act(async () => {
      testSetup = await testRender(
        <Box flexDirection="column" width={100} height={28}>
          <SimulationResultView
            currency="USD"
            result={{
              modelVersion: "ijt-monte-carlo-v1",
              seed: 20_260_719,
              paths: 10_000,
              days: 252,
              ruinFraction: 0.5,
              probabilityOfRuin: 0.0125,
              bands: [{ day: 252, p01: 70_000, p25: 95_000, p50: 110_000, p75: 130_000, p99: 180_000 }],
            }}
            provenance={{
              positionAsOf: "2026-07-18T20:01:00Z",
              historyAsOf: "2026-07-18",
              sources: ["ibkr", "yahoo"],
              observations: 245,
              stale: false,
            }}
          />
        </Box>,
        { width: 100, height: 28 },
      );
    });
    await flushFrames(3);

    const frame = testSetup!.captureCharFrame();
    expect(frame).toContain("IJT MONTE CARLO · SEEDED GBM");
    expect(frame).toContain("MEDIAN $110,000.00");
    expect(frame).toContain("RUIN 1.25%");
    expect(frame).toContain("ijt-monte-carlo-v1 · SEED 20260719 · 10000 PATHS · 252 DAYS");
    expect(frame).toContain("ibkr + yahoo · 245 COMMON RETURNS · HISTORY 2026-07-18");
    expect(frame).toContain("POSITIONS 2026-07-18T20:01:00Z");
  });
});

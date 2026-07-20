import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { Box } from "../../../ui";
import { testRender } from "../../../renderers/opentui/test-utils";
import { setSharedMarketDataCoordinator } from "../../../market-data/coordinator";
import { createTestPluginRuntime } from "../../../test-support/plugin-runtime";
import { PluginRenderProvider } from "../../runtime";
import {
  IjtRiskPane,
  IjtSimulationPane,
  ijtRiskPlugin,
  RiskResultView,
  SimulationResultView,
} from ".";

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
  test("registers exact SIM and RISK shortcuts", () => {
    expect(ijtRiskPlugin.paneTemplates?.map((template) => template.shortcut?.prefix))
      .toEqual(["SIM", "RISK"]);
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

  test("fails RISK closed before requesting histories when authentication is unavailable", async () => {
    const runtime = createTestPluginRuntime({
      invokeCapability: async <T,>() => Promise.reject(new Error("unauthenticated")) as Promise<T>,
    });
    await act(async () => {
      testSetup = await testRender(
        <PluginRenderProvider pluginId={ijtRiskPlugin.id} runtime={runtime}>
          <Box width={100} height={30}>
            <IjtRiskPane paneId="ijt-risk:test" paneType="ijt-risk" focused width={100} height={30} />
          </Box>
        </PluginRenderProvider>,
        { width: 100, height: 30 },
      );
    });
    await flushFrames();

    expect(testSetup!.captureCharFrame()).toContain("IJT RISK UNAVAILABLE");
  });

  test("renders deterministic risk outputs and provenance", async () => {
    await act(async () => {
      testSetup = await testRender(
        <Box flexDirection="column" width={100} height={30}>
          <RiskResultView
            currency="USD"
            snapshot={{
              grossExposure: 80_000,
              netExposure: 80_000,
              betaAdjustedExposure: 100_000,
              valueAtRisk: 1_750,
              returnObservations: 245,
              correlationSymbols: ["AAPL", "MSFT"],
              correlations: [
                { symbol: "AAPL", values: [1, 0.65] },
                { symbol: "MSFT", values: [0.65, 1] },
              ],
              scenarios: [
                { label: "SPY -5%", shock: -0.05, pnl: -5_000 },
                { label: "SPY +2%", shock: 0.02, pnl: 2_000 },
              ],
              watchItems: [{ symbol: "AAPL", weight: 0.75, policyMaximum: 0.25 }],
              positionAsOf: "2026-07-18T20:01:00Z",
              historyAsOf: "2026-07-18",
              sources: ["ibkr", "yahoo"],
            }}
          />
        </Box>,
        { width: 100, height: 30 },
      );
    });
    await flushFrames(3);

    const frame = testSetup!.captureCharFrame();
    expect(frame).toContain("IJT PORTFOLIO RISK MANAGER");
    expect(frame).toContain("GROSS $80,000.00");
    expect(frame).toContain("95% 1D VaR $1,750.00");
    expect(frame).toContain("75.0% GROSS WEIGHT");
    expect(frame).toContain("SPY -5%");
    expect(frame).toContain("AAPL");
    expect(frame).toContain("ibkr + yahoo · HISTORY 2026-07-18");
  });
});

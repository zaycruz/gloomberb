import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { Box } from "../../../ui";
import { testRender } from "../../../renderers/opentui/test-utils";
import { createTestPluginRuntime } from "../../../test-support/plugin-runtime";
import { PluginRenderProvider, type PluginRuntimeAccess } from "../../runtime";
import { ijtDataPanesPlugin, IjtCotPane, IjtNavPane } from ".";

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined;

function PaneHarness({
  component: Pane,
  runtime,
}: {
  component: typeof IjtCotPane;
  runtime: PluginRuntimeAccess;
}) {
  return (
    <PluginRenderProvider pluginId={ijtDataPanesPlugin.id} runtime={runtime}>
      <Box width={100} height={24}>
        <Pane paneId="ijt-data:test" paneType="ijt-data" focused width={100} height={24} />
      </Box>
    </PluginRenderProvider>
  );
}

async function renderPane(component: typeof IjtCotPane, runtime: PluginRuntimeAccess) {
  await act(async () => {
    testSetup = await testRender(<PaneHarness component={component} runtime={runtime} />, {
      width: 100,
      height: 24,
    });
  });
  for (let index = 0; index < 4; index += 1) {
    await act(async () => {
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await testSetup!.renderOnce();
    });
  }
  return testSetup.captureCharFrame();
}

afterEach(async () => {
  if (!testSetup) return;
  await act(async () => {
    testSetup!.renderer.destroy();
    await Promise.resolve();
  });
  testSetup = undefined;
});

describe("ijtDataPanesPlugin", () => {
  test("registers exact COT and NAV terminal shortcuts", () => {
    expect(ijtDataPanesPlugin.paneTemplates?.map((template) => ({
      paneId: template.paneId,
      prefix: template.shortcut?.prefix,
    }))).toEqual([
      { paneId: "ijt-cot", prefix: "COT" },
      { paneId: "ijt-nav", prefix: "NAV" },
    ]);
  });

  test("fails closed with an actionable authentication message", async () => {
    const runtime = createTestPluginRuntime({
      invokeCapability: async <T,>() => Promise.reject(new Error("authentication-required")) as Promise<T>,
    });

    const frame = await renderPane(IjtCotPane, runtime);

    expect(frame).toContain("IJT DATA UNAVAILABLE");
    expect(frame).toContain("Authenticate with IJT Login, then reopen this pane.");
  });

  test("renders canonical COT positioning with source timestamps", async () => {
    const runtime = createTestPluginRuntime({
      invokeCapability: async <T,>(_capabilityId, operationId) => {
        expect(operationId).toBe("cot");
        return [{
          report_date: "2026-07-14",
          market_name: "GOLD",
          cftc_commodity_code: "088691",
          long_noncommercial: 201_000,
          short_noncommercial: 151_000,
          long_commercial: 90_000,
          short_commercial: 125_000,
          asset_mgr_long: 0,
          asset_mgr_short: 0,
          swap_long: 0,
          swap_short: 0,
          as_of: "2026-07-18T02:15:00Z",
        }] as T;
      },
    });

    const frame = await renderPane(IjtCotPane, runtime);

    expect(frame).toContain("IJT COT · 2026-07-14");
    expect(frame).toContain("GOLD");
    expect(frame).toContain("+50,000");
    expect(frame).toContain("-35,000");
    expect(frame).toContain("AS OF 2026-07-18T02:15:00Z");
  });

  test("renders canonical NAV, cash, and return history", async () => {
    const runtime = createTestPluginRuntime({
      invokeCapability: async <T,>(_capabilityId, operationId) => {
        expect(operationId).toBe("navHistory");
        return [{
          nav_date: "2026-07-18",
          total_fund_nav: 1_250_000,
          total_deployed: 900_000,
          total_cash: 350_000,
          gross_return_pct: 3.1,
          net_return_pct: 2.75,
          mtd_return_pct: 1.25,
          ytd_return_pct: 8.5,
          since_inception_return_pct: 12.75,
        }] as T;
      },
    });

    const frame = await renderPane(IjtNavPane, runtime);

    expect(frame).toContain("IJT FUND NAV");
    expect(frame).toContain("$1,250,000.00 · 2026-07-18");
    expect(frame).toContain("DEPLOYED $900,000.00");
    expect(frame).toContain("CASH $350,000.00");
    expect(frame).toContain("NET +2.75%");
    expect(frame).toContain("YTD +8.50%");
  });
});

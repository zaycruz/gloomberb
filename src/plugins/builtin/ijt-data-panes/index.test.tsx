import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { Box } from "../../../ui";
import { testRender } from "../../../renderers/opentui/test-utils";
import { createTestPluginRuntime } from "../../../test-support/plugin-runtime";
import { PluginRenderProvider, type PluginRuntimeAccess } from "../../runtime";
import {
  ijtDataPanesPlugin,
  IjtCotPane,
  IjtNavPane,
  IjtPortfolioPane,
} from ".";

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
  test("registers exact COT, NAV, and PORT terminal shortcuts", () => {
    expect(ijtDataPanesPlugin.paneTemplates?.map((template) => ({
      paneId: template.paneId,
      prefix: template.shortcut?.prefix,
    }))).toEqual([
      { paneId: "ijt-cot", prefix: "COT" },
      { paneId: "ijt-nav", prefix: "NAV" },
      { paneId: "ijt-portfolio", prefix: "PORT" },
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

  test("renders the canonical portfolio account and position snapshot", async () => {
    const runtime = createTestPluginRuntime({
      invokeCapability: async <T,>(_capabilityId, operationId) => {
        expect(operationId).toBe("portfolioSnapshot");
        return {
          accountSummary: {
            account_id: "DU123",
            net_liquidation: 1_500_000,
            total_cash: 250_000,
            accrued_cash: 0,
            stock_mv: 1_250_000,
            option_mv: 0,
            futures_mv: 0,
            unrealized_pnl: 125_000,
            realized_pnl: 40_000,
            currency: "USD",
            as_of: "2026-07-18T20:00:00Z",
            fetched_at: "2026-07-18T20:01:00Z",
          },
          positions: [{
            account_id: "DU123",
            conid: 265598,
            ticker: "AAPL",
            asset_class: "STK",
            position: 100,
            avg_price: 175,
            market_price: 210,
            market_value: 21_000,
            unrealized_pnl: 3_500,
            currency: "USD",
            as_of: "2026-07-18T20:00:00Z",
            fetched_at: "2026-07-18T20:01:00Z",
          }],
        } as T;
      },
    });

    const frame = await renderPane(IjtPortfolioPane, runtime);

    expect(frame).toContain("IJT PORTFOLIO SNAPSHOT");
    expect(frame).toContain("NLV $1,500,000.00");
    expect(frame).toContain("CASH $250,000.00");
    expect(frame).toContain("AAPL");
    expect(frame).toContain("$21,000.00");
    expect(frame).toContain("AS OF 2026-07-18T20:00:00Z · 1 POSITION");
  });
});

import { afterEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { Box } from "../../../ui";
import { testRender } from "../../../renderers/opentui/test-utils";
import { createTestPluginRuntime } from "../../../test-support/plugin-runtime";
import { PluginRenderProvider, type PluginRuntimeAccess } from "../../runtime";
import { IjtFundPane, ijtFundPlugin } from ".";

let testSetup: Awaited<ReturnType<typeof testRender>> | undefined;

async function renderFund(runtime: PluginRuntimeAccess) {
  await act(async () => {
    testSetup = await testRender(
      <PluginRenderProvider pluginId={ijtFundPlugin.id} runtime={runtime}>
        <Box width={100} height={30}>
          <IjtFundPane paneId="ijt-fund:test" paneType="ijt-fund" focused width={100} height={30} />
        </Box>
      </PluginRenderProvider>,
      { width: 100, height: 30 },
    );
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

describe("ijtFundPlugin", () => {
  test("registers the exact CAP shortcut", () => {
    expect(ijtFundPlugin.paneTemplates?.[0]?.shortcut?.prefix).toBe("CAP");
  });

  test("fails closed with an actionable authentication message", async () => {
    const frame = await renderFund(createTestPluginRuntime({
      invokeCapability: async <T,>() => Promise.reject(new Error("unauthenticated")) as Promise<T>,
    }));

    expect(frame).toContain("IJT FUND WORKSPACE UNAVAILABLE");
    expect(frame).toContain("Authenticate with IJT Login, then reopen this pane.");
  });

  test("renders the strict workspace while keeping writes disabled", async () => {
    const frame = await renderFund(createTestPluginRuntime({
      invokeCapability: async <T,>(_capabilityId, operationId) => {
        expect(operationId).toBe("workspace");
        return {
          asOf: "2026-07-20T12:00:00Z",
          freshness: "fresh",
          capability: "operator",
          allowedWorkflows: ["lp-update", "contribution-record"],
          roster: [
            { id: "lp-1", label: "Northstar Partners", state: "active" },
            { id: "lp-2", label: "Legacy Capital", state: "archived" },
          ],
          selectedLp: {
            id: "lp-1",
            label: "Northstar Partners",
            revision: "7",
            commitmentSummary: "$2.0m committed",
            capitalAccountSummary: "$1.4m capital account",
          },
          transactionHistory: [{
            id: "txn-1",
            label: "$250k contribution",
            state: "posted",
          }],
          reconciliationSummary: "Reconciled through 2026-07-19",
          fundStatusSummary: "Fund open",
        } as T;
      },
    }));

    expect(frame).toContain("IJT CAPITAL ADMIN");
    expect(frame).toContain("Fund open · FRESH · OPERATOR");
    expect(frame).toContain("Northstar Partners · REV 7");
    expect(frame).toContain("$250k contribution");
    expect(frame).toContain("WRITES NOT EXPOSED · authenticated read model only");
    expect(frame).toContain("SERVER ALLOWS lp-update, contribution-record");
  });
});

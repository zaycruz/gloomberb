import type { PluginCapability } from "../../capabilities";
import { ijtAuthSession } from "../auth";
import { createFundApiClient, type FundApiClient } from "./client";
import { FUND_API_CONTRACT } from "./contract";

export function createIjtFundCapability(
  client: Pick<FundApiClient, "loadWorkspace">,
): PluginCapability {
  return {
    id: "plugin-service.ijt-fund",
    kind: "plugin-service",
    name: "IJT Fund Operations",
    operations: {
      workspace: {
        kind: "read",
        rendererSafe: true,
        cli: {
          summary: "Load the authenticated fund workspace projection.",
          outputShape: "FundWorkspaceProjection",
          sideEffectLevel: "none",
          requirements: ["Authenticated IJT operator session"],
          safety: ["Returns fund projections only; credentials remain in the backend."],
        },
        handler: () => client.loadWorkspace(),
      },
    },
  };
}

const fundClient = createFundApiClient({
  contract: FUND_API_CONTRACT,
  credentialProvider: async () => {
    await ijtAuthSession.ensureValidSession();
    const token = ijtAuthSession.currentAccessToken();
    if (!token) throw new Error("unauthenticated");
    return { scheme: "Bearer", token };
  },
});

export const ijtFundCapability = createIjtFundCapability(fundClient);

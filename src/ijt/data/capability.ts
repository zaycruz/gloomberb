import type { PluginCapability } from "../../capabilities";
import { ijtAuthSession, loadIjtAuthConfig } from "../auth";
import {
  createIjtDataClient,
  type IbkrAccountSummaryRow,
  type IbkrPositionRow,
  type IjtDataClient,
} from "./client";

export interface IjtPortfolioSnapshot {
  positions: IbkrPositionRow[];
  accountSummary: IbkrAccountSummaryRow | null;
}

export function createIjtDataCapability(client: IjtDataClient | null): PluginCapability {
  const requireClient = () => {
    if (!client) throw new Error("supabase-read-unavailable");
    return client;
  };
  const read = (summary: string, handler: () => Promise<unknown>) => ({
    kind: "read" as const,
    rendererSafe: true,
    cli: {
      summary,
      sideEffectLevel: "none" as const,
      requirements: ["Authenticated IJT session"],
      safety: ["Credentials remain in the backend; rows are strictly decoded."],
    },
    handler,
  });
  return {
    id: "plugin-service.ijt-data",
    kind: "plugin-service",
    name: "IJT Canonical Data",
    operations: {
      portfolioSnapshot: read("Load the canonical IBKR portfolio snapshot.", async () => {
        const dataClient = requireClient();
        const [positions, accountSummary] = await Promise.all([
          dataClient.fetchIbkrPositions(),
          dataClient.fetchIbkrAccountSummary(),
        ]);
        return { positions, accountSummary } satisfies IjtPortfolioSnapshot;
      }),
      positions: read("Load canonical IBKR positions.", () => requireClient().fetchIbkrPositions()),
      accountSummary: read("Load the latest canonical IBKR account summary.", () => requireClient().fetchIbkrAccountSummary()),
      cot: read("Load the latest canonical COT report.", () => requireClient().fetchCotReport()),
      lpRoster: read("Load the canonical LP roster.", () => requireClient().fetchLpRoster()),
      navHistory: read("Load canonical fund NAV history.", () => requireClient().fetchNavHistory()),
    },
  };
}

const config = loadIjtAuthConfig();
const dataClient = config.status === "available" ? createIjtDataClient({
  config: config.config,
  credentialProvider: async () => {
    await ijtAuthSession.ensureValidSession();
    const token = ijtAuthSession.currentAccessToken();
    if (!token) throw new Error("supabase-read-unavailable");
    return token;
  },
}) : null;

export const ijtDataCapability = createIjtDataCapability(dataClient);

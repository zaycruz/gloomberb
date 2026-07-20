import type { PluginCapability } from "../../capabilities";
import { createIjtMacroClient } from "./client";

export function createIjtMacroCapability(client: ReturnType<typeof createIjtMacroClient>): PluginCapability {
  return {
    id: "plugin-service.ijt-macro",
    kind: "plugin-service",
    name: "IJT Owned Macro Data",
    operations: {
      indicators: {
        kind: "read",
        rendererSafe: true,
        cli: {
          summary: "Load strict public FRED macro indicators.",
          sideEffectLevel: "none",
          safety: ["Only fixed allowlisted public FRED series are requested."],
        },
        handler: () => client.fetchIndicators(),
      },
    },
  };
}

export const ijtMacroCapability = createIjtMacroCapability(createIjtMacroClient());

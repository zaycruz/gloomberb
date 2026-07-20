import type { GloomPlugin } from "../../types/plugin";
import { ijtAuthCapability } from "../../ijt/auth";
import { ijtFundCapability } from "../../ijt/fund";
import { ijtSimulationCapability } from "../../ijt/risk";

export const ijtPlatformPlugin: GloomPlugin = {
  id: "ijt-platform",
  name: "IJT Platform",
  version: "1.0.0",
  capabilities: [ijtAuthCapability, ijtFundCapability, ijtSimulationCapability],
};

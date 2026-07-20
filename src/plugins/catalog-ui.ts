import type { GloomPlugin } from "../types/plugin";
import { portfolioListPlugin } from "./builtin/portfolio-list";
import { newsPlugin } from "./builtin/news";
import { notesPlugin } from "./builtin/notes";
import { substackPlugin } from "./builtin/substack";
import { aiPlugin } from "./builtin/ai";
import { gloomberbCloudPlugin } from "./builtin/cloud";
import { changelogPlugin } from "./builtin/changelog";
import { helpPlugin } from "./builtin/help";
import { ibkrPlugin } from "./ibkr";
import { layoutManagerPlugin } from "./builtin/layout-manager";
import { predictionMarketsPlugin } from "./prediction-markets";
import { analyticsPlugin } from "./builtin/analytics";
import { alertsPlugin } from "./builtin/alerts";
import { kellySizerPlugin } from "./builtin/kelly-sizer";
import { ijtTriadPlugin } from "./builtin/ijt-triad";
import { ijtPlatformPlugin } from "./builtin/ijt-platform";
import { ijtDataPanesPlugin } from "./builtin/ijt-data-panes";
import {
  brokerPlugin,
  macroPlugin,
  marketOverviewPlugin,
  tickerResearchPlugin,
} from "./builtin/plugin-groups";

export const uiBuiltinPlugins: GloomPlugin[] = [
  ijtPlatformPlugin,
  ijtDataPanesPlugin,
  gloomberbCloudPlugin,
  portfolioListPlugin,
  tickerResearchPlugin,
  brokerPlugin,
  ibkrPlugin,
  layoutManagerPlugin,
  newsPlugin,
  substackPlugin,
  notesPlugin,
  aiPlugin,
  changelogPlugin,
  helpPlugin,
  predictionMarketsPlugin,
  marketOverviewPlugin,
  macroPlugin,
  analyticsPlugin,
  kellySizerPlugin,
  ijtTriadPlugin,
  alertsPlugin,
];

export function getRendererBuiltinPlugins(): GloomPlugin[] {
  return uiBuiltinPlugins;
}

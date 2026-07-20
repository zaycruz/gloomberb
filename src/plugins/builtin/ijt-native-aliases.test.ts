import { describe, expect, test } from "bun:test";
import { uiBuiltinPlugins } from "../catalog-ui";
import { econCalendarPaneTemplates } from "./econ";
import { fearGreedPlugin } from "./fear-greed";
import { holdersPlugin } from "./holders";
import { newsPlugin } from "./news";
import { newsWirePaneTemplates } from "./news/wire";
import { optionsPlugin } from "./options";
import { correlationPlugin } from "./correlation";
import { researchPlugin } from "./research";
import { sectorsPlugin } from "./sectors";
import { tickerDetailPlugin } from "./ticker-detail";
import { worldIndicesPlugin } from "./world-indices";

function shortcutTarget(
  templates: NonNullable<typeof tickerDetailPlugin.paneTemplates>,
  prefix: string,
): string | undefined {
  return templates.find((template) => template.shortcut?.prefix === prefix)?.paneId;
}

describe("IJT native command convergence", () => {
  test("routes ticker research commands to native panes", () => {
    expect(shortcutTarget(tickerDetailPlugin.paneTemplates ?? [], "DES")).toBe("ticker-research");
    expect(shortcutTarget(tickerDetailPlugin.paneTemplates ?? [], "FA")).toBe("financial-analysis");
    expect(shortcutTarget(tickerDetailPlugin.paneTemplates ?? [], "GP")).toBe("ticker-chart");
    expect(shortcutTarget(researchPlugin.paneTemplates ?? [], "ANR")).toBe("analyst-research");
    expect(shortcutTarget(newsPlugin.paneTemplates ?? [], "CN")).toBe("ticker-news");
    expect(shortcutTarget(optionsPlugin.paneTemplates ?? [], "OMON")).toBe("options");
    expect(shortcutTarget(holdersPlugin.paneTemplates ?? [], "HDS")).toBe("holders");
    expect(shortcutTarget(researchPlugin.paneTemplates ?? [], "RV")).toBe("relative-valuation");
  });

  test("keeps upstream shortcuts while exposing IJT market aliases", () => {
    expect(shortcutTarget(fearGreedPlugin.paneTemplates ?? [], "FNG")).toBe("fear-greed");
    expect(shortcutTarget(fearGreedPlugin.paneTemplates ?? [], "FEAR")).toBe("fear-greed");
    expect(shortcutTarget(sectorsPlugin.paneTemplates ?? [], "BI")).toBe("sectors");
    expect(shortcutTarget(sectorsPlugin.paneTemplates ?? [], "SECT")).toBe("sectors");
    expect(shortcutTarget(econCalendarPaneTemplates, "ECON")).toBe("econ-calendar");
    expect(shortcutTarget(econCalendarPaneTemplates, "ECO")).toBe("econ-calendar");
    expect(shortcutTarget(newsWirePaneTemplates, "TOP")).toBe("news-top");
    expect(shortcutTarget(worldIndicesPlugin.paneTemplates ?? [], "WEI")).toBe("world-indices");
    expect(shortcutTarget(correlationPlugin.paneTemplates ?? [], "CORR")).toBe("correlation");
  });

  test("does not introduce duplicate prefixes within each native surface", () => {
    for (const templates of [
      tickerDetailPlugin.paneTemplates ?? [],
      researchPlugin.paneTemplates ?? [],
      newsPlugin.paneTemplates ?? [],
      optionsPlugin.paneTemplates ?? [],
      holdersPlugin.paneTemplates ?? [],
      fearGreedPlugin.paneTemplates ?? [],
      sectorsPlugin.paneTemplates ?? [],
      econCalendarPaneTemplates,
      newsWirePaneTemplates,
      worldIndicesPlugin.paneTemplates ?? [],
      correlationPlugin.paneTemplates ?? [],
    ]) {
      const prefixes = templates.flatMap((template) => template.shortcut?.prefix ?? []);
      expect(new Set(prefixes).size).toBe(prefixes.length);
    }
  });

  test("keeps every built-in pane shortcut globally unambiguous", () => {
    const templates = [
      ...uiBuiltinPlugins.flatMap((plugin) => plugin.paneTemplates ?? []),
      ...econCalendarPaneTemplates,
      ...newsWirePaneTemplates,
    ];
    const prefixes = templates.flatMap((template) => template.shortcut?.prefix ?? []);

    expect(new Set(prefixes).size).toBe(prefixes.length);
  });
});

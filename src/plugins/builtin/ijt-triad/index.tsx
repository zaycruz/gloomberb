import { useMemo } from "react";
import { Box, Text, TextAttributes } from "../../../ui";
import { colors } from "../../../theme/colors";
import { usePaneInstance } from "../../../state/app/context";
import type { GloomPlugin, PaneProps } from "../../../types/plugin";
import { ijtTriadCapability, resolveTriadQuery } from "../../../ijt/intelligence";

export function IjtTriadPane({ width }: PaneProps) {
  const pane = usePaneInstance();
  const query = pane?.params?.query ?? "gold up";
  const result = useMemo(() => resolveTriadQuery(query), [query]);
  const line = "─".repeat(Math.max(12, Math.min(width - 4, 72)));

  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text fg={colors.accent} attributes={TextAttributes.BOLD}>IJT TRIAD · {query.toUpperCase()}</Text>
      <Text fg={colors.border}>{line}</Text>
      {result ? (
        <>
          <Text fg={colors.positive} attributes={TextAttributes.BOLD}>BENEFICIARIES</Text>
          <Text fg={colors.text}>{result.beneficiaries.join("   ")}</Text>
          <Text fg={colors.negative} attributes={TextAttributes.BOLD}>NATURAL HEDGES</Text>
          <Text fg={colors.text}>{result.hedges.join("   ")}</Text>
          <Text fg={colors.accent} attributes={TextAttributes.BOLD}>DIRECTIONAL LOGIC</Text>
          <Text fg={colors.textDim} wrapMode="word">{result.rationale}</Text>
          <Text fg={colors.textMuted}>{result.modelVersion}</Text>
        </>
      ) : (
        <Text fg={colors.negative}>Unsupported thesis: {query}</Text>
      )}
    </Box>
  );
}

export const ijtTriadPlugin: GloomPlugin = {
  id: "ijt-triad",
  name: "IJT TRIAD",
  version: "1.0.0",
  description: "Deterministic thesis beneficiaries, natural hedges, and directional logic.",
  toggleable: true,
  capabilities: [ijtTriadCapability],
  panes: [{
    id: "ijt-triad",
    name: "IJT TRIAD",
    icon: "T",
    component: IjtTriadPane,
    defaultPosition: "right",
    defaultMode: "floating",
    defaultFloatingSize: { width: 72, height: 18 },
  }],
  paneTemplates: [{
    id: "ijt-triad-pane",
    paneId: "ijt-triad",
    label: "IJT TRIAD",
    description: "Resolve a thesis into beneficiaries and natural hedges.",
    keywords: ["triad", "thesis", "hedge", "macro", "commodity", "sector"],
    shortcut: {
      prefix: "TRIAD",
      argPlaceholder: "thesis [up|down]",
      argKind: "text",
      argOptional: true,
    },
    createInstance: (_context, options) => ({
      params: { query: options?.arg?.trim() || "gold up" },
      placement: "floating",
    }),
  }],
};

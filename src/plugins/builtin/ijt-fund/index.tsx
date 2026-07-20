import { useEffect, useState } from "react";
import { Box, Text, TextAttributes } from "../../../ui";
import { colors } from "../../../theme/colors";
import type { FundWorkspaceProjection } from "../../../ijt/fund";
import type { GloomPlugin, PaneProps } from "../../../types/plugin";
import { useCapabilityInvoker } from "../../runtime";

type WorkspaceState =
  | { status: "loading" }
  | { status: "ready"; workspace: FundWorkspaceProjection }
  | { status: "error" };

function useFundWorkspace(): WorkspaceState {
  const invoke = useCapabilityInvoker();
  const [state, setState] = useState<WorkspaceState>({ status: "loading" });
  useEffect(() => {
    let active = true;
    void invoke<FundWorkspaceProjection>("plugin-service.ijt-fund", "workspace", {}).then(
      (workspace) => { if (active) setState({ status: "ready", workspace }); },
      () => { if (active) setState({ status: "error" }); },
    );
    return () => { active = false; };
  }, [invoke]);
  return state;
}

export function IjtFundPane({ height }: PaneProps) {
  const state = useFundWorkspace();
  if (state.status !== "ready") {
    return (
      <Box flexDirection="column" padding={1}>
        {state.status === "loading" ? (
          <Text fg={colors.textDim}>Loading authenticated Fund workspace...</Text>
        ) : (
          <>
            <Text fg={colors.negative} attributes={TextAttributes.BOLD}>IJT FUND WORKSPACE UNAVAILABLE</Text>
            <Text fg={colors.textDim}>Authenticate with IJT Login, then reopen this pane.</Text>
          </>
        )}
      </Box>
    );
  }

  const { workspace } = state;
  const rosterLimit = Math.max(1, Math.floor((height - 14) / 2));
  const transactionLimit = Math.max(1, height - 14 - rosterLimit);
  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text fg={colors.accent} attributes={TextAttributes.BOLD}>IJT CAPITAL ADMIN</Text>
      <Text fg={workspace.freshness === "fresh" ? colors.positive : colors.warning}>
        {workspace.fundStatusSummary} · {workspace.freshness.toUpperCase()} · {workspace.capability.toUpperCase()}
      </Text>
      <Text fg={colors.textMuted}>AS OF {workspace.asOf}</Text>
      <Text fg={colors.text}>{workspace.reconciliationSummary}</Text>
      {workspace.selectedLp ? (
        <Box flexDirection="column">
          <Text fg={colors.textBright} attributes={TextAttributes.BOLD}>{workspace.selectedLp.label} · REV {workspace.selectedLp.revision}</Text>
          <Text fg={colors.text}>{workspace.selectedLp.commitmentSummary}</Text>
          <Text fg={colors.text}>{workspace.selectedLp.capitalAccountSummary}</Text>
        </Box>
      ) : null}
      <Text fg={colors.border}>LP ROSTER</Text>
      {workspace.roster.slice(0, rosterLimit).map((lp) => (
        <Text key={lp.id} fg={lp.state === "active" ? colors.text : colors.textDim}>
          {lp.state === "active" ? "●" : "○"} {lp.label}
        </Text>
      ))}
      {workspace.roster.length === 0 ? <Text fg={colors.textDim}>No LP records available.</Text> : null}
      <Text fg={colors.border}>RECENT TRANSACTIONS</Text>
      {workspace.transactionHistory.slice(0, transactionLimit).map((transaction) => (
        <Text key={transaction.id} fg={transaction.state === "posted" ? colors.text : colors.warning}>
          {transaction.state.toUpperCase().padEnd(12)} {transaction.label}
        </Text>
      ))}
      {workspace.transactionHistory.length === 0 ? <Text fg={colors.textDim}>No transactions available.</Text> : null}
      <Text fg={colors.warning} attributes={TextAttributes.BOLD}>WRITES NOT EXPOSED · authenticated read model only</Text>
      <Text fg={colors.textMuted}>
        SERVER ALLOWS {workspace.allowedWorkflows.length > 0 ? workspace.allowedWorkflows.join(", ") : "none"}
      </Text>
    </Box>
  );
}

export const ijtFundPlugin: GloomPlugin = {
  id: "ijt-fund",
  name: "IJT Fund Operations",
  version: "1.0.0",
  description: "Authenticated, fail-closed IJT Fund workspace.",
  toggleable: true,
  panes: [{
    id: "ijt-fund",
    name: "IJT Capital Admin",
    icon: "F",
    component: IjtFundPane,
    defaultPosition: "right",
    defaultMode: "floating",
    defaultFloatingSize: { width: 88, height: 30 },
  }],
  paneTemplates: [{
    id: "ijt-fund-pane",
    paneId: "ijt-fund",
    label: "IJT Capital Admin",
    description: "Authenticated LP, capital account, transaction, and reconciliation workspace.",
    keywords: ["cap", "fund", "lp", "capital", "transactions", "reconciliation"],
    shortcut: { prefix: "CAP" },
    createInstance: () => ({ placement: "floating" }),
  }],
};

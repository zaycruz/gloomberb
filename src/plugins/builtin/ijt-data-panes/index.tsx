import { useEffect, useState } from "react";
import { Box, Text, TextAttributes } from "../../../ui";
import { colors } from "../../../theme/colors";
import type { GloomPlugin, PaneProps } from "../../../types/plugin";
import { useCapabilityInvoker } from "../../runtime";
import type { CotReportRow, NavHistoryRow } from "../../../ijt/data";
import { formatCurrency } from "../../../utils/format";

type LoadState<T> =
  | { status: "loading" }
  | { status: "ready"; data: T }
  | { status: "error" };

function useIjtData<T>(operationId: string): LoadState<T> {
  const invoke = useCapabilityInvoker();
  const [state, setState] = useState<LoadState<T>>({ status: "loading" });
  useEffect(() => {
    let active = true;
    setState({ status: "loading" });
    void invoke<T>("plugin-service.ijt-data", operationId, {}).then(
      (data) => { if (active) setState({ status: "ready", data }); },
      () => { if (active) setState({ status: "error" }); },
    );
    return () => { active = false; };
  }, [invoke, operationId]);
  return state;
}

function DataState({ state }: { state: "loading" | "error" }) {
  return (
    <Box flexDirection="column" padding={1}>
      {state === "loading" ? (
        <Text fg={colors.textDim}>Loading canonical IJT data...</Text>
      ) : (
        <>
          <Text fg={colors.negative} attributes={TextAttributes.BOLD}>IJT DATA UNAVAILABLE</Text>
          <Text fg={colors.textDim}>Authenticate with IJT Login, then reopen this pane.</Text>
        </>
      )}
    </Box>
  );
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toLocaleString("en-US")}`;
}

export function IjtCotPane({ height }: PaneProps) {
  const state = useIjtData<CotReportRow[]>("cot");
  if (state.status !== "ready") return <DataState state={state.status} />;
  const visibleRows = state.data.slice(0, Math.max(1, height - 8));
  const asOf = state.data[0]?.as_of ?? "unavailable";
  const reportDate = state.data[0]?.report_date ?? "unavailable";
  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text fg={colors.accent} attributes={TextAttributes.BOLD}>IJT COT · {reportDate}</Text>
      <Text fg={colors.textMuted}>Noncommercial and commercial net positioning</Text>
      <Text fg={colors.border}>MARKET                         NONCOMM NET    COMM NET</Text>
      {visibleRows.map((row) => (
        <Text key={`${row.cftc_commodity_code}:${row.market_name}`} fg={colors.text}>
          {row.market_name.slice(0, 28).padEnd(30)}
          {signed(row.long_noncommercial - row.short_noncommercial).padStart(12)}
          {signed(row.long_commercial - row.short_commercial).padStart(12)}
        </Text>
      ))}
      {state.data.length === 0 ? <Text fg={colors.textDim}>No COT rows available.</Text> : null}
      <Text fg={colors.textMuted}>AS OF {asOf}</Text>
    </Box>
  );
}

function percent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function IjtNavPane({ height }: PaneProps) {
  const state = useIjtData<NavHistoryRow[]>("navHistory");
  if (state.status !== "ready") return <DataState state={state.status} />;
  const latest = state.data.at(-1);
  const recent = [...state.data].reverse().slice(0, Math.max(1, height - 13));
  return (
    <Box flexDirection="column" padding={1} gap={1}>
      <Text fg={colors.accent} attributes={TextAttributes.BOLD}>IJT FUND NAV</Text>
      {latest ? (
        <>
          <Text fg={colors.textBright} attributes={TextAttributes.BOLD}>
            {formatCurrency(latest.total_fund_nav, "USD")} · {latest.nav_date}
          </Text>
          <Text fg={colors.text}>
            DEPLOYED {formatCurrency(latest.total_deployed, "USD")}   CASH {formatCurrency(latest.total_cash, "USD")}
          </Text>
          <Text fg={latest.net_return_pct >= 0 ? colors.positive : colors.negative}>
            NET {percent(latest.net_return_pct)}   MTD {percent(latest.mtd_return_pct)}   YTD {percent(latest.ytd_return_pct)}   SI {percent(latest.since_inception_return_pct)}
          </Text>
          <Text fg={colors.border}>DATE          NAV               NET RETURN</Text>
          {recent.map((row) => (
            <Text key={row.nav_date} fg={colors.text}>
              {row.nav_date.padEnd(14)}{formatCurrency(row.total_fund_nav, "USD").padEnd(18)}{percent(row.net_return_pct)}
            </Text>
          ))}
        </>
      ) : <Text fg={colors.textDim}>No NAV history available.</Text>}
    </Box>
  );
}

export const ijtDataPanesPlugin: GloomPlugin = {
  id: "ijt-data-panes",
  name: "IJT Canonical Data",
  version: "1.0.0",
  description: "Authenticated IJT COT and fund NAV terminal surfaces.",
  toggleable: true,
  panes: [
    {
      id: "ijt-cot",
      name: "IJT COT",
      icon: "C",
      component: IjtCotPane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 76, height: 24 },
    },
    {
      id: "ijt-nav",
      name: "IJT Fund NAV",
      icon: "N",
      component: IjtNavPane,
      defaultPosition: "right",
      defaultMode: "floating",
      defaultFloatingSize: { width: 78, height: 25 },
    },
  ],
  paneTemplates: [
    {
      id: "ijt-cot-pane",
      paneId: "ijt-cot",
      label: "IJT COT",
      description: "Latest authenticated Commitments of Traders positioning.",
      keywords: ["cot", "commitments", "traders", "positioning", "futures"],
      shortcut: { prefix: "COT" },
      createInstance: () => ({ placement: "floating" }),
    },
    {
      id: "ijt-nav-pane",
      paneId: "ijt-nav",
      label: "IJT Fund NAV",
      description: "Canonical fund NAV, capital deployment, cash, and returns.",
      keywords: ["nav", "fund", "returns", "cash", "capital"],
      shortcut: { prefix: "NAV" },
      createInstance: () => ({ placement: "floating" }),
    },
  ],
};

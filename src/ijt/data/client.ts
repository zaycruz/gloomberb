import type { IjtAuthConfig } from "../auth";

export interface IbkrPositionRow {
  account_id: string;
  conid: number;
  ticker: string;
  asset_class: string;
  position: number;
  avg_price: number;
  market_price: number;
  market_value: number;
  unrealized_pnl: number;
  currency: string;
  as_of: string;
  fetched_at: string;
}

export interface IbkrAccountSummaryRow {
  account_id: string;
  net_liquidation: number;
  total_cash: number;
  accrued_cash: number;
  stock_mv: number;
  option_mv: number;
  futures_mv: number;
  unrealized_pnl: number;
  realized_pnl: number;
  currency: string;
  as_of: string;
  fetched_at: string;
}

export interface CotReportRow {
  report_date: string;
  market_name: string;
  cftc_commodity_code: string;
  long_noncommercial: number;
  short_noncommercial: number;
  long_commercial: number;
  short_commercial: number;
  asset_mgr_long: number;
  asset_mgr_short: number;
  swap_long: number;
  swap_short: number;
  as_of: string;
}

export interface LpRosterRow {
  id: string;
  full_name: string;
  entity_name: string | null;
  entity_type: string;
  tier: string;
  is_active: boolean;
  is_founding_member: boolean;
  onboarded_at: string | null;
}

export interface NavHistoryRow {
  nav_date: string;
  total_fund_nav: number;
  total_deployed: number;
  total_cash: number;
  gross_return_pct: number;
  net_return_pct: number;
  mtd_return_pct: number;
  ytd_return_pct: number;
  since_inception_return_pct: number;
}

export interface IjtDataClient {
  fetchIbkrPositions(): Promise<IbkrPositionRow[]>;
  fetchIbkrAccountSummary(): Promise<IbkrAccountSummaryRow | null>;
  fetchCotReport(): Promise<CotReportRow[]>;
  fetchLpRoster(): Promise<LpRosterRow[]>;
  fetchNavHistory(): Promise<NavHistoryRow[]>;
}

const POSITION_COLUMNS = "account_id,conid,ticker,asset_class,position,avg_price,market_price,market_value,unrealized_pnl,currency,as_of,fetched_at";
const ACCOUNT_COLUMNS = "account_id,net_liquidation,total_cash,accrued_cash,stock_mv,option_mv,futures_mv,unrealized_pnl,realized_pnl,currency,as_of,fetched_at";
const COT_COLUMNS = "report_date,market_name,cftc_commodity_code,long_noncommercial,short_noncommercial,long_commercial,short_commercial,asset_mgr_long,asset_mgr_short,swap_long,swap_short,as_of";
const LP_COLUMNS = "id,full_name,entity_name,entity_type,tier,is_active,is_founding_member,onboarded_at";
const NAV_COLUMNS = "nav_date,total_fund_nav,total_deployed,total_cash,gross_return_pct,net_return_pct,mtd_return_pct,ytd_return_pct,since_inception_return_pct";
const MAX_RESPONSE_BYTES = 1024 * 1024;

function invalidRow(): never {
  throw new Error("invalid-supabase-row");
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidRow();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) invalidRow();
  return value;
}

function nullableText(value: unknown): string | null {
  return value === null ? null : text(value);
}

function number(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) invalidRow();
  return value;
}

function numberOrZero(value: unknown): number {
  return value === null ? 0 : number(value);
}

function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") invalidRow();
  return value;
}

function rows<T>(value: unknown, parse: (row: unknown) => T): T[] {
  if (!Array.isArray(value)) invalidRow();
  return value.map(parse);
}

export function parseIbkrPosition(value: unknown): IbkrPositionRow {
  const row = record(value);
  return {
    account_id: text(row.account_id), conid: number(row.conid), ticker: text(row.ticker),
    asset_class: text(row.asset_class), position: number(row.position), avg_price: number(row.avg_price),
    market_price: number(row.market_price), market_value: number(row.market_value),
    unrealized_pnl: number(row.unrealized_pnl), currency: text(row.currency),
    as_of: text(row.as_of), fetched_at: text(row.fetched_at),
  };
}

export function parseIbkrAccountSummary(value: unknown): IbkrAccountSummaryRow {
  const row = record(value);
  return {
    account_id: text(row.account_id), net_liquidation: number(row.net_liquidation),
    total_cash: number(row.total_cash), accrued_cash: number(row.accrued_cash),
    stock_mv: numberOrZero(row.stock_mv), option_mv: numberOrZero(row.option_mv),
    futures_mv: numberOrZero(row.futures_mv), unrealized_pnl: numberOrZero(row.unrealized_pnl),
    realized_pnl: numberOrZero(row.realized_pnl), currency: text(row.currency),
    as_of: text(row.as_of), fetched_at: text(row.fetched_at),
  };
}

export function parseCotReport(value: unknown): CotReportRow {
  const row = record(value);
  return {
    report_date: text(row.report_date), market_name: text(row.market_name),
    cftc_commodity_code: text(row.cftc_commodity_code),
    long_noncommercial: number(row.long_noncommercial), short_noncommercial: number(row.short_noncommercial),
    long_commercial: number(row.long_commercial), short_commercial: number(row.short_commercial),
    asset_mgr_long: numberOrZero(row.asset_mgr_long), asset_mgr_short: numberOrZero(row.asset_mgr_short),
    swap_long: numberOrZero(row.swap_long), swap_short: numberOrZero(row.swap_short),
    as_of: text(row.as_of),
  };
}

export function parseLpRoster(value: unknown): LpRosterRow {
  const row = record(value);
  return {
    id: text(row.id), full_name: text(row.full_name), entity_name: nullableText(row.entity_name),
    entity_type: text(row.entity_type), tier: text(row.tier), is_active: boolean(row.is_active),
    is_founding_member: boolean(row.is_founding_member), onboarded_at: nullableText(row.onboarded_at),
  };
}

export function parseNavHistory(value: unknown): NavHistoryRow {
  const row = record(value);
  return {
    nav_date: text(row.nav_date), total_fund_nav: number(row.total_fund_nav),
    total_deployed: number(row.total_deployed), total_cash: number(row.total_cash),
    gross_return_pct: numberOrZero(row.gross_return_pct), net_return_pct: numberOrZero(row.net_return_pct),
    mtd_return_pct: numberOrZero(row.mtd_return_pct), ytd_return_pct: numberOrZero(row.ytd_return_pct),
    since_inception_return_pct: numberOrZero(row.since_inception_return_pct),
  };
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (
    response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !== "application/json" ||
    !response.body
  ) throw new Error("supabase-read-failed");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_RESPONSE_BYTES) throw new Error("supabase-read-failed");
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    try { await reader.cancel(); } catch { /* cleanup only */ }
    reader.releaseLock();
  }
  try { return JSON.parse(body) as unknown; } catch { throw new Error("supabase-read-failed"); }
}

export function createIjtDataClient(options: {
  config: IjtAuthConfig;
  credentialProvider: () => Promise<string>;
  fetcher?: typeof fetch;
  deadlineMs?: number;
}): IjtDataClient {
  const query = async (view: string, params: Record<string, string>): Promise<unknown> => {
    let token: string;
    try { token = await options.credentialProvider(); } catch { throw new Error("supabase-read-unavailable"); }
    if (!/^[\x21-\x7e]{16,8192}$/.test(token)) throw new Error("supabase-read-unavailable");
    const url = new URL(`/rest/v1/${view}`, options.config.supabaseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.deadlineMs ?? 10_000);
    try {
      const response = await (options.fetcher ?? fetch)(url, {
        headers: { apikey: options.config.publishableKey, Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("supabase-read-failed");
      return await readBoundedJson(response);
    } catch (error) {
      if (error instanceof Error && error.message === "invalid-supabase-row") throw error;
      throw new Error("supabase-read-failed");
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    async fetchIbkrPositions() {
      return rows(await query("v_ibkr_positions", { select: POSITION_COLUMNS, order: "ticker.asc" }), parseIbkrPosition);
    },
    async fetchIbkrAccountSummary() {
      const parsed = rows(await query("v_ibkr_account_summary", { select: ACCOUNT_COLUMNS, order: "as_of.desc", limit: "1" }), parseIbkrAccountSummary);
      return parsed[0] ?? null;
    },
    async fetchCotReport() {
      const parsed = rows(await query("v_market_cot", { select: COT_COLUMNS, order: "report_date.desc" }), parseCotReport);
      const latest = parsed[0]?.report_date;
      return latest ? parsed.filter((row) => row.report_date === latest) : parsed;
    },
    async fetchLpRoster() {
      return rows(await query("v_lp_roster", { select: LP_COLUMNS, order: "full_name.asc" }), parseLpRoster);
    },
    async fetchNavHistory() {
      return rows(await query("fund_nav_history", { select: NAV_COLUMNS, order: "nav_date.asc" }), parseNavHistory);
    },
  };
}

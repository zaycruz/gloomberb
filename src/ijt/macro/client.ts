export type MacroIndicatorAvailability = "available" | "missing" | "unavailable";

export interface MacroIndicator {
  key: "vix" | "us_2s10s" | "hy_oas" | "dxy" | "copper";
  label: string;
  unit: string;
  source: "FRED";
  value: number | null;
  observation_date: string | null;
  as_of: string | null;
  stale: boolean;
  availability: MacroIndicatorAvailability;
  null_reason: string | null;
}

export interface MacroIndicatorsResponse {
  source: "FRED";
  generated_at: string;
  indicators: MacroIndicator[];
}

interface Observation {
  date: string;
  value: number;
}

interface MacroClientOptions {
  fetcher?: typeof fetch;
  now?: () => Date;
}

const FRED_CSV_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv";
const MAX_RESPONSE_BYTES = 1024 * 1024;
const FETCH_TIMEOUT_MS = 10_000;

async function readBoundedText(response: Response): Promise<string> {
  if (!response.ok) throw new Error("fred-series-unavailable");
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) throw new Error("fred-response-too-large");
  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_RESPONSE_BYTES) throw new Error("fred-response-too-large");
  return new TextDecoder().decode(body);
}

export function parseFredCsv(csv: string, seriesId: string): Observation[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines[0] !== `observation_date,${seriesId}`) throw new Error("invalid-fred-response");
  return lines.slice(1).flatMap((line) => {
    const match = /^(\d{4}-\d{2}-\d{2}),([^,]+)$/.exec(line);
    if (!match || match[2] === ".") return [];
    const value = Number(match[2]);
    if (!Number.isFinite(value) || new Date(`${match[1]}T00:00:00Z`).toISOString().slice(0, 10) !== match[1]) {
      throw new Error("invalid-fred-response");
    }
    return [{ date: match[1], value }];
  });
}

function isStale(date: string, now: Date, maximumAgeDays: number): boolean {
  const age = now.getTime() - Date.parse(`${date}T00:00:00Z`);
  return !Number.isFinite(age) || age > maximumAgeDays * 86_400_000;
}

export function createIjtMacroClient(options: MacroClientOptions = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());
  const loadSeries = async (seriesId: string): Promise<Observation[]> => {
    const start = new Date(now());
    start.setUTCFullYear(start.getUTCFullYear() - 1);
    const url = new URL(FRED_CSV_URL);
    url.searchParams.set("id", seriesId);
    url.searchParams.set("cosd", start.toISOString().slice(0, 10));
    const response = await fetcher(url, {
      headers: { Accept: "text/csv", "Accept-Encoding": "identity" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    return parseFredCsv(await readBoundedText(response), seriesId);
  };
  const missing = (key: MacroIndicator["key"], label: string, unit: string): MacroIndicator => ({
    key,
    label,
    unit,
    source: "FRED",
    value: null,
    observation_date: null,
    as_of: null,
    stale: false,
    availability: "unavailable",
    null_reason: "FRED series unavailable.",
  });
  const available = (
    key: MacroIndicator["key"],
    label: string,
    unit: string,
    observation: Observation,
    maximumAgeDays: number,
  ): MacroIndicator => ({
    key,
    label,
    unit,
    source: "FRED",
    value: observation.value,
    observation_date: observation.date,
    as_of: `${observation.date}T00:00:00Z`,
    stale: isStale(observation.date, now(), maximumAgeDays),
    availability: "available",
    null_reason: null,
  });

  return {
    async fetchIndicators(): Promise<MacroIndicatorsResponse> {
      const ids = ["VIXCLS", "DGS10", "DGS2", "BAMLH0A0HYM2", "DTWEXBGS", "PCOPPUSDM"] as const;
      const settled = await Promise.allSettled(ids.map((id) => loadSeries(id)));
      const series = new Map(ids.map((id, index) => [
        id,
        settled[index]?.status === "fulfilled" ? settled[index].value : [],
      ]));
      const latest = (id: typeof ids[number]) => series.get(id)?.at(-1);
      const spread = (() => {
        const twoYear = new Map((series.get("DGS2") ?? []).map((point) => [point.date, point.value]));
        return [...(series.get("DGS10") ?? [])].reverse().flatMap((point) => {
          const two = twoYear.get(point.date);
          return two === undefined ? [] : [{ date: point.date, value: point.value - two }];
        })[0];
      })();
      const indicator = (
        key: MacroIndicator["key"],
        label: string,
        unit: string,
        observation: Observation | undefined,
        maximumAgeDays: number,
      ) => observation
        ? available(key, label, unit, observation, maximumAgeDays)
        : missing(key, label, unit);
      return {
        source: "FRED",
        generated_at: now().toISOString(),
        indicators: [
          indicator("vix", "VIX", "index", latest("VIXCLS"), 10),
          indicator("us_2s10s", "US 2s10s", "percentage points", spread, 10),
          indicator("hy_oas", "HY OAS", "percentage points", latest("BAMLH0A0HYM2"), 10),
          indicator("dxy", "Broad USD proxy (FRED DTWEXBGS)", "index", latest("DTWEXBGS"), 14),
          indicator("copper", "Copper (monthly)", "USD / metric tonne", latest("PCOPPUSDM"), 75),
        ],
      };
    },
  };
}

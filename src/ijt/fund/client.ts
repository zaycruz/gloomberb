import type {
  FundClientErrorCode,
  FundCommandOutcome,
  FundWorkflow,
  FundWorkspaceProjection,
} from "./types";

export interface FundServiceCredential {
  scheme: "Bearer";
  token: string;
}

export type FundCredentialProvider = () => Promise<FundServiceCredential>;

export interface VerifiedFundApiContract<T = unknown> {
  verification: "verified";
  baseUrl: string;
  audience: string;
  workspacePath: string;
  commandPaths: Readonly<Partial<Record<FundWorkflow, string>>>;
  decodeWorkspace(value: unknown): FundWorkspaceProjection;
  encodeCommand(workflow: FundWorkflow, command: T): unknown;
  decodeCommandOutcome(value: unknown): FundCommandOutcome;
}

export interface UnverifiedFundApiContract {
  verification: "unverified";
  reason: string;
}

export type FundApiContract<T = unknown> =
  | VerifiedFundApiContract<T>
  | UnverifiedFundApiContract;

const messages: Record<FundClientErrorCode, string> = {
  "contract-unverified": "Fund API contract is not verified.",
  unauthenticated: "Fund access requires authentication.",
  forbidden: "The Fund API denied this operation.",
  "not-found": "The requested fund record is unavailable.",
  validation: "The Fund API rejected the submitted values.",
  conflict: "Canonical fund data changed. Refresh before continuing.",
  "correction-chain-conflict": "The correction chain changed. Refresh before continuing.",
  indeterminate: "The operation outcome is indeterminate. Recover the original receipt.",
  unavailable: "The Fund API is temporarily unavailable.",
  protocol: "The Fund API returned an invalid response.",
};

export class FundApiError extends Error {
  constructor(readonly code: FundClientErrorCode) {
    super(messages[code]);
    this.name = "FundApiError";
  }
}

function fail(code: FundClientErrorCode): FundApiError {
  return new FundApiError(code);
}

function isContractPath(value: unknown): value is string {
  return typeof value === "string" && /^\/[A-Za-z0-9._~!$&'()*+,;=:@%/-]+$/.test(value);
}

function requireVerifiedContract<T>(contract: FundApiContract<T>): VerifiedFundApiContract<T> {
  if (contract.verification !== "verified") throw fail("contract-unverified");
  let baseUrl: URL;
  try {
    baseUrl = new URL(contract.baseUrl);
  } catch {
    throw fail("contract-unverified");
  }
  if (
    baseUrl.protocol !== "https:" ||
    baseUrl.origin !== contract.baseUrl ||
    baseUrl.username ||
    baseUrl.password ||
    !contract.audience.trim() ||
    !isContractPath(contract.workspacePath) ||
    Object.values(contract.commandPaths).some((path) => !isContractPath(path))
  ) {
    throw fail("contract-unverified");
  }
  return contract;
}

const mapHttpStatus = (status: number): FundClientErrorCode =>
  status === 401
    ? "unauthenticated"
    : status === 403
      ? "forbidden"
      : status === 404
        ? "not-found"
        : status === 409
          ? "conflict"
          : status === 422
            ? "validation"
            : [502, 503, 504].includes(status)
              ? "unavailable"
              : "protocol";

export interface FundApiClient<T = unknown> {
  loadWorkspace(): Promise<FundWorkspaceProjection>;
  submit(workflow: FundWorkflow, command: T): Promise<FundCommandOutcome>;
}

export const MAX_FUND_RESPONSE_BYTES = 1024 * 1024;

async function readJsonResponse(response: Response): Promise<unknown> {
  if (
    response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !==
      "application/json" ||
    !response.body
  ) {
    throw fail("protocol");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_FUND_RESPONSE_BYTES) throw fail("protocol");
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Cleanup must not replace the primary response error.
    }
    reader.releaseLock();
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw fail("protocol");
  }
}

export function createFundApiClient<T>(options: {
  contract: FundApiContract<T>;
  credentialProvider: FundCredentialProvider;
  fetcher?: typeof fetch;
  deadlineMs?: number;
  requestIdProvider?: () => string;
  signal?: AbortSignal;
}): FundApiClient<T> {
  const request = async (path: string, init: RequestInit) => {
    const contract = requireVerifiedContract(options.contract);
    if (options.signal?.aborted) throw fail("unauthenticated");
    let credential: FundServiceCredential;
    try {
      credential = await options.credentialProvider();
    } catch {
      throw fail("unauthenticated");
    }
    if (credential.scheme !== "Bearer" || !/^[\x21-\x7e]{1,8192}$/.test(credential.token)) {
      throw fail("unauthenticated");
    }
    const controller = new AbortController();
    const abortFromSession = () => controller.abort();
    options.signal?.addEventListener("abort", abortFromSession, { once: true });
    const timer = setTimeout(() => controller.abort(), options.deadlineMs ?? 10_000);
    try {
      const response = await (options.fetcher ?? fetch)(`${contract.baseUrl}${path}`, {
        ...init,
        headers: {
          "Content-Type": "application/json",
          Authorization: `${credential.scheme} ${credential.token}`,
          "X-Request-ID": options.requestIdProvider?.() ?? crypto.randomUUID(),
        },
        cache: "no-store",
        signal: controller.signal,
      });
      if (controller.signal.aborted) {
        throw fail(init.method === "POST" ? "indeterminate" : "unavailable");
      }
      if (!response.ok) throw fail(mapHttpStatus(response.status));
      const value = await readJsonResponse(response);
      if (controller.signal.aborted) {
        throw fail(init.method === "POST" ? "indeterminate" : "unavailable");
      }
      return value;
    } catch (error) {
      if (error instanceof FundApiError) throw error;
      if (controller.signal.aborted && init.method === "POST") throw fail("indeterminate");
      throw fail("unavailable");
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abortFromSession);
    }
  };

  return {
    async loadWorkspace() {
      const contract = requireVerifiedContract(options.contract);
      const value = await request(contract.workspacePath, { method: "GET" });
      try {
        return contract.decodeWorkspace(value);
      } catch {
        throw fail("protocol");
      }
    },
    async submit(workflow, command) {
      const contract = requireVerifiedContract(options.contract);
      const path = contract.commandPaths[workflow];
      if (!path) throw fail("contract-unverified");
      let body: unknown;
      try {
        body = contract.encodeCommand(workflow, command);
      } catch {
        throw fail("validation");
      }
      const value = await request(path, { method: "POST", body: JSON.stringify(body) });
      try {
        return contract.decodeCommandOutcome(value);
      } catch {
        throw fail("protocol");
      }
    },
  };
}

export const UNVERIFIED_FUND_API_CONTRACT: UnverifiedFundApiContract = Object.freeze({
  verification: "unverified",
  reason: "The canonical Fund API has not been verified for this environment.",
});

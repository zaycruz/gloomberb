import { describe, expect, test } from "bun:test";
import { createFundApiClient, FundApiError } from "./client";
import { FUND_API_CONTRACT } from "./contract";
import { createIjtFundCapability } from "./capability";

const projection = {
  asOf: "2026-07-16T12:00:00.000Z",
  freshness: "fresh",
  capability: "operator",
  allowedWorkflows: ["lp-create", "lp-update", "lp-archive", "contribution-record"],
  roster: [{ id: "lp-1", label: "Example LP", state: "active" }],
  selectedLp: null,
  transactionHistory: [],
  reconciliationSummary: "Reconciled",
  fundStatusSummary: "Open",
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("IJT Fund API contract", () => {
  test("exposes only the read-only workspace operation to renderers", async () => {
    const capability = createIjtFundCapability({
      loadWorkspace: async () => FUND_API_CONTRACT.decodeWorkspace(projection),
    });

    expect(Object.keys(capability.operations)).toEqual(["workspace"]);
    expect(capability.operations.workspace.rendererSafe).toBe(true);
    await expect(capability.operations.workspace.handler?.(
      {},
      { capability, operationId: "workspace" },
    )).resolves.toEqual(projection);
  });

  test("strictly decodes a workspace projection", () => {
    const decoded = FUND_API_CONTRACT.decodeWorkspace(projection);
    expect(decoded.capability).toBe("operator");
    expect(decoded.roster[0]?.label).toBe("Example LP");
    expect(() => FUND_API_CONTRACT.decodeWorkspace({ ...projection, roster: [{}] })).toThrow();
  });

  test("decodes accepted and replayed command receipts", () => {
    expect(
      FUND_API_CONTRACT.decodeCommandOutcome({
        kind: "accepted",
        receiptId: "receipt-1",
        operationId: "operation-1",
      }),
    ).toEqual({ kind: "accepted", receiptId: "receipt-1", operationId: "operation-1" });
    expect(() =>
      FUND_API_CONTRACT.decodeCommandOutcome({ kind: "accepted", operationId: "operation-1" }),
    ).toThrow();
  });

  test("fetches credentials at request time and sends a traceable request", async () => {
    let credentials = 0;
    let captured: RequestInit | undefined;
    const client = createFundApiClient({
      contract: FUND_API_CONTRACT,
      credentialProvider: async () => {
        credentials += 1;
        return { scheme: "Bearer", token: "session-token" };
      },
      requestIdProvider: () => "request-1",
      fetcher: (async (_url: string | URL | Request, init?: RequestInit) => {
        captured = init;
        return jsonResponse(projection);
      }) as typeof fetch,
    });

    await client.loadWorkspace();

    expect(credentials).toBe(1);
    expect(captured?.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer session-token",
      "X-Request-ID": "request-1",
    });
    expect(captured?.cache).toBe("no-store");
  });

  test("fails closed on invalid credentials and invalid response content types", async () => {
    const invalidCredentialClient = createFundApiClient({
      contract: FUND_API_CONTRACT,
      credentialProvider: async () => ({ scheme: "Bearer", token: "contains a space" }),
      fetcher: (async () => jsonResponse(projection)) as typeof fetch,
    });
    await expect(invalidCredentialClient.loadWorkspace()).rejects.toMatchObject({
      code: "unauthenticated",
    });

    const invalidProtocolClient = createFundApiClient({
      contract: FUND_API_CONTRACT,
      credentialProvider: async () => ({ scheme: "Bearer", token: "token" }),
      fetcher: (async () => new Response("not json", { status: 200 })) as typeof fetch,
    });
    await expect(invalidProtocolClient.loadWorkspace()).rejects.toBeInstanceOf(FundApiError);
    await expect(invalidProtocolClient.loadWorkspace()).rejects.toMatchObject({ code: "protocol" });
  });

  test("maps an aborted read to unavailable and an aborted mutation to indeterminate", async () => {
    const fetcher = (async (_url: string | URL | Request, init?: RequestInit) => {
      await new Promise((resolve) => setTimeout(resolve, 15));
      if (init?.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return jsonResponse(projection);
    }) as typeof fetch;
    const options = {
      contract: FUND_API_CONTRACT,
      credentialProvider: async () => ({ scheme: "Bearer" as const, token: "token" }),
      fetcher,
      deadlineMs: 1,
    };

    await expect(createFundApiClient(options).loadWorkspace()).rejects.toMatchObject({
      code: "unavailable",
    });
    await expect(
      createFundApiClient(options).submit("lp-create", { label: "Example LP" }),
    ).rejects.toMatchObject({ code: "indeterminate" });
  });
});

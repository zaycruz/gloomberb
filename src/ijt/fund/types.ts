export const FUND_WORKFLOWS = [
  "lp-create",
  "lp-update",
  "lp-archive",
  "lp-delete",
  "commitment-create",
  "commitment-update",
  "capital-account-create",
  "capital-account-update",
  "contribution-record",
  "transaction-reverse",
  "transaction-replace",
] as const;

export type FundWorkflow = (typeof FUND_WORKFLOWS)[number];

export interface FundWorkspaceProjection {
  asOf: string;
  freshness: "fresh" | "stale";
  capability: "read-only" | "operator";
  allowedWorkflows: FundWorkflow[];
  roster: Array<{ id: string; label: string; state: "active" | "archived" }>;
  selectedLp: null | {
    id: string;
    label: string;
    revision: string;
    commitmentSummary: string;
    capitalAccountSummary: string;
  };
  transactionHistory: Array<{
    id: string;
    label: string;
    state: "posted" | "reversed" | "replacement";
    relatedTransactionId?: string;
  }>;
  reconciliationSummary: string;
  fundStatusSummary: string;
}

export type FundClientErrorCode =
  | "contract-unverified"
  | "unauthenticated"
  | "forbidden"
  | "not-found"
  | "validation"
  | "conflict"
  | "correction-chain-conflict"
  | "indeterminate"
  | "unavailable"
  | "protocol";

export type FundCommandOutcome =
  | { kind: "accepted" | "replayed"; receiptId: string; operationId: string }
  | { kind: "not-accepted" | "recovery-pending"; operationId: string };

export function isFundWorkflow(value: unknown): value is FundWorkflow {
  return typeof value === "string" && (FUND_WORKFLOWS as readonly string[]).includes(value);
}

export function validateFundWorkspaceProjection(value: unknown): FundWorkspaceProjection {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid projection");
  }
  const projection = value as Partial<FundWorkspaceProjection>;
  if (
    typeof projection.asOf !== "string" ||
    !["fresh", "stale"].includes(String(projection.freshness)) ||
    !["read-only", "operator"].includes(String(projection.capability)) ||
    !Array.isArray(projection.allowedWorkflows) ||
    !projection.allowedWorkflows.every(isFundWorkflow) ||
    !Array.isArray(projection.roster) ||
    !Array.isArray(projection.transactionHistory) ||
    typeof projection.reconciliationSummary !== "string" ||
    typeof projection.fundStatusSummary !== "string"
  ) {
    throw new Error("invalid projection");
  }
  if (
    !projection.roster.every(
      (entry) =>
        entry &&
        typeof entry.id === "string" &&
        typeof entry.label === "string" &&
        (entry.state === "active" || entry.state === "archived"),
    )
  ) {
    throw new Error("invalid projection");
  }
  if (
    !projection.transactionHistory.every(
      (entry) =>
        entry &&
        typeof entry.id === "string" &&
        typeof entry.label === "string" &&
        ["posted", "reversed", "replacement"].includes(entry.state),
    )
  ) {
    throw new Error("invalid projection");
  }
  if (
    projection.selectedLp !== null &&
    (!projection.selectedLp ||
      typeof projection.selectedLp.id !== "string" ||
      typeof projection.selectedLp.label !== "string" ||
      typeof projection.selectedLp.revision !== "string" ||
      typeof projection.selectedLp.commitmentSummary !== "string" ||
      typeof projection.selectedLp.capitalAccountSummary !== "string")
  ) {
    throw new Error("invalid projection");
  }
  return projection as FundWorkspaceProjection;
}

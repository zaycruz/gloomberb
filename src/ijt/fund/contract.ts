import type { VerifiedFundApiContract } from "./client";
import {
  FUND_WORKFLOWS,
  type FundCommandOutcome,
  type FundWorkflow,
  validateFundWorkspaceProjection,
} from "./types";

export type FundCommand = Readonly<Record<string, unknown>>;

const commandPaths = Object.freeze(
  Object.fromEntries(
    FUND_WORKFLOWS.map((workflow) => [workflow, `/functions/v1/fund-admin/${workflow}`]),
  ) as Record<FundWorkflow, string>,
);

export function decodeFundCommandOutcome(value: unknown): FundCommandOutcome {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("invalid command outcome");
  }
  const outcome = value as Partial<FundCommandOutcome>;
  if (
    !["accepted", "replayed", "not-accepted", "recovery-pending"].includes(
      String(outcome.kind),
    ) ||
    typeof outcome.operationId !== "string" ||
    outcome.operationId.length === 0
  ) {
    throw new Error("invalid command outcome");
  }
  if (
    (outcome.kind === "accepted" || outcome.kind === "replayed") &&
    (typeof outcome.receiptId !== "string" || outcome.receiptId.length === 0)
  ) {
    throw new Error("invalid command outcome");
  }
  return outcome as FundCommandOutcome;
}

export const FUND_API_CONTRACT: VerifiedFundApiContract<FundCommand> = Object.freeze({
  verification: "verified",
  baseUrl: "https://aezweyjehriqeadenfjw.supabase.co",
  audience: "authenticated fund operators",
  workspacePath: "/functions/v1/fund-admin",
  commandPaths,
  decodeWorkspace: validateFundWorkspaceProjection,
  encodeCommand(_workflow: FundWorkflow, command: FundCommand) {
    if (typeof command !== "object" || command === null || Array.isArray(command)) {
      throw new Error("command must be an object");
    }
    return command;
  },
  decodeCommandOutcome: decodeFundCommandOutcome,
});

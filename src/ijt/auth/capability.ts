import type { CapabilitySchema, PluginCapability } from "../../capabilities";
import { createIjtAuthBackend } from "./backend";
import { loadIjtAuthConfig } from "./config";
import { createIjtAuthSession, type IjtAuthSession } from "./session";

const credentialsSchema: CapabilitySchema<{ email: string; password: string }> = {
  parse(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid-credentials");
    }
    const input = value as Record<string, unknown>;
    if (typeof input.email !== "string" || typeof input.password !== "string") {
      throw new Error("invalid-credentials");
    }
    return { email: input.email, password: input.password };
  },
};

export function createIjtAuthCapability(session: IjtAuthSession): PluginCapability {
  return {
    id: "plugin-service.ijt-auth",
    kind: "plugin-service",
    name: "IJT Authentication",
    operations: {
      snapshot: {
        kind: "read",
        rendererSafe: true,
        cli: { sideEffectLevel: "none" },
        handler: () => session.getSnapshot(),
      },
      signIn: {
        kind: "action",
        rendererSafe: true,
        input: credentialsSchema,
        cli: {
          sideEffectLevel: "network-write",
          safety: ["Credentials are consumed by the backend and never returned."],
        },
        handler: async ({ email, password }) => {
          await session.signIn(email, password);
          return session.getSnapshot();
        },
      },
      signOut: {
        kind: "action",
        rendererSafe: true,
        cli: { sideEffectLevel: "network-write" },
        handler: async () => {
          await session.signOut();
          return session.getSnapshot();
        },
      },
      changes: {
        kind: "stream",
        rendererSafe: true,
        cli: { sideEffectLevel: "none" },
        subscribe: (_input, emit) => session.subscribe(emit),
      },
    },
  };
}

const config = loadIjtAuthConfig();
export const ijtAuthSession = createIjtAuthSession(
  config.status === "available" ? createIjtAuthBackend(config.config) : null,
);
export const ijtAuthCapability = createIjtAuthCapability(ijtAuthSession);

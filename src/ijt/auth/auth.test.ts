import { describe, expect, test } from "bun:test";
import { createIjtAuthBackend, type IjtAuthBackend, type SessionGrant } from "./backend";
import { createIjtAuthCapability } from "./capability";
import { IJT_SUPABASE_URL, validateIjtAuthConfig } from "./config";
import { createIjtAuthSession } from "./session";

const publishableKey = `sb_publishable_${"a".repeat(24)}`;

function grant(overrides: Partial<SessionGrant> = {}): SessionGrant {
  return {
    accessToken: "access-token-1234567890",
    refreshToken: "refresh-token-1234567890",
    expiresAt: Date.now() + 3_600_000,
    identity: { subject: "user-1", displayLabel: "operator@example.com" },
    ...overrides,
  };
}

describe("IJT auth config and backend", () => {
  test("accepts only the pinned Supabase project and publishable-key shape", () => {
    expect(validateIjtAuthConfig({ supabaseUrl: IJT_SUPABASE_URL, publishableKey })).toEqual({
      supabaseUrl: IJT_SUPABASE_URL,
      publishableKey,
    });
    expect(() => validateIjtAuthConfig({
      supabaseUrl: "https://attacker.example",
      publishableKey,
    })).toThrow("invalid-config");
  });

  test("uses the Supabase password grant without persisting or returning credentials", async () => {
    let request: { url: string; init?: RequestInit } | undefined;
    const backend = createIjtAuthBackend(
      { supabaseUrl: IJT_SUPABASE_URL, publishableKey },
      {
        fetcher: (async (url: string | URL | Request, init?: RequestInit) => {
          request = { url: String(url), init };
          return new Response(JSON.stringify({
            access_token: "access-token-1234567890",
            refresh_token: "refresh-token-1234567890",
            expires_in: 3600,
            user: { id: "user-1", email: "operator@example.com" },
          }), { headers: { "content-type": "application/json" } });
        }) as typeof fetch,
      },
    );

    const result = await backend.signInWithPassword({
      email: "operator@example.com",
      password: "do-not-log-this",
    });

    expect(request?.url).toBe(`${IJT_SUPABASE_URL}/auth/v1/token?grant_type=password`);
    expect(request?.init?.cache).toBe("no-store");
    expect(request?.init?.body).toBe(JSON.stringify({
      email: "operator@example.com",
      password: "do-not-log-this",
    }));
    expect(result.identity).toEqual({ subject: "user-1", displayLabel: "operator@example.com" });
  });

  test("accepts an empty successful logout response", async () => {
    let authorization: string | null = null;
    const backend = createIjtAuthBackend(
      { supabaseUrl: IJT_SUPABASE_URL, publishableKey },
      {
        fetcher: (async (_url: string | URL | Request, init?: RequestInit) => {
          authorization = new Headers(init?.headers).get("authorization");
          return new Response(null, { status: 204 });
        }) as typeof fetch,
      },
    );

    await backend.signOut("access-token-1234567890");
    expect(authorization).toBe("Bearer access-token-1234567890");
  });
});

describe("IJT volatile auth session", () => {
  test("never exposes tokens through renderer-safe capability results", async () => {
    const backend: IjtAuthBackend = {
      signInWithPassword: async () => grant(),
      refresh: async () => grant(),
      signOut: async () => {},
    };
    const session = createIjtAuthSession(backend);
    const capability = createIjtAuthCapability(session);
    const snapshot = await capability.operations.signIn.handler?.(
      { email: "operator@example.com", password: "password" },
      { capability, operationId: "signIn" },
    );

    expect(snapshot).toEqual({
      status: "authenticated",
      identity: { subject: "user-1", displayLabel: "operator@example.com" },
      persistence: "volatile",
    });
    expect(JSON.stringify(snapshot)).not.toContain("token");
    expect(session.currentAccessToken()).toBe("access-token-1234567890");
  });

  test("retires the session when refresh changes the authenticated subject", async () => {
    let now = Date.now();
    const backend: IjtAuthBackend = {
      signInWithPassword: async () => grant({ expiresAt: now + 30_000 }),
      refresh: async () => grant({
        expiresAt: now + 3_600_000,
        identity: { subject: "different-user", displayLabel: "other@example.com" },
      }),
      signOut: async () => {},
    };
    const session = createIjtAuthSession(backend, () => now);
    await session.signIn("operator@example.com", "password");

    await expect(session.ensureValidSession()).rejects.toThrow("reauthentication-required");
    expect(session.getSnapshot()).toEqual({ status: "reauthentication-required" });
    expect(session.currentAccessToken()).toBeNull();
    now += 1;
  });

  test("fails closed when auth configuration is unavailable", async () => {
    const session = createIjtAuthSession(null);
    expect(session.getSnapshot()).toEqual({
      status: "unavailable",
      reason: "contract-unverified",
    });
    await expect(session.signIn("operator@example.com", "password"))
      .rejects.toThrow("contract-unverified");
  });
});

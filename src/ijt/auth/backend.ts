import type { IjtAuthConfig } from "./config";

export interface AuthIdentity {
  subject: string;
  displayLabel: string;
}

export interface SessionGrant {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  identity: AuthIdentity;
}

export interface IjtAuthBackend {
  signInWithPassword(input: { email: string; password: string }): Promise<SessionGrant>;
  refresh(refreshToken: string): Promise<SessionGrant>;
  signOut(accessToken?: string): Promise<void>;
}

const MAX_AUTH_RESPONSE_BYTES = 1024 * 1024;
const AUTH_DEADLINE_MS = 15_000;

function validOpaqueToken(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 16 &&
    value.length <= 8192 &&
    ![...value].some((character) => /\p{Cc}/u.test(character))
  );
}

async function readBoundedJson(response: Response): Promise<unknown> {
  if (
    response.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase() !==
      "application/json" ||
    !response.body
  ) {
    throw new Error("auth-service");
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
      if (bytes > MAX_AUTH_RESPONSE_BYTES) throw new Error("auth-service");
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    try {
      await reader.cancel();
    } catch {
      // Cleanup must not replace the primary protocol error.
    }
    reader.releaseLock();
  }
  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new Error("auth-service");
  }
}

function decodeGrant(value: unknown): SessionGrant {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("auth-service");
  }
  const response = value as Record<string, unknown>;
  const user = response.user as Record<string, unknown> | undefined;
  const expiresAtSeconds = response.expires_at;
  const expiresInSeconds = response.expires_in;
  const expiresAt = typeof expiresAtSeconds === "number"
    ? expiresAtSeconds * 1000
    : typeof expiresInSeconds === "number"
      ? Date.now() + expiresInSeconds * 1000
      : 0;
  if (
    !validOpaqueToken(response.access_token) ||
    !validOpaqueToken(response.refresh_token) ||
    !Number.isSafeInteger(expiresAt) ||
    expiresAt - Date.now() < 5_000 ||
    typeof user?.id !== "string" ||
    !user.id ||
    typeof user.email !== "string" ||
    !user.email
  ) {
    throw new Error("auth-service");
  }
  return {
    accessToken: response.access_token,
    refreshToken: response.refresh_token,
    expiresAt,
    identity: { subject: user.id, displayLabel: user.email },
  };
}

export function createIjtAuthBackend(
  config: IjtAuthConfig,
  options: { fetcher?: typeof fetch; deadlineMs?: number } = {},
): IjtAuthBackend {
  let operationQueue: Promise<void> = Promise.resolve();
  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const queued = operationQueue.then(operation, operation);
    operationQueue = queued.then(() => undefined, () => undefined);
    return queued;
  };
  const request = async (
    path: string,
    body: Record<string, unknown> | undefined,
    accessToken?: string,
  ): Promise<unknown> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.deadlineMs ?? AUTH_DEADLINE_MS);
    try {
      const response = await (options.fetcher ?? fetch)(`${config.supabaseUrl}${path}`, {
        method: "POST",
        headers: {
          apikey: config.publishableKey,
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("auth-service");
      if (response.status === 204) return null;
      return await readBoundedJson(response);
    } catch {
      throw new Error("auth-service");
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    signInWithPassword: ({ email, password }) => serialize(async () => decodeGrant(await request(
      "/auth/v1/token?grant_type=password",
      { email, password },
    ))),
    refresh: (refreshToken) => serialize(async () => {
      if (!validOpaqueToken(refreshToken)) throw new Error("auth-service");
      return decodeGrant(await request(
        "/auth/v1/token?grant_type=refresh_token",
        { refresh_token: refreshToken },
      ));
    }),
    signOut: (accessToken) => serialize(async () => {
      if (!accessToken) return;
      if (!validOpaqueToken(accessToken)) throw new Error("auth-service");
      await request("/auth/v1/logout", undefined, accessToken);
    }),
  };
}

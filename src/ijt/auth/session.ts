import type { AuthIdentity, IjtAuthBackend, SessionGrant } from "./backend";

export type AuthSessionSnapshot =
  | { status: "signed-out" }
  | { status: "authenticating" }
  | { status: "authenticated"; identity: AuthIdentity; persistence: "volatile" }
  | { status: "refreshing"; identity: AuthIdentity; persistence: "volatile" }
  | { status: "reauthentication-required" }
  | { status: "unavailable"; reason: "contract-unverified" | "auth-service" };

export interface IjtAuthSession {
  getSnapshot(): AuthSessionSnapshot;
  subscribe(listener: (snapshot: AuthSessionSnapshot) => void): () => void;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  ensureValidSession(): Promise<void>;
  currentAccessToken(): string | null;
}

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REFRESH_LEAD_TIME_MS = 60_000;

export function createIjtAuthSession(
  backend: IjtAuthBackend | null,
  now: () => number = Date.now,
): IjtAuthSession {
  let snapshot: AuthSessionSnapshot = backend
    ? { status: "signed-out" }
    : { status: "unavailable", reason: "contract-unverified" };
  let grant: SessionGrant | null = null;
  let generation = 0;
  let refreshOperation: Promise<void> | null = null;
  const listeners = new Set<(value: AuthSessionSnapshot) => void>();
  const publish = (next: AuthSessionSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener(next);
  };
  const acceptGrant = (next: SessionGrant, expectedGeneration: number, priorSubject?: string) => {
    if (
      generation !== expectedGeneration ||
      next.expiresAt - now() < 5_000 ||
      (priorSubject && next.identity.subject !== priorSubject)
    ) {
      throw new Error("invalid-session");
    }
    grant = next;
    publish({ status: "authenticated", identity: next.identity, persistence: "volatile" });
  };
  const refresh = async () => {
    if (!backend || !grant) throw new Error("reauthentication-required");
    if (refreshOperation) return refreshOperation;
    const source = grant;
    const expectedGeneration = generation;
    publish({ status: "refreshing", identity: source.identity, persistence: "volatile" });
    refreshOperation = (async () => {
      try {
        const next = await backend.refresh(source.refreshToken);
        acceptGrant(next, expectedGeneration, source.identity.subject);
      } catch {
        if (generation === expectedGeneration) {
          generation += 1;
          grant = null;
          publish({ status: "reauthentication-required" });
        }
        throw new Error("reauthentication-required");
      } finally {
        refreshOperation = null;
      }
    })();
    return refreshOperation;
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async signIn(email, password) {
      if (!backend) throw new Error("contract-unverified");
      if (
        typeof email !== "string" ||
        email.length > 320 ||
        !EMAIL_SHAPE.test(email) ||
        typeof password !== "string" ||
        password.length < 1 ||
        password.length > 4096
      ) {
        throw new Error("invalid-credentials");
      }
      const expectedGeneration = ++generation;
      grant = null;
      publish({ status: "authenticating" });
      try {
        acceptGrant(await backend.signInWithPassword({ email, password }), expectedGeneration);
      } catch {
        if (generation === expectedGeneration) {
          grant = null;
          publish({ status: "reauthentication-required" });
        }
        throw new Error("invalid-credentials");
      }
    },
    async signOut() {
      const retired = grant;
      generation += 1;
      grant = null;
      publish({ status: "signed-out" });
      try {
        await backend?.signOut(retired?.accessToken);
      } catch {
        // Volatile local retirement is authoritative.
      }
    },
    async ensureValidSession() {
      if (!grant || snapshot.status === "reauthentication-required") {
        throw new Error("reauthentication-required");
      }
      if (grant.expiresAt - now() <= REFRESH_LEAD_TIME_MS) await refresh();
      if (!grant || grant.expiresAt <= now()) throw new Error("reauthentication-required");
    },
    currentAccessToken: () =>
      grant && (snapshot.status === "authenticated" || snapshot.status === "refreshing")
        ? grant.accessToken
        : null,
  };
}

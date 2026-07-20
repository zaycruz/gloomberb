export const IJT_SUPABASE_URL = "https://aezweyjehriqeadenfjw.supabase.co" as const;

export interface IjtAuthConfig {
  supabaseUrl: typeof IJT_SUPABASE_URL;
  publishableKey: string;
}

const PUBLISHABLE_KEY = /^sb_publishable_[A-Za-z0-9_-]{20,512}$/;

export function validateIjtAuthConfig(value: unknown): IjtAuthConfig {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("invalid-config");
  }
  const config = value as Record<string, unknown>;
  if (
    Object.keys(config).length !== 2 ||
    config.supabaseUrl !== IJT_SUPABASE_URL ||
    typeof config.publishableKey !== "string" ||
    !PUBLISHABLE_KEY.test(config.publishableKey)
  ) {
    throw new Error("invalid-config");
  }
  return { supabaseUrl: IJT_SUPABASE_URL, publishableKey: config.publishableKey };
}

export function loadIjtAuthConfig(
  env: Record<string, unknown> = process.env,
): { status: "available"; config: IjtAuthConfig } | { status: "unavailable" } {
  try {
    return {
      status: "available",
      config: validateIjtAuthConfig({
        supabaseUrl: env.IJT_SUPABASE_URL,
        publishableKey: env.IJT_SUPABASE_PUBLISHABLE_KEY,
      }),
    };
  } catch {
    return { status: "unavailable" };
  }
}

import type { GloomPlugin } from "../../types/plugin";
import { ijtAuthCapability } from "../../ijt/auth";
import { ijtFundCapability } from "../../ijt/fund";
import { ijtSimulationCapability } from "../../ijt/risk";
import { ijtDataCapability } from "../../ijt/data";
import { ijtMacroCapability } from "../../ijt/macro";

export const ijtPlatformPlugin: GloomPlugin = {
  id: "ijt-platform",
  name: "IJT Platform",
  version: "1.0.0",
  capabilities: [
    ijtAuthCapability,
    ijtDataCapability,
    ijtFundCapability,
    ijtSimulationCapability,
    ijtMacroCapability,
  ],
  setup(ctx) {
    ctx.registerCommand({
      id: "ijt-auth-login",
      label: "IJT Login",
      description: "Sign in to IJT fund and canonical data services",
      keywords: ["ijt", "login", "sign in", "supabase", "fund"],
      category: "config",
      wizardLayout: "form",
      wizard: [
        { key: "email", label: "Email", type: "text", placeholder: "operator@example.com" },
        { key: "password", label: "Password", type: "password", placeholder: "Your password" },
        {
          key: "_validate",
          label: "Signing in...",
          type: "info",
          body: ["Connecting to IJT services...", "Authenticated for this app session."],
        },
      ],
      execute: async (values) => {
        if (!values?.email || !values.password) throw new Error("Email and password are required.");
        await ctx.invokeCapability("plugin-service.ijt-auth", "signIn", {
          email: values.email,
          password: values.password,
        });
        ctx.notify({
          body: "IJT session authenticated. Sign-in is memory-only until protected storage lands.",
          type: "success",
        });
      },
    });
    ctx.registerCommand({
      id: "ijt-auth-logout",
      label: "IJT Logout",
      description: "Retire the current IJT service session",
      keywords: ["ijt", "logout", "sign out", "fund"],
      category: "config",
      execute: async () => {
        await ctx.invokeCapability("plugin-service.ijt-auth", "signOut", {});
        ctx.notify({ body: "IJT session retired.", type: "info" });
      },
    });
  },
};

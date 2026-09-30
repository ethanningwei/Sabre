import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";

const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean),
);

/** Email/password sign-in, for local testing only. Never enabled in production. */
export const devAuthEnabled = process.env.DEV_AUTH === "1" && process.env.NODE_ENV !== "production";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      prompt: "select_account",
    },
  },
  emailAndPassword: { enabled: devAuthEnabled },
  user: {
    additionalFields: {
      // never settable by the client — only admins change these, server-side
      role: { type: "string", defaultValue: "pending", input: false },
      subunitId: { type: "string", required: false, input: false },
      active: { type: "boolean", defaultValue: true, input: false },
    },
  },
  databaseHooks: {
    user: {
      create: {
        // bootstrap: listed emails become admins; everyone else waits for approval
        async before(u) {
          const role = adminEmails.has(u.email.toLowerCase()) ? "admin" : "pending";
          return { data: { ...u, role } };
        },
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
  },
  plugins: [nextCookies()],
});

export type AuthSession = typeof auth.$Infer.Session;

import { createServerFn } from "@tanstack/react-start";
import { createSessionToken } from "./session.server";

/**
 * Server-only authentication. Staff passwords stay in server-side environment
 * variables. Successful logins receive a short-lived HMAC session used to
 * authorize MongoDB operations.
 */
export type StaffRole = "Guard" | "Admin" | "EClub" | "Dev";

export interface StaffAccount {
  /** Role label shown on the guard bar. */
  role: string;
  /** Short badge label. */
  badge: string;
  /** Stable identifier used by the client session (never the password itself). */
  staffRole: StaffRole;
}

/** Reads a required secret, rejecting blank/placeholder values. */
function requiredSecret(key: string): string | null {
  const value = process.env[key];
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === "change-me") return null;
  return trimmed;
}

/** The table of staff accounts. Passwords live on the server only. */
function staffTable(): { account: StaffAccount; envKey: string }[] {
  return [
    {
      account: { role: "Security Guard", badge: "GUARD", staffRole: "Guard" },
      envKey: "STAFF_GUARD_PASSWORD",
    },
    {
      account: { role: "School Admin", badge: "ADMIN", staffRole: "Admin" },
      envKey: "STAFF_ADMIN_PASSWORD",
    },
    {
      account: { role: "Electronics Club", badge: "E-CLUB", staffRole: "EClub" },
      envKey: "STAFF_ECLUB_PASSWORD",
    },
    {
      account: { role: "Lead Developer", badge: "DEV", staffRole: "Dev" },
      envKey: "STAFF_DEV_PASSWORD",
    },
  ];
}

/** Constant-time-ish comparison to avoid trivial timing leaks. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}


/* ------------------------------ server fns ------------------------------- */

/**
 * Verifies a staff password and returns a short-lived MongoDB application session plus
 * the account's public identity. The password never leaves the server.
 */
export const staffSignInFn = createServerFn({ method: "POST" })
  .validator((data: { password: string }) => {
    if (typeof data?.password !== "string") throw new Error("Invalid request");
    return { password: data.password.slice(0, 200) };
  })
  .handler(async ({ data }) => {
    const candidate = data.password.trim();
    if (!candidate) return { ok: false as const };

    for (const { account, envKey } of staffTable()) {
      const expected = requiredSecret(envKey);
      if (expected && safeEqual(candidate, expected)) {
        try {
          const token = await createSessionToken(account.staffRole, account.badge);
          return { ok: true as const, account, token };
        } catch {
          return { ok: false as const, reason: "auth-not-configured" as const };
        }
      }
    }
    // Distinguish "nothing is configured yet" from "wrong password" so setup
    // problems are obvious instead of looking like a bad credential.
    const anyConfigured = staffTable().some((entry) => requiredSecret(entry.envKey) !== null);
    return {
      ok: false as const,
      reason: anyConfigured ? undefined : ("no-passwords-set" as const),
    };
  });

/**
 * Verifies the admin dashboard passcode and returns a role-scoped application session.
 */
export const adminSignInFn = createServerFn({ method: "POST" })
  .validator((data: { password: string }) => {
    if (typeof data?.password !== "string") throw new Error("Invalid request");
    return { password: data.password.slice(0, 200) };
  })
  .handler(async ({ data }) => {
    const expected = requiredSecret("ADMIN_PASSWORD");
    if (!expected || !safeEqual(data.password.trim(), expected)) {
      return { ok: false as const };
    }
    try {
      const token = await createSessionToken("Admin", "ADMIN");
      return { ok: true as const, token };
    } catch {
      return { ok: false as const, reason: "auth-not-configured" as const };
    }
  });

import { randomUUID } from "node:crypto";

export type SessionRole = "Guard" | "Admin" | "EClub" | "Dev";

export interface StaffSession {
  sub: string;
  role: SessionRole;
  badge: string;
  exp: number;
}

function requiredSecret(key: string): string {
  const value = process.env[key]?.trim();
  if (!value || value === "change-me") {
    throw new Error(`${key} is not configured`);
  }
  return value;
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlFromString(value: string): string {
  return base64Url(new TextEncoder().encode(value));
}

function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

async function signingKey(): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(requiredSecret("SESSION_SECRET")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(
  role: SessionRole,
  badge: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: StaffSession = {
    sub: `lphs-${role.toLowerCase()}-${randomUUID()}`,
    role,
    badge,
    exp: now + 8 * 60 * 60,
  };
  const encoded = base64UrlFromString(JSON.stringify(payload));
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    new TextEncoder().encode(encoded),
  );
  return `${encoded}.${base64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string): Promise<StaffSession | null> {
  try {
    const [encoded, encodedSignature] = token.split(".");
    if (!encoded || !encodedSignature) return null;

    const valid = await crypto.subtle.verify(
      "HMAC",
      await signingKey(),
      (new Uint8Array(fromBase64Url(encodedSignature))).buffer as ArrayBuffer,
      new TextEncoder().encode(encoded),
    );
    if (!valid) return null;

    const session = JSON.parse(new TextDecoder().decode(fromBase64Url(encoded))) as StaffSession;
    if (!session || typeof session.exp !== "number" || session.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    if (!["Guard", "Admin", "EClub", "Dev"].includes(session.role)) return null;
    if (typeof session.badge !== "string" || typeof session.sub !== "string") return null;
    return session;
  } catch {
    return null;
  }
}

export async function requireSession(token: string | undefined): Promise<StaffSession> {
  if (!token) throw new Error("Authentication required");
  const session = await verifySessionToken(token);
  if (!session) throw new Error("Authentication required");
  return session;
}

export async function requireRole(
  token: string | undefined,
  roles: SessionRole[],
): Promise<StaffSession> {
  const session = await requireSession(token);
  if (!roles.includes(session.role)) throw new Error("Permission denied");
  return session;
}

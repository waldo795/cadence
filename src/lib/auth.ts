/**
 * Access control.
 *
 * A single shared password, proportionate to a tool used by one or two people.
 * It is not multi-user, has no roles and no account recovery — but it does stop
 * the thing that actually matters once this is public: anyone with the URL
 * reading or deleting a real client list.
 *
 * Sessions are a signed, expiring cookie rather than server state, so there is
 * nothing to store and nothing to invalidate on restart. Web Crypto is used
 * throughout because this runs in Next.js middleware, where `node:crypto` is
 * unavailable.
 */

export const SESSION_COOKIE = "cadence_session";
const SESSION_DAYS = 14;

function secret(): string {
  // Falling back to the password keeps configuration to one variable. Set
  // SESSION_SECRET separately to invalidate every session without changing the
  // password.
  return process.env.SESSION_SECRET?.trim() || process.env.APP_PASSWORD?.trim() || "";
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value)));
}

/** Length-independent, constant-time comparison. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(now = Date.now()): Promise<string> {
  const expires = now + SESSION_DAYS * 86_400_000;
  return `${expires}.${await sign(String(expires))}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token || !secret()) return false;

  const [expiresRaw, signature] = token.split(".");
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || !signature) return false;
  if (expires < Date.now()) return false;

  return timingSafeEqual(signature, await sign(expiresRaw));
}

/** Compared in constant time so a wrong password leaks nothing by timing. */
export async function passwordMatches(candidate: string): Promise<boolean> {
  const expected = process.env.APP_PASSWORD?.trim();
  if (!expected) return false;
  // Hash both sides first so the comparison length is fixed regardless of input.
  const [a, b] = await Promise.all([sign(`pw:${candidate}`), sign(`pw:${expected}`)]);
  return timingSafeEqual(a, b);
}

export const SESSION_MAX_AGE_SECONDS = SESSION_DAYS * 86_400;

/**
 * Whether the gate is switched on.
 *
 * With `APP_PASSWORD` unset, local development stays frictionless — but a
 * production deployment refuses to serve at all rather than quietly running
 * wide open, which is the mistake that actually happens.
 */
export function authConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD?.trim());
}

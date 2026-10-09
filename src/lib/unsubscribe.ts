/**
 * Unsubscribe links that cannot be guessed or edited into someone else's.
 *
 * The link goes out in an email, so the only thing identifying the recipient
 * is whatever is in the URL. Without a signature, `?p=profile_002` would
 * unsubscribe a different bride — and the person doing it would not even have
 * to mean any harm, just forward the email to a friend who clicked.
 */

const encoder = new TextEncoder();

function secret(): string {
  /*
   * Falls back through the same chain as the session signer. Unset in local
   * development gives a fixed development key, which is fine because nothing
   * is being protected from anyone; in production `APP_PASSWORD` is always
   * set, because the app refuses to serve without it.
   */
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.APP_PASSWORD?.trim() ||
    "cadence-development-unsubscribe-key"
  );
}

function toBase64Url(bytes: ArrayBuffer): string {
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function sign(value: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

export async function unsubscribeToken(profileId: string): Promise<string> {
  return sign(`unsub:${profileId}`);
}

/**
 * Deliberately never expires.
 *
 * An unsubscribe link in a year-old email must still work — a dead one means
 * the only way left to stop the emails is a spam complaint, which costs the
 * sending domain far more than the unsubscribe would have.
 */
export async function verifyUnsubscribeToken(
  profileId: string,
  token: string | undefined | null,
): Promise<boolean> {
  if (!token) return false;
  const expected = await unsubscribeToken(profileId);
  if (expected.length !== token.length) return false;

  // Constant-time: a length-independent early return would leak the prefix a
  // guess got right, one character at a time.
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ token.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * The absolute URL to put in an email.
 *
 * Absolute because a relative path in an inbox resolves against the mail
 * client, not the app. `APP_URL` is read once here so a misconfigured host
 * produces one obviously broken link rather than a subtly wrong one.
 */
export async function unsubscribeUrl(profileId: string): Promise<string | undefined> {
  const base = (
    process.env.APP_URL?.trim() ||
    (process.env.RAILWAY_PUBLIC_DOMAIN?.trim()
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN.trim()}`
      : "")
  ).replace(/\/+$/, "");

  if (!base) return undefined;
  const token = await unsubscribeToken(profileId);
  return `${base}/unsubscribe?p=${encodeURIComponent(profileId)}&t=${token}`;
}

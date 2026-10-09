import type { EmailSendRequest, EmailSendResult, EmailTransport } from "./transport";

/**
 * Resend, over its HTTP API.
 *
 * No SDK: one POST with a bearer token is less to keep current than a
 * dependency, and it keeps the container image small.
 */

const ENDPOINT = "https://api.resend.com/emails";

interface ResendOptions {
  apiKey: string;
  /**
   * Must be on a domain verified in Resend. Until one is, Resend's sandbox
   * sender only delivers to the address that owns the account — which is fine
   * for test mode and not fine for going live.
   */
  from: string;
  replyTo?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The templates are written as plain text with blank lines between
 * paragraphs, so that is what decides the markup.
 */
function toHtml(text: string): string {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="margin:0 0 16px">${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");

  return [
    '<div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;',
    'font-size:15px;line-height:1.6;color:#1a1a1a;max-width:560px;margin:0 auto;padding:24px">',
    paragraphs,
    "</div>",
  ].join("");
}

export function createResendTransport(options: ResendOptions): EmailTransport {
  return {
    name: "resend",

    async send(request: EmailSendRequest): Promise<EmailSendResult> {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${options.apiKey}`,
        "Content-Type": "application/json",
      };
      // Resend honours this for 24 hours, so a retried slice cannot double-send.
      if (request.idempotencyKey) headers["Idempotency-Key"] = request.idempotencyKey;

      const replyTo = request.replyTo ?? options.replyTo;

      let response: Response;
      try {
        response = await fetch(ENDPOINT, {
          method: "POST",
          headers,
          body: JSON.stringify({
            from: request.from ?? options.from,
            to: [request.to],
            subject: request.subject,
            text: request.text,
            html: toHtml(request.text),
            ...(replyTo ? { reply_to: replyTo } : {}),
          }),
        });
      } catch (error) {
        // A network failure is always worth retrying — nothing was decided.
        return {
          ok: false,
          detail: `Could not reach Resend: ${error instanceof Error ? error.message : "unknown error"}.`,
          retryable: true,
        };
      }

      const payload = (await response.json().catch(() => null)) as
        | { id?: string; message?: string; name?: string }
        | null;

      if (!response.ok) {
        return {
          ok: false,
          detail: payload?.message ?? `Resend rejected the send (${response.status}).`,
          // 4xx means the request itself is wrong; 429 and 5xx are transient.
          retryable: response.status === 429 || response.status >= 500,
        };
      }

      return {
        ok: true,
        providerId: payload?.id,
        detail: `Accepted by Resend${payload?.id ? ` as ${payload.id}` : ""}.`,
      };
    },
  };
}

/**
 * Builds the transport from the environment, or reports why it cannot.
 *
 * The key is never read anywhere else, so this is the single place that has to
 * be right — and the only place that would have to change for a different
 * provider.
 */
export function transportFromEnv():
  | { ok: true; transport: EmailTransport; from: string }
  | { ok: false; reason: string } {
  const apiKey = readEnv("RESEND_API_KEY");
  if (!apiKey) {
    return { ok: false, reason: "RESEND_API_KEY is not set." };
  }

  /*
   * Caught early, because the provider's own answer to a quoted key is
   * "API key is invalid" — which sends you looking at the key in Resend
   * rather than at the quotation marks around it in the host's UI.
   */
  if (!apiKey.startsWith("re_")) {
    return {
      ok: false,
      reason:
        "RESEND_API_KEY does not look like a Resend key — they begin with \"re_\". Check for quotation marks or stray characters around the value, and that the whole key was pasted.",
    };
  }

  const from = readEnv("EMAIL_FROM");
  if (!from) {
    return {
      ok: false,
      reason:
        "EMAIL_FROM is not set. It must be an address on a domain verified in Resend, for example \"Annie Daniel <hello@makeupbyanniedaniel.co.uk>\".",
    };
  }

  return {
    ok: true,
    from,
    transport: createResendTransport({
      apiKey,
      from,
      replyTo: readEnv("EMAIL_REPLY_TO") || undefined,
    }),
  };
}

/**
 * Reads a variable, tolerating how hosting dashboards mangle pasted values.
 *
 * Railway and friends store exactly what was typed, so a value pasted with
 * the surrounding quotes from an example — or with a trailing newline picked
 * up by the copy — is kept verbatim and then rejected by the provider for
 * reasons that point nowhere near the real cause. `passwordMatches()` already
 * does the same for `APP_PASSWORD`, for the same reason.
 */
function readEnv(name: string): string {
  const raw = process.env[name]?.trim();
  if (!raw) return "";
  return raw.replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
}

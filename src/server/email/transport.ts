/**
 * The narrow seam an email provider slots into.
 *
 * Deliberately not the older `ChannelProvider` port, which has no recipient
 * address on it at all — it was shaped for a world where every send was
 * simulated and the address never mattered. Rather than widen that type and
 * leave a required field optional forever, real delivery gets its own port.
 */

export interface EmailSendRequest {
  to: string;
  subject: string;
  /** The plain-text alternative part. Always sent alongside the HTML. */
  text: string;
  /** The designed body. Derived from the text when absent. */
  html?: string;
  /** Overrides the configured sender. Rarely needed. */
  from?: string;
  replyTo?: string;
  /**
   * Collapses duplicate sends at the provider when the same key is submitted
   * twice — the cheap half of an outbox, until the real one exists.
   */
  idempotencyKey?: string;
}

export interface EmailSendResult {
  ok: boolean;
  /** The provider's id, kept on the message record for support queries. */
  providerId?: string;
  detail: string;
  /**
   * Whether submitting the same request again could succeed. A rejected
   * address never will; a rate limit or a 500 will.
   */
  retryable?: boolean;
}

export interface EmailTransport {
  readonly name: string;
  send(request: EmailSendRequest): Promise<EmailSendResult>;
}

/** Used when no provider is configured, so the rest of the path still runs. */
export const nullTransport: EmailTransport = {
  name: "none",
  async send() {
    return {
      ok: false,
      detail: "No email provider is configured (RESEND_API_KEY is not set).",
      retryable: false,
    };
  },
};

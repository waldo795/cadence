import { NextResponse } from "next/server";
import { blocksToText, type EmailBlock } from "@/domain/email-content";
import { renderEmailHtml } from "@/domain/email-render";
import { themeOrDefault, type EmailTheme } from "@/domain/email-theme";
import { DEFAULT_CONTROLS, type SendingControls, type TestRecipient } from "@/domain/sending";
import { transportFromEnv } from "@/server/email/resend";
import { readDocument } from "@/server/store";
import { DOCUMENT_KEYS } from "@/shared/keys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sends one diagnostic email to a test profile.
 *
 * Exists because the alternative way to find out whether the provider is
 * configured correctly is to wait for a countdown to fire and then work out
 * from silence what went wrong. Nothing about a journey is involved.
 *
 * Behind the password gate — it is not in the proxy's public paths, so an
 * unauthenticated request never reaches this handler.
 */
export async function POST(request: Request) {
  let body: { recipientId?: string };
  try {
    body = (await request.json()) as { recipientId?: string };
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  if (!body.recipientId) {
    return NextResponse.json({ error: "recipientId is required." }, { status: 400 });
  }

  /*
   * The kill switch applies here too.
   *
   * "Stop all emails" has to mean all of them, or the switch is a promise with
   * an exception in it — and the exception would be the one place someone
   * reaches for while trying to work out what is wrong.
   */
  const controls =
    (await readDocument<SendingControls>(DOCUMENT_KEYS.sendingControls)) ?? DEFAULT_CONTROLS;
  if (controls.killSwitch) {
    return NextResponse.json(
      {
        error:
          "Sending is disabled within org — killswitch enabled. Turn it off in Settings to send a test.",
      },
      { status: 409 },
    );
  }

  const recipients = (await readDocument<TestRecipient[]>(DOCUMENT_KEYS.testRecipients)) ?? [];
  const recipient = recipients.find((item) => item.id === body.recipientId);
  if (!recipient) {
    return NextResponse.json({ error: "No such test profile." }, { status: 404 });
  }

  const configured = transportFromEnv();
  if (!configured.ok) {
    return NextResponse.json({ error: configured.reason }, { status: 503 });
  }

  const now = new Date();
  const theme = themeOrDefault(
    await readDocument<Partial<EmailTheme>>(DOCUMENT_KEYS.emailTheme),
  );

  /*
   * Rendered through the real theme and renderer, not as a plain note. A
   * diagnostic that does not look like the actual email only proves the key
   * works — this also shows the branding, the footer and the spacing you
   * will be shipping.
   */
  const blocks: EmailBlock[] = [
    { id: "b1", kind: "heading", level: 1, text: "Your emails are working" },
    {
      id: "b2",
      kind: "text",
      text: `Hello ${recipient.name},\n\nThis is a test from Cadence. It arrived, so the email provider is configured correctly and any journey set to test mode will reach this address.`,
    },
    { id: "b3", kind: "divider" },
    {
      id: "b4",
      kind: "text",
      text: `Sent from ${configured.from} at ${now.toLocaleString("en-GB")}.\n\nThis is how your branding and footer will look. Adjust them in Settings.`,
    },
  ];

  const result = await configured.transport.send({
    to: recipient.email,
    subject: "Cadence — test email",
    text: blocksToText(blocks),
    html: renderEmailHtml({
      blocks,
      theme,
      preheader: "A test from Cadence to confirm your email provider is set up.",
      // No unsubscribe link: this is a diagnostic to a test profile, not
      // marketing to a client, and the footer would be inviting the operator
      // to opt themselves out of their own test sends.
    }),
    // Deliberately unique: a diagnostic you cannot repeat is not a diagnostic.
    idempotencyKey: `test_${recipient.id}_${now.getTime()}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.detail, retryable: result.retryable }, { status: 502 });
  }

  return NextResponse.json({ ok: true, to: recipient.email, detail: result.detail });
}

import { NextResponse } from "next/server";
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
  const result = await configured.transport.send({
    to: recipient.email,
    subject: "Cadence — test email",
    text: [
      `Hello ${recipient.name},`,
      "This is a test email from Cadence. If it arrived, the email provider is configured correctly and journeys set to test mode will reach this address.",
      `Sent from: ${configured.from}`,
      `Sent at: ${now.toLocaleString("en-GB")}`,
    ].join("\n\n"),
    // Deliberately unique: a diagnostic you cannot repeat is not a diagnostic.
    idempotencyKey: `test_${recipient.id}_${now.getTime()}`,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.detail, retryable: result.retryable }, { status: 502 });
  }

  return NextResponse.json({ ok: true, to: recipient.email, detail: result.detail });
}

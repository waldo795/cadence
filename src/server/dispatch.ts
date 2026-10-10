import { renderEmailHtml } from "@/domain/email-render";
import { resolveTheme, themeOrDefault, type EmailTheme } from "@/domain/email-theme";
import { eventContext } from "@/domain/event";
import type { EvaluationContext } from "@/domain/expression";
import { profileContext } from "@/domain/profile";
import { unsubscribeUrl } from "@/lib/unsubscribe";
import {
  DEFAULT_CONTROLS,
  resolveSendTarget,
  settingFor,
  testSubjectPrefix,
  type JourneySendSetting,
  type SendingControls,
  type TestRecipient,
} from "@/domain/sending";
import type { JourneyInstance } from "@/domain/instance";
import type { MessageRecord, MessageStatus } from "@/domain/message";
import type { Profile } from "@/domain/profile";
import type { RenderedMessage } from "@/simulation/types";
import { DOCUMENT_KEYS } from "@/shared/keys";
import { transportFromEnv } from "./email/resend";
import type { EmailTransport } from "./email/transport";
import { nullTransport } from "./email/transport";
import { readDocument } from "./store";

/**
 * Hands what the engine decided to send to a provider — or doesn't.
 *
 * Kept apart from the engine on purpose. The engine answers "should this
 * person get this message?", which is a question about consent, caps and
 * journey logic and has one right answer whether you are simulating or
 * running live. This file answers "and does it actually leave the building?",
 * which depends on operational state the engine has no business knowing.
 */

export interface SendingContext {
  controls: SendingControls;
  settings: JourneySendSetting[];
  testRecipients: TestRecipient[];
  theme: EmailTheme;
  transport: EmailTransport;
  /** Why sending is unavailable, when it is. */
  transportProblem?: string;
}

export async function loadSendingContext(): Promise<SendingContext> {
  const [controls, settings, testRecipients, theme] = await Promise.all([
    readDocument<SendingControls>(DOCUMENT_KEYS.sendingControls),
    readDocument<JourneySendSetting[]>(DOCUMENT_KEYS.sendSettings),
    readDocument<TestRecipient[]>(DOCUMENT_KEYS.testRecipients),
    readDocument<Partial<EmailTheme>>(DOCUMENT_KEYS.emailTheme),
  ]);

  const configured = transportFromEnv();

  return {
    controls: controls ?? DEFAULT_CONTROLS,
    settings: settings ?? [],
    testRecipients: testRecipients ?? [],
    theme: themeOrDefault(theme),
    transport: configured.ok ? configured.transport : nullTransport,
    transportProblem: configured.ok ? undefined : configured.reason,
  };
}

/* -------------------------------------------------------------------------- */
/* Dispatch                                                                   */
/* -------------------------------------------------------------------------- */

export interface DispatchOptions {
  /** False for a dry run: decide and report, hand nothing to the provider. */
  deliver?: boolean;
}

/**
 * Resolves and sends one slice's messages, returning the records to persist.
 *
 * Sends run in sequence rather than in parallel. One journey step produces a
 * handful of messages at most, and a serial loop keeps the provider's rate
 * limit out of the picture entirely.
 */
export async function dispatch(
  messages: RenderedMessage[],
  instance: JourneyInstance,
  profile: Profile,
  context: SendingContext,
  now: Date,
  options: DispatchOptions = {},
): Promise<MessageRecord[]> {
  const deliver = options.deliver !== false;
  const setting = settingFor(context.settings, instance.journeyKey);
  const records: MessageRecord[] = [];

  for (const [index, message] of messages.entries()) {
    const id = `msg_${instance.id}_${instance.stepCount}_${index}`;

    /*
     * Only email has a provider. Push and SMS still record what they would
     * have sent, which is honest rather than pretending they went out — and
     * notably the seeded "SMS" messages are email nodes, so they are not
     * caught by this.
     */
    if (message.channel !== "email") {
      records.push(
        base(id, message, instance, now, {
          status: "simulated",
          sendDetail: `No ${message.channel} provider is connected, so nothing was sent.`,
        }),
      );
      continue;
    }

    const testRecipient = setting?.testRecipientId
      ? context.testRecipients.find((item) => item.id === setting.testRecipientId) ?? null
      : null;

    const target = resolveSendTarget({
      controls: context.controls,
      setting,
      recipientEmail: profile.email,
      testRecipient,
    });

    /*
     * A live send with an unresolved merge field is stopped.
     *
     * `interpolate` deliberately leaves an unknown placeholder visible rather
     * than blanking it, which is right for a preview and unacceptable in a
     * bride's inbox — "Hi {{profile.firstName}}" a week before her wedding is
     * not a message worth getting out on time. Test mode is let through on
     * purpose: seeing the broken field is the entire point of a test send.
     */
    if (target.outcome === "deliver" && message.unresolved.length > 0) {
      records.push(
        base(id, message, instance, now, {
          status: "blocked",
          sendDetail: `Not sent: ${message.unresolved
            .map((field) => `{{${field}}}`)
            .join(", ")} could not be filled in for this client, and would have appeared in the email as written.`,
        }),
      );
      continue;
    }

    if (target.outcome === "suppress") {
      records.push(
        base(id, message, instance, now, { status: "blocked", sendDetail: target.reason }),
      );
      continue;
    }

    if (!deliver) {
      records.push(
        base(id, message, instance, now, {
          status: "simulated",
          sentTo: target.to,
          sendDetail: `Dry run — would have been ${target.reason.toLowerCase()}`,
        }),
      );
      continue;
    }

    if (context.transportProblem) {
      records.push(
        base(id, message, instance, now, {
          status: "failed",
          sentTo: target.to,
          sendDetail: context.transportProblem,
        }),
      );
      continue;
    }

    const subject =
      target.outcome === "redirect" && target.intendedFor
        ? testSubjectPrefix(target.intendedFor) + message.subjectRendered
        : message.subjectRendered;

    /*
     * The unsubscribe link is per client and per message, and it points at
     * the real recipient even in test mode — clicking it in a redirected
     * test should opt out the person the message was for, which is the only
     * way to test that the link works at all.
     */
    const unsubscribe = await unsubscribeUrl(instance.profileId);

    /*
     * The design is resolved per client, not per send batch. A variant keyed
     * on a profile attribute, or a hero image held on the client record, has
     * to be decided here — the theme loaded once for the whole run is only
     * the starting point.
     */
    const themeContext: EvaluationContext = {
      profile: profileContext(profile, now),
      event: eventContext(instance.context),
      journey: { name: instance.journeyName, key: instance.journeyKey },
    };
    const resolvedTheme = resolveTheme(context.theme, themeContext);

    const html = message.blocks
      ? renderEmailHtml({
          blocks: message.blocks,
          theme: resolvedTheme,
          preheader: message.preheader,
          unsubscribeUrl: unsubscribe,
          testBanner:
            target.outcome === "redirect"
              ? `Test send. This would have gone to ${target.intendedFor}.`
              : undefined,
        })
      : undefined;

    const result = await context.transport.send({
      to: target.to,
      subject,
      text: message.bodyRendered,
      html,
      /*
       * Derived from the instance and step, so the same slice retried after a
       * crash is collapsed by the provider instead of arriving twice.
       */
      idempotencyKey: id,
    });

    records.push(
      base(id, message, instance, now, {
        status: result.ok ? (target.outcome === "redirect" ? "test" : "sent") : "failed",
        sentTo: target.to,
        providerId: result.providerId,
        subject,
        sendDetail: result.ok ? `${target.reason} ${result.detail}` : result.detail,
      }),
    );
  }

  return records;
}

function base(
  id: string,
  message: RenderedMessage,
  instance: JourneyInstance,
  now: Date,
  extra: {
    status: MessageStatus;
    sentTo?: string;
    providerId?: string;
    subject?: string;
    sendDetail: string;
  },
): MessageRecord {
  return {
    id,
    profileId: instance.profileId,
    channel: message.channel,
    template: message.template,
    messageKey: message.template,
    subject: extra.subject ?? message.subjectRendered,
    body: message.bodyRendered,
    status: extra.status,
    sentAt: now.toISOString(),
    journeyId: instance.journeyId,
    journeyKey: instance.journeyKey,
    journeyName: instance.journeyName,
    sentTo: extra.sentTo,
    providerId: extra.providerId,
    sendDetail: extra.sendDetail,
  };
}

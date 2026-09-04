import { describeCap } from "@/domain/governance";
import type { Channel, ConsentChannel } from "@/domain/journey";
import type { PolicyDecision, PolicyEvaluator, PolicyRequest } from "./ports";

const CHANNEL_LABEL: Record<ConsentChannel, string> = {
  email: "Email",
  push: "Push",
  sms: "SMS",
  any: "Marketing",
};

const ALL_CHANNELS: Channel[] = ["email", "push", "sms"];

/**
 * A deliberately explicit rule set — order matters, and each branch returns a
 * reason string the simulation timeline can show verbatim. A real consent or
 * preference service would implement this same interface.
 */
export class MockPolicyEvaluator implements PolicyEvaluator {
  evaluate(request: PolicyRequest): PolicyDecision {
    const { profile, channel, purpose } = request;
    const label = CHANNEL_LABEL[channel];

    // Checked first, and deliberately above suppression: a control-group profile
    // must never be contacted for any reason, on any entrance to the journey.
    if (request.heldOut) {
      return {
        allowed: false,
        code: "CONTROL_HOLDBACK",
        reason: `${profile.firstName} is in the experiment control group — the send is withheld and recorded for measurement.`,
      };
    }

    if (profile.contactability.globallySuppressed) {
      return {
        allowed: false,
        code: "GLOBALLY_SUPPRESSED",
        reason: `${profile.firstName} is globally suppressed — no channel may be used.`,
      };
    }

    if (channel === "any") {
      // Reachable on at least one channel is enough for a general marketing
      // gate; the per-channel rules are enforced again at each send action.
      const reachable = ALL_CHANNELS.filter(
        (candidate) => profile.contactability[candidate] === "subscribed",
      );
      if (reachable.length === 0) {
        return {
          allowed: false,
          code: "NO_CONSENT",
          reason: `${profile.firstName} has withdrawn consent on every channel.`,
        };
      }
      return {
        allowed: true,
        code: "ALLOWED",
        reason: `Contactable on ${reachable.join(", ")} for ${purpose.toLowerCase()} messages.`,
      };
    }

    const consent = profile.contactability[channel];
    if (consent !== "subscribed") {
      return {
        allowed: false,
        code: "NO_CONSENT",
        reason: `${label} consent is "${consent}" for ${purpose.toLowerCase()} messages.`,
      };
    }

    if (channel === "push" && !profile.contactability.hasPushToken) {
      return {
        allowed: false,
        code: "NO_PUSH_TOKEN",
        reason: "Push consent is granted but no device token is registered.",
      };
    }

    const cap = request.cap;
    if (cap && request.messagesSentInWindow >= cap.maxMessages) {
      return {
        allowed: false,
        code: "FREQUENCY_CAP",
        reason: `Contact cap reached — ${request.messagesSentInWindow}/${describeCap(cap.maxMessages, cap.windowDays)} via ${cap.sourceName}.`,
      };
    }

    return {
      allowed: true,
      code: "ALLOWED",
      reason: cap
        ? `${label} ${purpose.toLowerCase()} consent granted (${request.messagesSentInWindow}/${describeCap(cap.maxMessages, cap.windowDays)} via ${cap.sourceName}).`
        : `${label} ${purpose.toLowerCase()} consent granted.`,
    };
  }
}

export const policyEvaluator = new MockPolicyEvaluator();

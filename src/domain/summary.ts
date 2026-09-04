import { describeCondition } from "./expression";
import { describeDuration } from "./time";
import type { JourneyNode } from "./journey";

export interface NodeSummary {
  /** Quiet label above the value, e.g. "Wait for". */
  caption: string;
  /** The value itself, rendered as a monospace token when `mono` is true. */
  value: string;
  mono: boolean;
  /** Optional second line, e.g. the channel on a consent check. */
  note?: string;
}

/**
 * What a node shows on the canvas.
 *
 * Lives in the domain layer because the requirement is that a journey is
 * readable *without* opening the properties panel — that is a property of the
 * model, not of the renderer.
 */
export function summariseNode(node: JourneyNode): NodeSummary {
  switch (node.kind) {
    case "event_trigger":
      return { caption: "Event", value: node.config.eventName, mono: true };
    case "audience_entry":
      return { caption: "Audience", value: node.config.audienceName, mono: false };
    case "condition":
      return {
        caption: "If",
        value: describeCondition(node.config.field, node.config.operator, node.config.value),
        mono: true,
      };
    case "branch":
      return {
        caption: "Branches",
        value: node.config.options.map((option) => option.label).join(" · ") || "None",
        mono: false,
        note: "Falls through to Default",
      };
    case "wait":
      return {
        caption: "Wait for",
        value: describeDuration(node.config.duration, node.config.unit),
        mono: true,
      };
    case "wait_until":
      return { caption: "Wait until", value: node.config.expression, mono: true };
    case "percentage_split":
      return {
        caption: "Split",
        value: node.config.options.map((option) => `${option.percentage}%`).join(" / "),
        mono: true,
      };
    case "send_email":
      return {
        caption: "Email",
        value: node.config.template,
        mono: true,
        note: node.config.subject,
      };
    case "send_push":
      return {
        caption: "Push",
        value: node.config.template,
        mono: true,
        note: node.config.title,
      };
    case "webhook":
      return { caption: node.config.method, value: node.config.url, mono: true };
    case "update_profile":
      return {
        caption: "Set",
        value: `${node.config.attribute} = ${node.config.value}`,
        mono: true,
      };
    case "frequency_check":
      return node.config.mode === "governed"
        ? {
            caption: "Cap",
            value: "Workspace policy",
            mono: false,
            note: `Resolved per profile · ${node.config.channel}`,
          }
        : {
            caption: "Local cap",
            value: `${node.config.maxMessages} per ${node.config.windowDays} days`,
            mono: false,
            note: `Clamped by workspace policy · ${node.config.channel}`,
          };
    case "exclusion_check":
      return {
        caption: node.config.scope === "message" ? "Excluded if sent" : "Excluded if contacted by",
        value:
          node.config.scope === "message"
            ? node.config.messageKey || "—"
            : node.config.journeyKey || "—",
        mono: true,
        note: `Within ${node.config.withinDays} days · ${node.config.channel}`,
      };
    case "consent_check":
      return {
        caption: node.config.purpose ? `${node.config.purpose} consent` : "Consent",
        value: node.config.channel === "any" ? "Any channel" : node.config.channel,
        mono: false,
        note:
          node.config.channel === "any"
            ? "Contactable on any channel"
            : `Channel: ${node.config.channel}`,
      };
    case "exit":
      return { caption: "Reason", value: node.config.reason || "Journey complete", mono: false };
  }
}

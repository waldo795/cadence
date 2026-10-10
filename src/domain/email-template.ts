import { blocksToText, type EmailBlock } from "./email-content";

/**
 * A saved email, independent of any journey.
 *
 * Journeys own *when* a message is sent and to whom; a template owns what it
 * looks like and roughly what it says. Keeping them apart means the night
 * before and the week before can share a layout without one journey reaching
 * into another, and a new journey can start from something that already works
 * rather than from an empty canvas.
 */
export interface EmailTemplate {
  id: string;
  name: string;
  description: string;
  subject: string;
  preheader: string;
  blocks: EmailBlock[];
  createdAt: string;
  updatedAt: string;
  /**
   * The journey a template was saved from, when it was saved from one.
   *
   * Only ever a label — a template is never bound to a journey, because the
   * whole point is reuse. It is here so "where did this come from?" has an
   * answer six months later.
   */
  originJourney?: string;
}

export function createTemplate(partial: Partial<EmailTemplate> = {}): EmailTemplate {
  const now = new Date().toISOString();
  return {
    id: `tpl_${Math.random().toString(36).slice(2, 10)}`,
    name: "Untitled template",
    description: "",
    subject: "",
    preheader: "",
    blocks: [{ id: `blk_${Math.random().toString(36).slice(2, 9)}`, kind: "text", text: "" }],
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/** A one-line sense of what is in a template, for the list. */
export function summarise(template: EmailTemplate): string {
  const text = blocksToText(template.blocks).replace(/\s+/g, " ").trim();
  if (!text) return "Empty";
  return text.length > 120 ? `${text.slice(0, 120)}…` : text;
}

export function blockCounts(template: EmailTemplate): string {
  const counts = new Map<string, number>();
  const walk = (blocks: EmailBlock[]) => {
    for (const block of blocks) {
      counts.set(block.kind, (counts.get(block.kind) ?? 0) + 1);
      if (block.kind === "columns") block.columns.forEach(walk);
    }
  };
  walk(template.blocks);
  return [...counts.entries()].map(([kind, count]) => `${count} ${kind}`).join(" · ");
}

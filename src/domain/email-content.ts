/**
 * What an email is made of.
 *
 * A body is a list of blocks rather than a string of HTML. That matters for
 * three reasons: merge fields stay visible to the simulator, so it can still
 * tell you which ones will not resolve for a given client; the same content
 * renders to both HTML and plain text without parsing anything back out; and
 * the operator is choosing from six things rather than editing markup.
 *
 * Blocks are optional. A send node that has never been opened in the editor
 * still has only its original `body` text, and `blocksFor()` derives blocks
 * from it on the fly — so nothing needed migrating and nothing can break by
 * being left alone.
 */

export type EmailBlockKind = "heading" | "text" | "image" | "button" | "divider" | "spacer";

export interface EmailBlockBase {
  id: string;
  kind: EmailBlockKind;
}

export interface HeadingBlock extends EmailBlockBase {
  kind: "heading";
  text: string;
  /** 1 is the main title, 2 a section heading. Deliberately only two. */
  level: 1 | 2;
}

export interface TextBlock extends EmailBlockBase {
  kind: "text";
  text: string;
}

export interface ImageBlock extends EmailBlockBase {
  kind: "image";
  url: string;
  /** Required in the editor: a decorative-only email image is rare. */
  alt: string;
  /** Linking the image is the common case for a portfolio shot. */
  href?: string;
}

export interface ButtonBlock extends EmailBlockBase {
  kind: "button";
  label: string;
  href: string;
}

export interface DividerBlock extends EmailBlockBase {
  kind: "divider";
}

export interface SpacerBlock extends EmailBlockBase {
  kind: "spacer";
  size: "small" | "medium" | "large";
}

export type EmailBlock =
  | HeadingBlock
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock;

export const BLOCK_LABEL: Record<EmailBlockKind, string> = {
  heading: "Heading",
  text: "Paragraph",
  image: "Image",
  button: "Button",
  divider: "Divider",
  spacer: "Space",
};

export const SPACER_HEIGHT: Record<SpacerBlock["size"], number> = {
  small: 12,
  medium: 24,
  large: 40,
};

/* -------------------------------------------------------------------------- */
/* Construction                                                               */
/* -------------------------------------------------------------------------- */

let counter = 0;

export function blockId(): string {
  counter += 1;
  return `blk_${Date.now().toString(36)}_${counter}`;
}

export function createBlock(kind: EmailBlockKind): EmailBlock {
  switch (kind) {
    case "heading":
      return { id: blockId(), kind, text: "A heading", level: 2 };
    case "text":
      return { id: blockId(), kind, text: "" };
    case "image":
      return { id: blockId(), kind, url: "", alt: "" };
    case "button":
      return { id: blockId(), kind, label: "Book now", href: "" };
    case "divider":
      return { id: blockId(), kind };
    case "spacer":
      return { id: blockId(), kind, size: "medium" };
  }
}

/* -------------------------------------------------------------------------- */
/* Conversion                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Turns plain text into blocks, splitting on blank lines.
 *
 * This is how every existing journey gets a block body without a migration:
 * the text was already written as paragraphs separated by blank lines, which
 * is exactly the structure being recovered.
 */
export function textToBlocks(body: string): EmailBlock[] {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (paragraphs.length === 0) return [{ id: blockId(), kind: "text", text: "" }];

  return paragraphs.map((text) => ({ id: blockId(), kind: "text", text }) as TextBlock);
}

/**
 * The blocks for a send node, whether or not it has been opened in the editor.
 *
 * Callers should always go through this rather than reading `blocks` directly,
 * so a node authored before the editor existed behaves identically to one
 * authored after it.
 */
export function blocksFor(config: { body: string; blocks?: EmailBlock[] }): EmailBlock[] {
  if (config.blocks && config.blocks.length > 0) return config.blocks;
  return textToBlocks(config.body);
}

/**
 * The plain-text alternative part.
 *
 * Not a nicety: a message with no text part looks like bulk mail to spam
 * filters, and it is the only version some clients and screen readers show.
 */
export function blocksToText(blocks: EmailBlock[]): string {
  const parts: string[] = [];

  for (const block of blocks) {
    switch (block.kind) {
      case "heading":
        parts.push(block.text);
        break;
      case "text":
        if (block.text.trim()) parts.push(block.text);
        break;
      case "button":
        // The label alone is useless without somewhere to go.
        parts.push(block.href ? `${block.label}: ${block.href}` : block.label);
        break;
      case "image":
        if (block.alt.trim()) parts.push(`[${block.alt}]`);
        break;
      case "divider":
        parts.push("—");
        break;
      case "spacer":
        break;
    }
  }

  return parts.join("\n\n");
}

/** Every piece of text in a body, for merge-field resolution. */
export function blockTemplateStrings(blocks: EmailBlock[]): string[] {
  const strings: string[] = [];
  for (const block of blocks) {
    if (block.kind === "heading" || block.kind === "text") strings.push(block.text);
    if (block.kind === "button") strings.push(block.label, block.href);
    if (block.kind === "image") strings.push(block.url, block.alt, block.href ?? "");
  }
  return strings.filter(Boolean);
}

/** Applies a transform to every authored string, leaving structure alone. */
export function mapBlockText(
  blocks: EmailBlock[],
  transform: (value: string) => string,
): EmailBlock[] {
  return blocks.map((block) => {
    switch (block.kind) {
      case "heading":
      case "text":
        return { ...block, text: transform(block.text) };
      case "button":
        return { ...block, label: transform(block.label), href: transform(block.href) };
      case "image":
        return {
          ...block,
          url: transform(block.url),
          alt: transform(block.alt),
          ...(block.href ? { href: transform(block.href) } : {}),
        };
      default:
        return block;
    }
  });
}

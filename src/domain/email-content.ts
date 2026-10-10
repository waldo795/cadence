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

export type EmailBlockKind =
  | "heading"
  | "text"
  | "image"
  | "button"
  | "divider"
  | "spacer"
  | "columns";

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

/**
 * A row split into columns, each holding its own blocks.
 *
 * One level deep, deliberately. Columns inside columns is where email layout
 * stops being predictable across clients, and it is not a layout anyone needs
 * for a message to a bride.
 */
export interface ColumnsBlock extends EmailBlockBase {
  kind: "columns";
  /**
   * Relative widths — `[1, 1]` for an even split, `[2, 1]` for a wide column
   * beside a narrow one. Length decides the number of columns.
   */
  widths: number[];
  /** One array of blocks per column. Always the same length as `widths`. */
  columns: EmailBlock[][];
}

export type EmailBlock =
  | HeadingBlock
  | TextBlock
  | ImageBlock
  | ButtonBlock
  | DividerBlock
  | SpacerBlock
  | ColumnsBlock;

export const BLOCK_LABEL: Record<EmailBlockKind, string> = {
  heading: "Heading",
  text: "Paragraph",
  image: "Image",
  button: "Button",
  divider: "Divider",
  spacer: "Space",
  columns: "Columns",
};

/** The layouts offered in the palette. */
export const COLUMN_PRESETS: { id: string; label: string; widths: number[] }[] = [
  { id: "1-1", label: "Two equal", widths: [1, 1] },
  { id: "2-1", label: "Wide + narrow", widths: [2, 1] },
  { id: "1-2", label: "Narrow + wide", widths: [1, 2] },
  { id: "1-1-1", label: "Three equal", widths: [1, 1, 1] },
];

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

export function createBlock(kind: EmailBlockKind, widths: number[] = [1, 1]): EmailBlock {
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
    case "columns":
      return { id: blockId(), kind, widths, columns: widths.map(() => []) };
  }
}

/* -------------------------------------------------------------------------- */
/* Tree operations                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Where a block sits, or is being dropped.
 *
 * `containerId` is the columns block it belongs to, or null for the top
 * level. Addressing by id rather than by an index path means a drop target
 * stays valid while the list around it is being rearranged.
 */
export interface BlockLocation {
  containerId: string | null;
  columnIndex: number;
  index: number;
}

/** Every block in order, each with where it lives. Columns are included. */
export function flattenBlocks(
  blocks: EmailBlock[],
  containerId: string | null = null,
  columnIndex = 0,
): { block: EmailBlock; location: BlockLocation }[] {
  const found: { block: EmailBlock; location: BlockLocation }[] = [];
  blocks.forEach((block, index) => {
    found.push({ block, location: { containerId, columnIndex, index } });
    if (block.kind === "columns") {
      block.columns.forEach((column, childColumn) => {
        found.push(...flattenBlocks(column, block.id, childColumn));
      });
    }
  });
  return found;
}

export function findBlock(blocks: EmailBlock[], id: string): EmailBlock | null {
  return flattenBlocks(blocks).find((entry) => entry.block.id === id)?.block ?? null;
}

export function locationOf(blocks: EmailBlock[], id: string): BlockLocation | null {
  return flattenBlocks(blocks).find((entry) => entry.block.id === id)?.location ?? null;
}

/** Replaces one block anywhere in the tree, leaving the rest untouched. */
export function updateBlock(
  blocks: EmailBlock[],
  id: string,
  patch: Partial<EmailBlock>,
): EmailBlock[] {
  return blocks.map((block) => {
    if (block.id === id) return { ...block, ...patch } as EmailBlock;
    if (block.kind === "columns") {
      return {
        ...block,
        columns: block.columns.map((column) => updateBlock(column, id, patch)),
      };
    }
    return block;
  });
}

export function removeBlock(blocks: EmailBlock[], id: string): EmailBlock[] {
  return blocks
    .filter((block) => block.id !== id)
    .map((block) =>
      block.kind === "columns"
        ? { ...block, columns: block.columns.map((column) => removeBlock(column, id)) }
        : block,
    );
}

export function insertBlock(
  blocks: EmailBlock[],
  block: EmailBlock,
  at: BlockLocation,
): EmailBlock[] {
  if (at.containerId === null) {
    const next = [...blocks];
    next.splice(clamp(at.index, next.length), 0, block);
    return next;
  }

  return blocks.map((candidate) => {
    if (candidate.id !== at.containerId || candidate.kind !== "columns") {
      return candidate.kind === "columns"
        ? {
            ...candidate,
            columns: candidate.columns.map((column) => insertBlock(column, block, at)),
          }
        : candidate;
    }
    return {
      ...candidate,
      columns: candidate.columns.map((column, columnIndex) => {
        if (columnIndex !== at.columnIndex) return column;
        const next = [...column];
        next.splice(clamp(at.index, next.length), 0, block);
        return next;
      }),
    };
  });
}

/**
 * Moves a block to a new place in one step.
 *
 * Removing then inserting as two calls would be wrong: taking the block out
 * shifts every later index in its own list, so an index captured before the
 * removal lands one position too far down.
 */
export function moveBlock(
  blocks: EmailBlock[],
  id: string,
  to: BlockLocation,
): EmailBlock[] {
  const moving = findBlock(blocks, id);
  if (!moving) return blocks;

  // A columns block cannot be dropped inside itself, which would detach the
  // whole subtree from the document.
  if (moving.kind === "columns" && to.containerId === id) return blocks;

  const from = locationOf(blocks, id);
  const without = removeBlock(blocks, id);

  const sameList =
    from !== null &&
    from.containerId === to.containerId &&
    from.columnIndex === to.columnIndex;

  const index = sameList && from.index < to.index ? to.index - 1 : to.index;
  return insertBlock(without, moving, { ...to, index });
}

function clamp(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
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
      case "columns":
        /*
         * Columns flatten top-to-bottom, left-to-right. Plain text has no
         * side-by-side, and reading one column then the next is how a screen
         * reader presents them anyway.
         */
        for (const column of block.columns) {
          const text = blocksToText(column);
          if (text) parts.push(text);
        }
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
    // Without this, a merge field inside a column is never checked, and the
    // first anyone hears of it is the braces arriving in someone's inbox.
    if (block.kind === "columns") {
      for (const column of block.columns) strings.push(...blockTemplateStrings(column));
    }
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
      case "columns":
        return {
          ...block,
          columns: block.columns.map((column) => mapBlockText(column, transform)),
        };
      default:
        return block;
    }
  });
}

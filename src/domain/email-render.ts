import { SPACER_HEIGHT, type EmailBlock } from "./email-content";
import type { EmailTheme } from "./email-theme";

/**
 * Blocks and a theme in, email HTML out.
 *
 * Email HTML is not web HTML. Outlook on Windows renders with Word's engine:
 * no flexbox, no grid, no `max-width` on a div you can rely on, and external
 * stylesheets are stripped. So this is tables and inline styles throughout,
 * which looks archaic and is the only thing that works everywhere.
 *
 * Pure, and shared by the live send and the preview — the same rule that
 * keeps the simulator honest about what a journey does keeps it honest about
 * what the result will look like.
 */

const CARD_WIDTH = 600;

export interface RenderOptions {
  blocks: EmailBlock[];
  theme: EmailTheme;
  /**
   * The one-line summary shown next to the subject in most inboxes. Without
   * it, clients scrape the first visible text, which is usually the logo's
   * alt text.
   */
  preheader?: string;
  /**
   * Omitted only for the diagnostic send. Every message to a client needs
   * one, and the footer says so either way.
   */
  unsubscribeUrl?: string;
  /** Shown as a banner above the content when sending in test mode. */
  testBanner?: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Only http(s) and mailto survive.
 *
 * Block hrefs are authored in the editor and can carry merge fields, so a
 * mis-set field must not be able to produce `javascript:` in a link that then
 * gets forwarded on.
 */
function safeHref(raw: string): string {
  const trimmed = raw.trim();
  if (/^(https?:|mailto:)/i.test(trimmed)) return escapeHtml(trimmed);
  return "";
}

function paragraphs(text: string, style: string): string {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p style="${style}">${escapeHtml(block).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

/* -------------------------------------------------------------------------- */
/* Blocks                                                                     */
/* -------------------------------------------------------------------------- */

function renderBlock(block: EmailBlock, theme: EmailTheme): string {
  switch (block.kind) {
    case "heading": {
      const size = block.level === 1 ? 26 : 19;
      const top = block.level === 1 ? 0 : 8;
      return `<h${block.level} style="margin:${top}px 0 12px;font-family:${theme.fontStack};font-size:${size}px;line-height:1.3;font-weight:600;color:${theme.textColor};">${escapeHtml(
        block.text,
      )}</h${block.level}>`;
    }

    case "text":
      if (!block.text.trim()) return "";
      return paragraphs(
        block.text,
        `margin:0 0 16px;font-family:${theme.fontStack};font-size:16px;line-height:1.65;color:${theme.textColor};`,
      );

    case "image": {
      if (!block.url.trim()) return "";
      const img = `<img src="${escapeHtml(block.url.trim())}" alt="${escapeHtml(
        block.alt,
      )}" width="${CARD_WIDTH - 64}" style="display:block;width:100%;max-width:${
        CARD_WIDTH - 64
      }px;height:auto;border:0;border-radius:6px;" />`;
      const href = block.href ? safeHref(block.href) : "";
      const wrapped = href ? `<a href="${href}" target="_blank">${img}</a>` : img;
      return `<div style="margin:0 0 20px;">${wrapped}</div>`;
    }

    case "button": {
      const href = safeHref(block.href);
      // A button with nowhere to go is a dead end in an inbox, so it is
      // dropped rather than rendered as something unclickable.
      if (!href) return "";
      /*
       * Table-wrapped, not a styled <a>. Outlook ignores padding on inline
       * elements, which would collapse this into underlined text.
       */
      return [
        '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 24px;">',
        "<tr><td align=\"center\" bgcolor=\"",
        theme.accentColor,
        '" style="border-radius:6px;">',
        `<a href="${href}" target="_blank" style="display:inline-block;padding:13px 28px;font-family:${theme.fontStack};font-size:15px;font-weight:600;line-height:1;color:#ffffff;text-decoration:none;border-radius:6px;">`,
        escapeHtml(block.label),
        "</a></td></tr></table>",
      ].join("");
    }

    case "divider":
      return `<div style="margin:8px 0 24px;border-top:1px solid #e6e1dc;line-height:1px;font-size:1px;">&nbsp;</div>`;

    case "spacer":
      return `<div style="height:${SPACER_HEIGHT[block.size]}px;line-height:${
        SPACER_HEIGHT[block.size]
      }px;font-size:1px;">&nbsp;</div>`;

    case "columns": {
      const total = block.widths.reduce((sum, width) => sum + width, 0) || 1;
      const cells = block.columns
        .map((column, index) => {
          const percent = ((block.widths[index] ?? 1) / total) * 100;
          const inner = column.map((child) => renderBlock(child, theme)).join("");
          /*
           * The `col` class is what the stacking rule in the head targets.
           * Everything else stays inline, because only this one behaviour
           * cannot be expressed without a media query.
           */
          return `<td class="col" width="${percent.toFixed(
            2,
          )}%" valign="top" style="width:${percent.toFixed(
            2,
          )}%;padding:0 8px;">${inner || "&nbsp;"}</td>`;
        })
        .join("");

      return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 8px;"><tr>${cells}</tr></table>`;
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Document                                                                   */
/* -------------------------------------------------------------------------- */

function renderHeader(theme: EmailTheme): string {
  const inner = theme.logoUrl.trim()
    ? `<img src="${escapeHtml(theme.logoUrl.trim())}" alt="${escapeHtml(
        theme.brandName,
      )}" height="36" style="display:block;height:36px;width:auto;border:0;" />`
    : `<span style="font-family:${theme.fontStack};font-size:17px;font-weight:600;letter-spacing:0.02em;color:${theme.textColor};">${escapeHtml(
        theme.brandName,
      )}</span>`;

  return `<tr><td style="padding:28px 32px 4px;">${inner}</td></tr>`;
}

/**
 * A full-width image above the content.
 *
 * Edge to edge, with no padding and no rounding on the sides, because a hero
 * that stops short of the card's edges reads as a mistake rather than a
 * design.
 */
function renderHero(theme: EmailTheme): string {
  const url = theme.heroImageUrl?.trim();
  if (!url) return "";

  return [
    '<tr><td style="padding:16px 0 0;">',
    `<img src="${escapeHtml(url)}" alt="${escapeHtml(theme.heroImageAlt ?? "")}" width="${CARD_WIDTH}" `,
    `style="display:block;width:100%;max-width:${CARD_WIDTH}px;height:auto;border:0;" />`,
    "</td></tr>",
  ].join("");
}

function renderFooter(theme: EmailTheme, unsubscribeUrl?: string): string {
  const style = `margin:0 0 4px;font-family:${theme.fontStack};font-size:12px;line-height:1.6;color:${theme.mutedColor};`;

  const lines = theme.footerLines
    .filter((line) => line.trim())
    .map((line) => `<p style="${style}">${escapeHtml(line)}</p>`)
    .join("");

  const site = theme.websiteUrl.trim()
    ? `<p style="${style}"><a href="${safeHref(theme.websiteUrl)}" style="color:${
        theme.mutedColor
      };text-decoration:underline;">${escapeHtml(
        theme.websiteUrl.replace(/^https?:\/\//, ""),
      )}</a></p>`
    : "";

  /*
   * The unsubscribe link is not optional and not styled to hide. A marketing
   * email without a working one is unlawful in the UK, and burying it costs
   * more in spam complaints than it ever saves in unsubscribes.
   */
  const unsubscribe = unsubscribeUrl
    ? `<p style="${style}margin-top:12px;"><a href="${escapeHtml(
        unsubscribeUrl,
      )}" style="color:${theme.mutedColor};text-decoration:underline;">Unsubscribe from these emails</a></p>`
    : "";

  return [
    '<tr><td style="padding:8px 32px 32px;">',
    `<div style="border-top:1px solid #e6e1dc;padding-top:16px;">`,
    lines,
    site,
    unsubscribe,
    "</div></td></tr>",
  ].join("");
}

export function renderEmailHtml(options: RenderOptions): string {
  const { blocks, theme, preheader, unsubscribeUrl, testBanner } = options;

  const body = blocks.map((block) => renderBlock(block, theme)).join("");

  /*
   * Hidden, but read by the inbox list as the preview line. The trailing
   * entities stop Gmail pulling the first line of body copy in after it.
   */
  const preheaderMarkup = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">${escapeHtml(
        preheader,
      )}${"&#847;&zwnj;&nbsp;".repeat(30)}</div>`
    : "";

  const banner = testBanner
    ? `<tr><td style="padding:0 32px;"><div style="margin:16px 0 0;padding:10px 14px;border-radius:6px;background:#fdf1dc;font-family:${theme.fontStack};font-size:13px;line-height:1.5;color:#7a5a16;">${escapeHtml(
        testBanner,
      )}</div></td></tr>`
    : "";

  return [
    '<!doctype html><html lang="en"><head><meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width,initial-scale=1" />',
    '<meta name="x-apple-disable-message-reformatting" />',
    // Tells supporting clients the design works in both schemes rather than
    // letting them invert the colours themselves, which they do badly.
    '<meta name="color-scheme" content="light only" />',
    /*
     * The one stylesheet in the document, and only because columns cannot
     * stack on a phone without a media query — there is no inline equivalent.
     *
     * Outlook on Windows ignores it and leaves columns side by side, which is
     * the right outcome on a desktop screen anyway. Everything else here stays
     * inline, since Gmail strips <style> in some forwarding and clipping
     * cases and the layout must survive that.
     */
    "<style>@media only screen and (max-width:480px){",
    ".col{display:block !important;width:100% !important;padding:0 0 12px !important;}",
    "}</style>",
    "</head>",
    `<body style="margin:0;padding:0;background:${theme.pageColor};">`,
    preheaderMarkup,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${theme.pageColor};">`,
    '<tr><td align="center" style="padding:24px 12px;">',
    `<table role="presentation" width="${CARD_WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${CARD_WIDTH}px;background:${theme.cardColor};border-radius:10px;">`,
    renderHeader(theme),
    renderHero(theme),
    banner,
    `<tr><td style="padding:20px 32px 4px;">${body}</td></tr>`,
    renderFooter(theme, unsubscribeUrl),
    "</table></td></tr></table></body></html>",
  ].join("");
}

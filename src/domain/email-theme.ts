/**
 * How every email looks, in one place.
 *
 * A theme rather than per-email styling, because the operator's job is to
 * write what the message says — not to make five countdown emails look like
 * they came from the same business. Changing the accent colour here changes
 * every journey at once, including ones already running.
 */

export interface EmailTheme {
  /** Appears in the header when there is no logo, and in the footer. */
  brandName: string;
  /**
   * Absolute URL. Email clients do not resolve relative paths, and many
   * block images by default, so the brand name is always rendered as the
   * logo's alt text rather than as a fallback nobody sees.
   */
  logoUrl: string;
  accentColor: string;
  textColor: string;
  mutedColor: string;
  /** Behind the card. Mid-grey reads better than white in dark-mode clients. */
  pageColor: string;
  cardColor: string;
  fontStack: string;
  /** Business details under the rule. One line each. */
  footerLines: string[];
  /** Shown as the sender's site in the footer. */
  websiteUrl: string;
}

/**
 * Understated by design.
 *
 * Neutral enough to look deliberate before anyone has supplied brand assets,
 * and specific enough that it does not look like an unstyled default. Every
 * value is editable in Settings.
 */
export const DEFAULT_EMAIL_THEME: EmailTheme = {
  brandName: "Annie Daniel",
  logoUrl: "",
  accentColor: "#8c6f5e",
  textColor: "#2b2724",
  mutedColor: "#857c75",
  pageColor: "#f4f1ee",
  cardColor: "#ffffff",
  /*
   * System fonts only. A webfont in email is unreliable — Outlook and Gmail
   * strip the @font-face and fall back to Times, which looks worse than
   * choosing a good stack in the first place.
   */
  fontStack:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  footerLines: ["Makeup by Annie Daniel", "Bridal and occasion makeup"],
  websiteUrl: "https://makeupbyanniedaniel.co.uk",
};

export function themeOrDefault(stored: Partial<EmailTheme> | null | undefined): EmailTheme {
  // Merged rather than replaced, so a theme saved before a field existed does
  // not render that part of the email as "undefined".
  return { ...DEFAULT_EMAIL_THEME, ...(stored ?? {}) };
}

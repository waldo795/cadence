/**
 * How every email looks, in one place.
 *
 * A theme rather than per-email styling, because the operator's job is to
 * write what the message says — not to make five countdown emails look like
 * they came from the same business. Changing the accent colour here changes
 * every journey at once, including ones already running.
 */

import { evaluateCondition, interpolate, type EvaluationContext } from "./expression";
import type { ConditionOperator } from "./journey";

/**
 * A look that replaces part of the theme for some clients.
 *
 * The first matching variant wins, so order is the priority order — same rule
 * as the contact policy, so there is one answer to "which one applied?"
 * rather than a merge nobody can predict.
 */
export interface DesignVariant {
  id: string;
  label: string;
  field: string;
  operator: ConditionOperator;
  value: string;
  /** Only the parts that differ. Everything else falls through to the theme. */
  overrides: Partial<Omit<EmailTheme, "variants">>;
  enabled: boolean;
}

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
  /**
   * A full-width image above the content. Empty for none.
   *
   * May carry merge fields — `{{profile.heroImage}}` for a URL held on the
   * client record — so a variant is not the only way to vary it.
   */
  heroImageUrl: string;
  heroImageAlt: string;
  /** Checked in order; the first whose condition matches is applied. */
  variants: DesignVariant[];
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
  heroImageUrl: "",
  heroImageAlt: "",
  variants: [],
};

export function themeOrDefault(stored: Partial<EmailTheme> | null | undefined): EmailTheme {
  // Merged rather than replaced, so a theme saved before a field existed does
  // not render that part of the email as "undefined".
  return { ...DEFAULT_EMAIL_THEME, ...(stored ?? {}) };
}

/* -------------------------------------------------------------------------- */
/* Per-client resolution                                                      */
/* -------------------------------------------------------------------------- */

export interface ResolvedTheme extends EmailTheme {
  /** Which variant applied, for the preview to report. */
  appliedVariant: DesignVariant | null;
}

/**
 * The theme as one particular client will see it.
 *
 * Two passes, in this order. First a variant may replace some values; then
 * every string is interpolated, so a merge field works whether it was written
 * on the base theme or inside the variant that replaced it. Doing it the
 * other way round would resolve the base value and then throw it away.
 */
export function resolveTheme(theme: EmailTheme, context: EvaluationContext | null): ResolvedTheme {
  const applied = context
    ? (theme.variants ?? []).find(
        (variant) =>
          variant.enabled &&
          evaluateCondition(context, variant.field, variant.operator, variant.value).passed,
      ) ?? null
    : null;

  const merged: EmailTheme = applied
    ? { ...theme, ...applied.overrides, variants: theme.variants }
    : theme;

  if (!context) return { ...merged, appliedVariant: applied };

  const fill = (value: string) => interpolate(value, context);

  return {
    ...merged,
    brandName: fill(merged.brandName),
    logoUrl: fill(merged.logoUrl),
    heroImageUrl: fill(merged.heroImageUrl),
    heroImageAlt: fill(merged.heroImageAlt),
    websiteUrl: fill(merged.websiteUrl),
    footerLines: merged.footerLines.map(fill),
    /*
     * Colours too. A client record can hold a hex value — a wedding's accent
     * colour, say — and `{{profile.accentColour}}` is a reasonable thing to
     * want in a brand that follows the bride's palette.
     */
    accentColor: fill(merged.accentColor),
    textColor: fill(merged.textColor),
    mutedColor: fill(merged.mutedColor),
    pageColor: fill(merged.pageColor),
    cardColor: fill(merged.cardColor),
    appliedVariant: applied,
  };
}

export function createVariant(): DesignVariant {
  return {
    id: `var_${Math.random().toString(36).slice(2, 9)}`,
    label: "New look",
    field: "profile.loyaltyTier",
    operator: "equals",
    value: "",
    overrides: {},
    enabled: true,
  };
}

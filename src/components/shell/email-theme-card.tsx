"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { EmailBlock } from "@/domain/email-content";
import { renderEmailHtml } from "@/domain/email-render";
import { DEFAULT_EMAIL_THEME, resolveTheme, type EmailTheme } from "@/domain/email-theme";
import type { EvaluationContext } from "@/domain/expression";
import { fullName, profileContext } from "@/domain/profile";
import { readProfiles } from "@/services/storage";
import { getEmailTheme, saveEmailTheme } from "@/services/sending";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DesignVariants } from "./design-variants";
import { cn } from "@/lib/utils";

/**
 * The look of every email, with the result shown next to the controls.
 *
 * The preview is the point. Email rendering is unintuitive enough that
 * picking colours blind and finding out by sending yourself a test is a slow
 * and slightly nerve-wracking loop.
 */

const FONT_PRESETS: { label: string; value: string }[] = [
  {
    label: "System",
    value: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif",
  },
  { label: "Serif", value: "Georgia, 'Times New Roman', Times, serif" },
  { label: "Grotesk", value: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
];

const COLOR_FIELDS: { key: keyof EmailTheme; label: string }[] = [
  { key: "accentColor", label: "Accent" },
  { key: "textColor", label: "Text" },
  { key: "mutedColor", label: "Muted" },
  { key: "cardColor", label: "Card" },
  { key: "pageColor", label: "Background" },
];

const SAMPLE: EmailBlock[] = [
  { id: "s1", kind: "heading", level: 1, text: "One week to go, Ava" },
  {
    id: "s2",
    kind: "text",
    text: "I am so looking forward to your wedding on Saturday. Here is everything you need for the morning.",
  },
  { id: "s3", kind: "heading", level: 2, text: "Timings" },
  {
    id: "s4",
    kind: "text",
    text: "I will arrive at 7:30am and we will start with you at 8:00am. Please have your hair dry and your skin clean.",
  },
  { id: "s5", kind: "button", label: "See the full schedule", href: "https://example.com" },
];

export function EmailThemeCard() {
  const [theme, setTheme] = React.useState(getEmailTheme);
  const [dirty, setDirty] = React.useState(false);

  const set = <K extends keyof EmailTheme>(key: K, value: EmailTheme[K]) => {
    setTheme((current) => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const save = () => {
    saveEmailTheme(theme);
    setDirty(false);
    toast.success("Email design saved", {
      description: "Every journey uses it from the next send onwards.",
    });
  };

  const reset = () => {
    setTheme(DEFAULT_EMAIL_THEME);
    setDirty(true);
  };

  /*
   * Previewed against a real client, so a look keyed on an attribute can be
   * seen working. Without one, variants would be editable but unverifiable
   * until an email went out.
   */
  const profiles = React.useMemo(() => readProfiles(), []);
  const [profileId, setProfileId] = React.useState(() => profiles[0]?.id ?? "");
  const profile = profiles.find((item) => item.id === profileId) ?? profiles[0] ?? null;

  const context = React.useMemo<EvaluationContext | null>(
    () =>
      profile
        ? {
            profile: profileContext(profile, new Date()),
            event: { name: "preview", occurredAt: new Date().toISOString() },
            journey: { name: "Preview" },
          }
        : null,
    [profile],
  );

  const resolved = React.useMemo(() => resolveTheme(theme, context), [context, theme]);

  const html = React.useMemo(
    () =>
      renderEmailHtml({
        blocks: SAMPLE,
        theme: resolved,
        unsubscribeUrl: "#",
      }),
    [resolved],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Email design</CardTitle>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Applied to every email from every journey, including ones already running. Journeys
          decide what an email says; this decides what it looks like.
        </p>
      </CardHeader>

      <CardContent className="space-y-4 pt-0">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="brand-name" className="text-[11px]">
                Business name
              </Label>
              <Input
                id="brand-name"
                value={theme.brandName}
                onChange={(event) => set("brandName", event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="logo-url" className="text-[11px]">
                Logo URL
              </Label>
              <Input
                id="logo-url"
                value={theme.logoUrl}
                placeholder="https://… (leave empty to use the name)"
                onChange={(event) => set("logoUrl", event.target.value)}
              />
              <p className="text-[11px] leading-relaxed text-subtle-foreground">
                Must be a public URL. Most clients block images until the reader allows them, so
                the business name is used as the alt text.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px]">Typeface</Label>
              <div className="flex flex-wrap gap-1">
                {FONT_PRESETS.map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => set("fontStack", preset.value)}
                    className={cn(
                      "rounded-md border px-2.5 py-1 text-[11px] transition-colors",
                      theme.fontStack === preset.value
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-border text-muted-foreground hover:bg-surface-muted",
                    )}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed text-subtle-foreground">
                System fonts only. Outlook and Gmail strip webfonts and fall back to Times,
                which looks worse than choosing a good stack.
              </p>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label className="text-[11px]">Colours</Label>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {COLOR_FIELDS.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <span className="text-[11px] text-muted-foreground">{field.label}</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        aria-label={field.label}
                        value={theme[field.key] as string}
                        onChange={(event) => set(field.key, event.target.value as never)}
                        className="size-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
                      />
                      <Input
                        value={theme[field.key] as string}
                        onChange={(event) => set(field.key, event.target.value as never)}
                        className="font-mono text-[11px]"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="footer-lines" className="text-[11px]">
                Footer details
              </Label>
              <textarea
                id="footer-lines"
                rows={3}
                value={theme.footerLines.join("\n")}
                onChange={(event) =>
                  set(
                    "footerLines",
                    event.target.value.split("\n").map((line) => line.trimStart()),
                  )
                }
                className="scroll-slim w-full resize-y rounded-md border border-border bg-surface px-2.5 py-2 text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
              />
              <p className="text-[11px] leading-relaxed text-subtle-foreground">
                One line each. An unsubscribe link is added automatically — it is legally
                required and cannot be turned off.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="website-url" className="text-[11px]">
                Website
              </Label>
              <Input
                id="website-url"
                value={theme.websiteUrl}
                onChange={(event) => set("websiteUrl", event.target.value)}
              />
            </div>

            <Separator />

            <div className="space-y-1.5">
              <Label htmlFor="hero-url" className="text-[11px]">
                Hero image
              </Label>
              <Input
                id="hero-url"
                value={theme.heroImageUrl}
                placeholder="https://… (leave empty for none)"
                onChange={(event) => set("heroImageUrl", event.target.value)}
              />
              <Input
                value={theme.heroImageAlt}
                placeholder="Describe the image"
                onChange={(event) => set("heroImageAlt", event.target.value)}
              />
              <p className="text-[11px] leading-relaxed text-subtle-foreground">
                Sits full width above the content. Can hold a merge field, so{" "}
                <code>{"{{profile.heroImage}}"}</code> works where the URL is on the client
                record.
              </p>
            </div>

            <Separator />

            <DesignVariants
              variants={theme.variants}
              onChange={(variants) => set("variants", variants)}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[11px]">Preview</Label>
              {resolved.appliedVariant ? (
                <span className="truncate rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-medium text-accent">
                  {resolved.appliedVariant.label}
                </span>
              ) : null}
            </div>

            <Select value={profileId} onValueChange={setProfileId}>
              <SelectTrigger className="h-7 text-[12px]">
                <SelectValue placeholder="Choose a client" />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {fullName(item)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {/*
              An iframe, so the email's own styles cannot touch the app's and
              the app's cannot flatter the email into looking better than it
              will in an inbox.
            */}
            <iframe
              title="Email preview"
              srcDoc={html}
              sandbox=""
              className="h-[420px] w-full rounded-lg border border-border bg-white"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!dirty} onClick={save}>
            Save design
          </Button>
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw /> Reset to default
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

"use client";

import * as React from "react";
import { Monitor, Smartphone, TriangleAlert } from "lucide-react";
import { blocksFor, blocksToText, mapBlockText, blockTemplateStrings } from "@/domain/email-content";
import type { EmailBlock } from "@/domain/email-content";
import { renderEmailHtml } from "@/domain/email-render";
import { eventContext } from "@/domain/event";
import type { CustomerEvent } from "@/domain/event";
import { interpolate, unresolvedPlaceholders } from "@/domain/expression";
import type { EvaluationContext } from "@/domain/expression";
import type { JourneyDefinition, SendEmailConfig } from "@/domain/journey";
import { fullName, profileContext } from "@/domain/profile";
import type { Profile } from "@/domain/profile";
import { readEvents, readProfiles } from "@/services/storage";
import { getEmailTheme } from "@/services/sending";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { BlockEditor } from "./block-editor";

/**
 * The email designer: blocks on the left, the actual email on the right.
 *
 * Separate from the properties panel rather than an expansion of it. An email
 * is 600px wide and the panel is less than half that, so the only way to see
 * what you are making was to send yourself a test and look at your inbox.
 *
 * The preview runs the same renderer and the same interpolation as a live
 * send, against a real client — so the merge fields you see resolved are the
 * ones that will resolve, and the ones flagged here are exactly the ones that
 * would stop the send.
 */

const WIDTHS = { desktop: 680, mobile: 390 } as const;
type Device = keyof typeof WIDTHS;

export function EmailDesigner({
  journey,
  config,
  onSave,
  onClose,
}: {
  journey: JourneyDefinition;
  config: SendEmailConfig;
  onSave: (next: Partial<SendEmailConfig>) => void;
  onClose: () => void;
}) {
  const profiles = React.useMemo(() => readProfiles(), []);
  const theme = React.useMemo(() => getEmailTheme(), []);

  const [subject, setSubject] = React.useState(config.subject);
  const [preheader, setPreheader] = React.useState(config.preheader ?? "");
  const [blocks, setBlocks] = React.useState<EmailBlock[]>(() => blocksFor(config));
  const [device, setDevice] = React.useState<Device>("desktop");
  /*
   * Remembered per browser, because you preview against the same awkward
   * client repeatedly — the one with the missing venue, or the longest name —
   * and re-picking them every time you open the designer gets old fast.
   */
  const [profileId, setProfileId] = React.useState(() => {
    const remembered = readRememberedProfile();
    if (remembered && profiles.some((item) => item.id === remembered)) return remembered;
    return profiles[0]?.id ?? "";
  });

  const chooseProfile = (id: string) => {
    setProfileId(id);
    rememberProfile(id);
  };

  const profile = profiles.find((item) => item.id === profileId) ?? profiles[0];

  /*
   * The most recent real event of the journey's own trigger, so `{{event.*}}`
   * resolves the way it will in production. Falling back to a bare event
   * rather than inventing payload fields keeps the warnings honest — an
   * invented venue name would hide a merge field that is actually broken.
   */
  const context = React.useMemo<EvaluationContext | null>(() => {
    if (!profile) return null;

    const events = readEvents();
    const match = events.find(
      (event) => event.profileId === profile.id && event.name === journey.trigger.name,
    );
    const event: CustomerEvent =
      match ??
      ({
        id: "preview",
        name: journey.trigger.name,
        profileId: profile.id,
        occurredAt: new Date().toISOString(),
        payload: {},
      } as CustomerEvent);

    return {
      profile: profileContext(profile, new Date()),
      event: eventContext(event),
      journey: {
        id: journey.id,
        key: journey.key,
        name: journey.name,
        version: journey.version,
      },
    };
  }, [journey, profile]);

  const resolved = React.useMemo(
    () => (context ? mapBlockText(blocks, (value) => interpolate(value, context)) : blocks),
    [blocks, context],
  );

  const unresolved = React.useMemo(() => {
    if (!context) return [];
    return [
      ...new Set([
        ...unresolvedPlaceholders(subject, context),
        ...blockTemplateStrings(blocks).flatMap((value) =>
          unresolvedPlaceholders(value, context),
        ),
      ]),
    ];
  }, [blocks, context, subject]);

  const html = React.useMemo(
    () =>
      renderEmailHtml({
        blocks: resolved,
        theme,
        preheader: context ? interpolate(preheader, context) : preheader,
        // A placeholder: the real one is per client and built at send time.
        unsubscribeUrl: "#preview",
      }),
    [context, preheader, resolved, theme],
  );

  const save = () => {
    onSave({ subject, preheader, blocks, body: blocksToText(blocks) });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent
        className="h-[92vh] max-w-[1180px] p-0"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogTitle className="sr-only">Design email</DialogTitle>
        <DialogDescription className="sr-only">
          Edit the email body and see how it will look.
        </DialogDescription>

        <div className="flex items-center gap-3 border-b border-border px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[14px] font-semibold tracking-tight">Design email</h2>
            <p className="truncate text-[12px] text-muted-foreground">
              {journey.name} · {config.template}
            </p>
          </div>

          <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
            {(["desktop", "mobile"] as Device[]).map((option) => {
              const Icon = option === "desktop" ? Monitor : Smartphone;
              return (
                <button
                  key={option}
                  type="button"
                  aria-label={option === "desktop" ? "Desktop width" : "Phone width"}
                  onClick={() => setDevice(option)}
                  className={cn(
                    "rounded-md p-1.5 transition-colors",
                    device === option
                      ? "bg-accent-soft text-accent"
                      : "text-muted-foreground hover:bg-surface-muted",
                  )}
                >
                  <Icon className="size-3.5" />
                </button>
              );
            })}
          </div>

          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={save}>
            Done
          </Button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)]">
          {/* Editing side */}
          <div className="scroll-slim min-h-0 space-y-4 overflow-y-auto border-border p-5 lg:border-r">
            <div className="space-y-1.5">
              <Label htmlFor="designer-subject" className="text-[11px]">
                Subject
              </Label>
              <Input
                id="designer-subject"
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="designer-preheader" className="text-[11px]">
                Inbox preview line
              </Label>
              <Input
                id="designer-preheader"
                value={preheader}
                placeholder="Shown next to the subject in most inboxes"
                onChange={(event) => setPreheader(event.target.value)}
              />
            </div>

            <BlockEditor config={{ body: config.body, blocks }} onChange={setBlocks} />
          </div>

          {/* Preview side */}
          <div className="flex min-h-0 flex-col bg-surface-muted/40">
            <div className="flex items-center gap-2 border-b border-border px-4 py-2">
              <span className="shrink-0 text-[11px] text-muted-foreground">Previewing for</span>
              <Select value={profileId} onValueChange={chooseProfile}>
                <SelectTrigger className="h-7 max-w-[240px] text-[12px]">
                  <SelectValue placeholder="Choose a client" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((item: Profile) => (
                    <SelectItem key={item.id} value={item.id}>
                      {fullName(item)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {unresolved.length > 0 ? (
              <div className="flex items-start gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2.5 text-[12px] leading-relaxed text-warning">
                <TriangleAlert className="mt-px size-3.5 shrink-0" />
                <span>
                  <strong className="font-semibold">
                    {unresolved.length === 1
                      ? "One field cannot be filled in"
                      : `${unresolved.length} fields cannot be filled in`}
                  </strong>{" "}
                  for {profile ? fullName(profile) : "this client"}:{" "}
                  {unresolved.map((field) => `{{${field}}}`).join(", ")}. A live send carrying
                  these is blocked, because they would appear in the email exactly as written.
                </span>
              </div>
            ) : null}

            <div className="scroll-slim min-h-0 flex-1 overflow-y-auto p-4">
              {/*
                An iframe so the email's styles cannot touch the app's, and the
                app's cannot flatter the email into looking better than it will
                in an inbox.
              */}
              <iframe
                title="Email preview"
                srcDoc={html}
                sandbox=""
                style={{ width: WIDTHS[device] }}
                className="mx-auto h-full min-h-[560px] rounded-lg border border-border bg-white transition-[width]"
              />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/*
 * A per-viewer convenience, so browser storage is the right home for it —
 * nothing here needs to reach the server, other viewers or another device.
 * Both accessors are guarded: site data can be blocked or cleared, and a
 * throw here would take the whole designer down with it.
 */
const REMEMBERED_PROFILE_KEY = "cadence:designer:profile";

function readRememberedProfile(): string | null {
  try {
    return window.localStorage.getItem(REMEMBERED_PROFILE_KEY);
  } catch {
    return null;
  }
}

function rememberProfile(id: string): void {
  try {
    window.localStorage.setItem(REMEMBERED_PROFILE_KEY, id);
  } catch {
    // Private windows and blocked site data both land here. The designer
    // works fine without the memory.
  }
}

"use client";

import * as React from "react";
import { Eye, Monitor, PencilRuler, Smartphone, TriangleAlert } from "lucide-react";
import {
  blockTemplateStrings,
  blocksFor,
  blocksToText,
  createBlock,
  findBlock,
  insertBlock,
  mapBlockText,
  moveBlock,
  removeBlock,
  updateBlock,
  type BlockLocation,
  type EmailBlock,
  type EmailBlockKind,
} from "@/domain/email-content";
import { renderEmailHtml } from "@/domain/email-render";
import { eventContext, type CustomerEvent, type EventTemplate } from "@/domain/event";
import { buildFieldCatalogue } from "@/domain/field-catalogue";
import { interpolate, unresolvedPlaceholders } from "@/domain/expression";
import type { EvaluationContext } from "@/domain/expression";
import type { JourneyDefinition, SendEmailConfig } from "@/domain/journey";
import { fullName, profileContext, type Profile } from "@/domain/profile";
import { DOCUMENT_KEYS, readDoc, readEvents, readProfiles } from "@/services/storage";
import { getEmailTheme } from "@/services/sending";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { BlockInspector } from "./block-inspector";
import { EmailCanvas, type DragPayload } from "./email-canvas";
import { ElementPalette } from "./element-palette";
import { FieldCatalogueProvider, FieldInput } from "./field-picker";

/**
 * The email designer: palette, canvas, inspector — and the real render behind
 * a toggle.
 *
 * Two views on purpose. The canvas is React so elements can be dragged into
 * place, which an iframe cannot support; the preview is the actual email HTML
 * in an iframe, which is the only honest answer to "what will this look
 * like?". Everything an editor like this gets wrong lives in the gap between
 * those two, so the gap is a button rather than a hope.
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
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [device, setDevice] = React.useState<Device>("desktop");
  const [mode, setMode] = React.useState<"design" | "preview">("design");

  const [profileId, setProfileId] = React.useState(() => {
    const remembered = readRememberedProfile();
    if (remembered && profiles.some((item) => item.id === remembered)) return remembered;
    return profiles[0]?.id ?? "";
  });

  const chooseProfile = (id: string) => {
    setProfileId(id);
    rememberProfile(id);
  };

  const profile = profiles.find((item) => item.id === profileId) ?? profiles[0] ?? null;

  /* ---------------------------------------------------------------------- */
  /* Context                                                                */
  /* ---------------------------------------------------------------------- */

  const context = React.useMemo<EvaluationContext | null>(() => {
    if (!profile) return null;

    const match = readEvents().find(
      (event) => event.profileId === profile.id && event.name === journey.trigger.name,
    );
    /*
     * Falling back to an empty payload rather than inventing one: a made-up
     * venue name would hide a merge field that is genuinely broken.
     */
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

  const catalogue = React.useMemo(
    () =>
      buildFieldCatalogue({
        journey,
        profiles,
        events: readEvents(),
        eventTemplates: readDoc<EventTemplate[]>(DOCUMENT_KEYS.eventTemplates) ?? [],
        focus: profile,
      }),
    [journey, profile, profiles],
  );

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
        unsubscribeUrl: "#preview",
      }),
    [context, preheader, resolved, theme],
  );

  /* ---------------------------------------------------------------------- */
  /* Editing                                                                */
  /* ---------------------------------------------------------------------- */

  const handleDrop = (payload: DragPayload, at: BlockLocation) => {
    if (payload.type === "new") {
      const block = createBlock(payload.kind, payload.widths);
      setBlocks((current) => insertBlock(current, block, at));
      setSelectedId(block.id);
      return;
    }
    setBlocks((current) => moveBlock(current, payload.id, at));
  };

  const addAtEnd = (kind: EmailBlockKind, widths?: number[]) => {
    const block = createBlock(kind, widths);
    setBlocks((current) => [...current, block]);
    setSelectedId(block.id);
  };

  const selected = selectedId ? findBlock(blocks, selectedId) : null;

  const save = () => {
    onSave({ subject, preheader, blocks, body: blocksToText(blocks) });
    onClose();
  };

  return (
    <FieldCatalogueProvider groups={catalogue}>
      <Dialog open onOpenChange={(next) => !next && onClose()}>
        <DialogContent
          className="h-[94vh] max-w-[1400px] p-0"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogTitle className="sr-only">Design email</DialogTitle>
          <DialogDescription className="sr-only">
            Drag elements onto the email, and see how it will look.
          </DialogDescription>

          {/* Header */}
          <div className="flex shrink-0 items-center gap-3 border-b border-border px-5 py-2.5">
            <div className="min-w-0 flex-1">
              <h2 className="truncate text-[14px] font-semibold tracking-tight">Design email</h2>
              <p className="truncate text-[12px] text-muted-foreground">
                {journey.name} · {config.template}
              </p>
            </div>

            <Toggle
              options={[
                { value: "design", label: "Design", icon: PencilRuler },
                { value: "preview", label: "Preview", icon: Eye },
              ]}
              value={mode}
              onChange={setMode}
            />

            {mode === "preview" ? (
              <Toggle
                options={[
                  { value: "desktop", label: "Desktop", icon: Monitor },
                  { value: "mobile", label: "Phone", icon: Smartphone },
                ]}
                value={device}
                onChange={setDevice}
                iconOnly
              />
            ) : null}

            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={save}>
              Done
            </Button>
          </div>

          {/* Subject row */}
          <div className="grid shrink-0 gap-3 border-b border-border px-5 py-3 md:grid-cols-2">
            <FieldInput label="Subject" value={subject} onChange={setSubject} />
            <FieldInput
              label="Inbox preview line"
              value={preheader}
              placeholder="Shown next to the subject in most inboxes"
              onChange={setPreheader}
            />
          </div>

          {/* Client + warnings */}
          <div className="flex shrink-0 items-center gap-2 border-b border-border px-5 py-2">
            <span className="shrink-0 text-[11px] text-muted-foreground">Showing</span>
            <Select value={profileId} onValueChange={chooseProfile}>
              <SelectTrigger className="h-7 max-w-[220px] text-[12px]">
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

            {unresolved.length > 0 ? (
              <span className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-warning">
                <TriangleAlert className="size-3.5 shrink-0" />
                <span className="truncate">
                  {unresolved.map((field) => `{{${field}}}`).join(", ")} cannot be filled in for{" "}
                  {profile ? fullName(profile) : "this client"} — a live send is blocked while
                  that is true.
                </span>
              </span>
            ) : null}
          </div>

          {/* Body */}
          {mode === "design" ? (
            <div className="grid min-h-0 flex-1 grid-cols-[210px_minmax(0,1fr)_280px]">
              <div className="scroll-slim min-h-0 overflow-y-auto border-r border-border">
                <ElementPalette onAdd={addAtEnd} />
              </div>

              <div className="scroll-slim min-h-0 overflow-y-auto bg-surface-muted/40 p-5">
                <EmailCanvas
                  /*
                   * Resolved, not raw. There is a client picker directly
                   * above this, so the canvas should read the way the email
                   * reads for them. The template behind a block is what the
                   * inspector shows once it is selected, which is where you
                   * want the braces and nowhere else.
                   *
                   * Ids survive `mapBlockText`, so selection and drop targets
                   * still address the real blocks.
                   */
                  blocks={resolved}
                  theme={theme}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onDrop={handleDrop}
                />
              </div>

              <div className="scroll-slim min-h-0 overflow-y-auto border-l border-border">
                <BlockInspector
                  block={selected}
                  onChange={(patch) =>
                    selectedId && setBlocks((current) => updateBlock(current, selectedId, patch))
                  }
                  onRemove={() => {
                    if (!selectedId) return;
                    setBlocks((current) => removeBlock(current, selectedId));
                    setSelectedId(null);
                  }}
                />
              </div>
            </div>
          ) : (
            <div className="scroll-slim min-h-0 flex-1 overflow-y-auto bg-surface-muted/40 p-5">
              {/*
                The real email HTML, isolated so its styles cannot touch the
                app's and the app's cannot flatter it.
              */}
              <iframe
                title="Email preview"
                srcDoc={html}
                sandbox=""
                style={{ width: WIDTHS[device] }}
                className="mx-auto h-full min-h-[640px] rounded-lg border border-border bg-white transition-[width]"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </FieldCatalogueProvider>
  );
}

function Toggle<T extends string>({
  options,
  value,
  onChange,
  iconOnly = false,
}: {
  options: { value: T; label: string; icon: React.ComponentType<{ className?: string }> }[];
  value: T;
  onChange: (value: T) => void;
  iconOnly?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-0.5 rounded-lg border border-border p-0.5">
      {options.map((option) => {
        const Icon = option.icon;
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2 py-1 text-[11.5px] font-medium transition-colors",
              value === option.value
                ? "bg-accent-soft text-accent"
                : "text-muted-foreground hover:bg-surface-muted",
            )}
          >
            <Icon className="size-3.5" />
            {iconOnly ? null : option.label}
          </button>
        );
      })}
    </div>
  );
}

/*
 * A per-viewer convenience, so browser storage is its home — nothing here
 * needs to reach the server, other viewers or another device. Guarded because
 * blocked or cleared site data makes these throw, and the designer works fine
 * without the memory.
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
    // Private windows and blocked site data both land here.
  }
}

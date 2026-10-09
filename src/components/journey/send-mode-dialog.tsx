"use client";

import * as React from "react";
import { Check, Mail, Plus, ShieldAlert, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import {
  SEND_MODE_DESCRIPTION,
  SEND_MODE_LABEL,
  createTestRecipient,
  type SendMode,
} from "@/domain/sending";
import {
  getControls,
  getSendSetting,
  getTestRecipients,
  saveSendSetting,
  saveTestRecipient,
} from "@/services/sending";
import { notifySendingChanged } from "@/components/shell/sending-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

/**
 * Chooses whether a journey sends, and to whom.
 *
 * The test address is shown here rather than configured elsewhere and assumed,
 * because the question you actually have at the moment of flipping a journey
 * on is "where is this about to land?" — and the honest answer depends on both
 * the chosen recipient and the workspace kill switch.
 */

const MODES: SendMode[] = ["off", "test", "live"];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Mounted only while open, by design.
 *
 * Every value it shows is read once at mount from the hydrated cache, so the
 * caller rendering it conditionally is what keeps it current — an always-mounted
 * instance would show whatever the state was the first time the page rendered.
 * Taking no `open` prop is how that contract is enforced rather than hoped for.
 */
export function SendModeDialog({
  journeyKey,
  journeyName,
  onClose,
  onSaved,
}: {
  journeyKey: string;
  journeyName: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [controls] = React.useState(getControls);
  const [recipients, setRecipients] = React.useState(getTestRecipients);
  const [mode, setMode] = React.useState<SendMode>(
    () => getSendSetting(journeyKey)?.mode ?? "off",
  );
  const [recipientId, setRecipientId] = React.useState<string | null>(
    () => getSendSetting(journeyKey)?.testRecipientId ?? getTestRecipients()[0]?.id ?? null,
  );
  const [adding, setAdding] = React.useState(() => getTestRecipients().length === 0);
  const [draftName, setDraftName] = React.useState("");
  const [draftEmail, setDraftEmail] = React.useState("");

  const chosen = recipients.find((item) => item.id === recipientId) ?? null;
  const emailValid = EMAIL_PATTERN.test(draftEmail.trim());

  const addRecipient = () => {
    if (!emailValid) return;
    const recipient = createTestRecipient(
      draftName.trim() || draftEmail.trim().split("@")[0],
      draftEmail,
    );
    setRecipients(saveTestRecipient(recipient));
    setRecipientId(recipient.id);
    setAdding(false);
    setDraftName("");
    setDraftEmail("");
  };

  // Test mode with no recipient would read as armed and send nothing.
  const blocked = mode === "test" && !chosen;

  const save = () => {
    if (blocked) return;
    saveSendSetting(journeyKey, mode, recipientId);
    toast.success(`${journeyName} — ${SEND_MODE_LABEL[mode].toLowerCase()}`, {
      description:
        mode === "live"
          ? "Emails from this journey now go to clients."
          : mode === "test"
            ? `Emails are redirected to ${chosen?.email}.`
            : "Messages are recorded but nothing is sent.",
    });
    // Tells the sidebar summary and anything else listening, which otherwise
    // keeps reporting whatever was true when the page first rendered.
    notifySendingChanged();
    onSaved?.();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sending — {journeyName}</DialogTitle>
          <DialogDescription>
            Applies to everyone in this journey immediately, including anyone already part-way
            through it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {controls?.killSwitch ? (
            <p className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[12px] leading-relaxed text-danger">
              <ShieldAlert className="mt-px size-3.5 shrink-0" />
              <span>
                <strong className="font-semibold">Sending is disabled within org.</strong> The
                workspace kill switch is on, so nothing will be sent whatever you choose here.
                Turn it off in Settings when you are ready.
              </span>
            </p>
          ) : null}

          <div className="space-y-1.5">
            {MODES.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMode(option)}
                className={cn(
                  "flex w-full items-start gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-colors",
                  mode === option
                    ? "border-accent bg-accent-soft"
                    : "border-border hover:bg-surface-muted",
                )}
              >
                <span
                  className={cn(
                    "mt-px flex size-4 shrink-0 items-center justify-center rounded-full border",
                    mode === option
                      ? "border-accent bg-accent text-white"
                      : "border-border-strong",
                  )}
                >
                  {mode === option ? <Check className="size-2.5" /> : null}
                </span>
                <span className="space-y-0.5">
                  <span className="flex items-center gap-2 text-[13px] font-medium">
                    {SEND_MODE_LABEL[option]}
                    {option === "live" ? <Badge tone="positive">Real clients</Badge> : null}
                  </span>
                  <span className="block text-[12px] leading-relaxed text-muted-foreground">
                    {SEND_MODE_DESCRIPTION[option]}
                  </span>
                </span>
              </button>
            ))}
          </div>

          {mode === "test" ? (
            <>
              <Separator />
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <Label>Test sends go to</Label>
                  {!adding && recipients.length > 0 ? (
                    <Button variant="ghost" size="sm" onClick={() => setAdding(true)}>
                      <Plus /> Add another
                    </Button>
                  ) : null}
                </div>

                {recipients.length > 0 ? (
                  <div className="space-y-1">
                    {recipients.map((recipient) => (
                      <button
                        key={recipient.id}
                        type="button"
                        onClick={() => setRecipientId(recipient.id)}
                        className={cn(
                          "flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left text-[13px] transition-colors",
                          recipientId === recipient.id
                            ? "border-accent bg-accent-soft"
                            : "border-border hover:bg-surface-muted",
                        )}
                      >
                        <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">
                          <span className="font-medium">{recipient.name}</span>
                          <span className="text-muted-foreground"> · {recipient.email}</span>
                        </span>
                        {recipientId === recipient.id ? (
                          <Check className="size-3.5 shrink-0 text-accent" />
                        ) : null}
                      </button>
                    ))}
                  </div>
                ) : null}

                {adding ? (
                  <div className="space-y-2 rounded-lg border border-border bg-surface-muted/50 p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label htmlFor="test-name" className="text-[11px]">
                          Name
                        </Label>
                        <Input
                          id="test-name"
                          value={draftName}
                          placeholder="Mark"
                          onChange={(event) => setDraftName(event.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="test-email" className="text-[11px]">
                          Email
                        </Label>
                        <Input
                          id="test-email"
                          type="email"
                          value={draftEmail}
                          placeholder="you@example.com"
                          onChange={(event) => setDraftEmail(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              addRecipient();
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" disabled={!emailValid} onClick={addRecipient}>
                        Add test profile
                      </Button>
                      {recipients.length > 0 ? (
                        <Button variant="ghost" size="sm" onClick={() => setAdding(false)}>
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {chosen ? (
                  <p className="text-[12px] leading-relaxed text-muted-foreground">
                    Every email this journey sends goes to{" "}
                    <strong className="font-medium text-foreground">{chosen.email}</strong>, with
                    the client&apos;s real address in the subject line so you can tell whose
                    message it was.
                  </p>
                ) : (
                  <p className="flex items-start gap-2 text-[12px] leading-relaxed text-warning">
                    <TriangleAlert className="mt-px size-3.5 shrink-0" />
                    Choose or add a test address — without one, test mode sends nothing at all.
                  </p>
                )}
              </div>
            </>
          ) : null}

          {mode === "live" ? (
            <p className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-soft px-3 py-2.5 text-[12px] leading-relaxed text-warning">
              <TriangleAlert className="mt-px size-3.5 shrink-0" />
              <span>
                Emails will go to real clients at their own addresses. Consent, frequency caps and
                suppression still apply, but nothing else stands between this journey and
                someone&apos;s inbox.
              </span>
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={blocked}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The at-a-glance state, for a journey card or header. */
export function SendModeBadge({ mode, killSwitch }: { mode: SendMode; killSwitch: boolean }) {
  if (killSwitch) {
    return (
      <Badge tone="negative">
        <ShieldAlert /> Sending disabled within org
      </Badge>
    );
  }
  if (mode === "live") {
    return (
      <Badge tone="positive">
        <Mail /> Sending live
      </Badge>
    );
  }
  if (mode === "test") {
    return (
      <Badge tone="warning">
        <Mail /> Test mode
      </Badge>
    );
  }
  return <Badge tone="outline">Not sending</Badge>;
}

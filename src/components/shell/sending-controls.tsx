"use client";

import * as React from "react";
import { Mail, Plus, Send, ShieldAlert, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { createTestRecipient, type SendingControls, type TestRecipient } from "@/domain/sending";
import {
  getControls,
  getSendSettings,
  getTestRecipients,
  removeTestRecipient,
  saveTestRecipient,
  setKillSwitch,
} from "@/services/sending";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/misc";

/**
 * The workspace-level sending controls.
 *
 * Notifying other components by DOM event rather than by lifting all of this
 * into a context: the kill switch is read in two unrelated places (this card
 * and the shell banner) and written in one, so a context would be a lot of
 * wiring to replace a single line.
 */
const CHANGED_EVENT = "cadence:sending-changed";

export function notifySendingChanged() {
  window.dispatchEvent(new Event(CHANGED_EVENT));
}

export function useSendingControls(): SendingControls {
  // Read at mount, not in an effect: the cache is already hydrated by the time
  // anything below the shell renders, so there is nothing to wait for.
  const [controls, setControls] = React.useState(getControls);

  React.useEffect(() => {
    const read = () => setControls(getControls());
    window.addEventListener(CHANGED_EVENT, read);
    return () => window.removeEventListener(CHANGED_EVENT, read);
  }, []);

  return controls;
}

/* -------------------------------------------------------------------------- */
/* Kill switch                                                                */
/* -------------------------------------------------------------------------- */

export function KillSwitchCard() {
  const controls = useSendingControls();
  const [confirming, setConfirming] = React.useState(false);
  const [reason, setReason] = React.useState("");

  // Only counts journeys that would really reach a client, so the confirmation
  // tells you what you are actually stopping. Read on every render rather than
  // memoised: it is a filter over a handful of records, and it has to be right
  // at the moment the dialog opens.
  const liveCount = getSendSettings().filter((setting) => setting.mode === "live").length;

  const enable = () => {
    setKillSwitch(true, reason);
    notifySendingChanged();
    setConfirming(false);
    setReason("");
    toast.success("Sending stopped", {
      description: "No email will leave the workspace until you turn this off.",
    });
  };

  const disable = () => {
    setKillSwitch(false);
    notifySendingChanged();
    toast.success("Sending resumed", {
      description: "Journeys are back to their own individual settings.",
    });
  };

  return (
    <Card className={controls.killSwitch ? "border-danger/40" : undefined}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Kill switch
          {controls.killSwitch ? (
            <Badge tone="negative">
              <ShieldAlert /> Active
            </Badge>
          ) : (
            <Badge tone="outline">Off</Badge>
          )}
        </CardTitle>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Stops every email from every journey at once, without pausing or editing anything.
          Journeys carry on running and recording what they decided — the messages simply do not
          go out. Turning it off puts everything back exactly as it was.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {controls.killSwitch ? (
          <>
            <p className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5 text-[12px] leading-relaxed text-danger">
              <strong className="font-semibold">Sending is disabled within org.</strong>
              {controls.killSwitchReason ? ` ${controls.killSwitchReason}` : ""}
              {controls.killSwitchAt
                ? ` Enabled ${new Date(controls.killSwitchAt).toLocaleString("en-GB")}.`
                : ""}
            </p>
            <Button size="sm" onClick={disable}>
              <ShieldCheck /> Resume sending
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="kill-reason" className="text-[11px]">
                Reason (optional)
              </Label>
              <Input
                id="kill-reason"
                value={reason}
                placeholder="Wrong dates in the countdown copy"
                onChange={(event) => setReason(event.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Shown wherever the status appears, so you remember why it is on.
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
              <ShieldAlert /> Stop all sending
            </Button>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop all sending?</AlertDialogTitle>
            <AlertDialogDescription>
              {liveCount > 0
                ? `${liveCount} journey${liveCount === 1 ? "" : "s"} currently sending to real clients will stop immediately.`
                : "No journey is sending to real clients right now, so this is a precaution rather than a stop."}{" "}
              Journeys keep running and recording; nothing is deleted, and you can resume at any
              time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={enable}>Stop all sending</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Test profiles                                                              */
/* -------------------------------------------------------------------------- */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function TestRecipientsCard() {
  const [recipients, setRecipients] = React.useState(getTestRecipients);
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [pendingDelete, setPendingDelete] = React.useState<TestRecipient | null>(null);
  const [sending, setSending] = React.useState<string | null>(null);

  /**
   * Proves the provider is configured, without involving a journey.
   *
   * Worth its own button: every other way of finding out is to wait for a
   * countdown and then deduce the problem from nothing arriving.
   */
  const sendTest = async (recipient: TestRecipient) => {
    setSending(recipient.id);
    try {
      const response = await fetch("/api/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipientId: recipient.id }),
      });
      const payload = (await response.json().catch(() => null)) as
        | { error?: string; detail?: string }
        | null;

      if (!response.ok) {
        toast.error("Test email not sent", {
          description: payload?.error ?? `The server returned ${response.status}.`,
        });
        return;
      }
      toast.success(`Test email sent to ${recipient.email}`, {
        description: "If it does not arrive, check the spam folder and the Resend dashboard.",
      });
    } catch {
      toast.error("Test email not sent", { description: "Could not reach the server." });
    } finally {
      setSending(null);
    }
  };

  const valid = EMAIL_PATTERN.test(email.trim());

  const add = () => {
    if (!valid) return;
    setRecipients(
      saveTestRecipient(createTestRecipient(name.trim() || email.trim().split("@")[0], email)),
    );
    setName("");
    setEmail("");
  };

  const confirmDelete = () => {
    if (!pendingDelete) return;
    setRecipients(removeTestRecipient(pendingDelete.id));
    toast.success("Test profile removed", {
      description: "Any journey pointing at it has been set back to not sending.",
    });
    setPendingDelete(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Test profiles</CardTitle>
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Addresses a journey in test mode can send to instead of the client. Kept separate from
          your client list on purpose, so a test address can never be picked up by a segment, a
          countdown or an experiment.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        {recipients.length > 0 ? (
          <div className="space-y-1">
            {recipients.map((recipient) => (
              <div
                key={recipient.id}
                className="flex items-center gap-2.5 rounded-lg border border-border px-3 py-2 text-[13px]"
              >
                <Mail className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{recipient.name}</span>
                  <span className="text-muted-foreground"> · {recipient.email}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={sending !== null}
                  onClick={() => void sendTest(recipient)}
                >
                  <Send /> {sending === recipient.id ? "Sending…" : "Send test"}
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Remove ${recipient.name}`}
                  onClick={() => setPendingDelete(recipient)}
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-muted-foreground">
            None yet. Add one here, or from a journey when you put it into test mode.
          </p>
        )}

        <Separator />

        <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto] sm:items-end">
          <div className="space-y-1">
            <Label htmlFor="recipient-name" className="text-[11px]">
              Name
            </Label>
            <Input
              id="recipient-name"
              value={name}
              placeholder="Mark"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="recipient-email" className="text-[11px]">
              Email
            </Label>
            <Input
              id="recipient-email"
              type="email"
              value={email}
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  add();
                }
              }}
            />
          </div>
          <Button size="sm" disabled={!valid} onClick={add}>
            <Plus /> Add
          </Button>
        </div>
      </CardContent>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Any journey currently sending test email to {pendingDelete?.email} will be set back
              to not sending, rather than left pointing at an address that no longer exists.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Banner                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The sidebar's standing answer to "is this thing emailing anyone?".
 *
 * Replaces a hardcoded "nothing is ever delivered" notice, which stopped being
 * true the moment a provider was connected and would have been the most
 * dangerous sentence in the app to leave in place.
 */
export function SidebarSendingSummary() {
  const controls = useSendingControls();
  const [, setVersion] = React.useState(0);

  React.useEffect(() => {
    const bump = () => setVersion((value) => value + 1);
    window.addEventListener(CHANGED_EVENT, bump);
    return () => window.removeEventListener(CHANGED_EVENT, bump);
  }, []);

  const settings = getSendSettings();
  const live = settings.filter((setting) => setting.mode === "live").length;
  const test = settings.filter((setting) => setting.mode === "test").length;

  if (controls.killSwitch) {
    return (
      <div className="mb-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[11px] font-medium text-danger">
          <ShieldAlert className="size-3" /> Killswitch enabled
        </p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-danger/80">
          Sending disabled within org. No email leaves the workspace.
        </p>
      </div>
    );
  }

  return (
    <div className="mb-2 rounded-lg bg-surface-muted px-3 py-2.5">
      <p className="text-[11px] font-medium text-foreground">
        {live > 0
          ? `${live} journey${live === 1 ? "" : "s"} sending live`
          : test > 0
            ? `${test} journey${test === 1 ? "" : "s"} in test`
            : "No journey is sending"}
      </p>
      <p className="mt-0.5 text-[11px] leading-relaxed text-subtle-foreground">
        {live > 0
          ? "Email reaches real clients. Push and SMS are still recorded only."
          : test > 0
            ? "Email is redirected to a test address."
            : "Every send is recorded. Set a journey to test or live to deliver it."}
      </p>
    </div>
  );
}

/**
 * The workspace-wide status strip.
 *
 * Deliberately not dismissable. The whole point of the kill switch is that you
 * cannot forget it is on and spend an afternoon wondering why the reminders
 * stopped.
 */
export function SendingBanner() {
  const controls = useSendingControls();
  if (!controls.killSwitch) return null;

  return (
    <div className="flex items-center justify-center gap-2 border-b border-danger/30 bg-danger-soft px-4 py-1.5 text-[12px] font-medium text-danger">
      <ShieldAlert className="size-3.5 shrink-0" />
      <span>
        Sending disabled within org — killswitch enabled
        {controls.killSwitchReason ? `: ${controls.killSwitchReason}` : ""}
      </span>
    </div>
  );
}

"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Code2, Copy, UserPlus } from "lucide-react";
import { toast } from "sonner";
import type { Profile } from "@/domain/profile";
import { addProfile, appendEvents } from "@/services/local-store";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mono, Separator } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FormState {
  firstName: string;
  lastName: string;
  email: string;
  mobile: string;
  weddingDate: string;
  venue: string;
  serviceBooked: string;
  partySize: string;
  bookingStatus: "enquiry" | "confirmed";
  emailConsent: boolean;
  smsConsent: boolean;
  notes: string;
}

const EMPTY: FormState = {
  firstName: "",
  lastName: "",
  email: "",
  mobile: "",
  weddingDate: "",
  venue: "",
  serviceBooked: "",
  partySize: "1",
  bookingStatus: "enquiry",
  emailConsent: true,
  smsConsent: false,
  notes: "",
};

/**
 * Client intake.
 *
 * This form writes into the same local store the rest of the app reads, so a
 * client captured here is immediately visible in Clients, picks up scheduled
 * triggers, and can be simulated through a journey. The embed snippet below is
 * the same form for a real website — it needs an API endpoint, which this PoC
 * does not have.
 */
export default function SignUpPage() {
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [copied, setCopied] = React.useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const canSubmit = form.firstName.trim() !== "" && form.email.trim() !== "";

  const submit = () => {
    const now = new Date();
    const id = `prof_${form.firstName.toLowerCase().replace(/[^a-z]/g, "")}_${Math.random()
      .toString(36)
      .slice(2, 6)}`;

    const profile: Profile = {
      id,
      customerId: `cli_${Math.floor(1000 + Math.random() * 9000)}`,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      email: form.email.trim(),
      mobile: form.mobile.trim(),
      country: "United Kingdom",
      loyaltyTier: "Bronze",
      appInstalled: false,
      lifetimeValue: 0,
      preferredLanguage: "English",
      preferredClub: "—",
      tags: [form.bookingStatus === "confirmed" ? "confirmed" : "enquiry"],
      createdAt: now.toISOString(),
      engagementScore: 50,
      messagesInLast24h: 0,
      messagesInLast7d: 0,
      contactability: {
        // Consent is captured explicitly and stored as given. Defaulting
        // someone to subscribed because they filled in a form is exactly the
        // thing that gets a small business into trouble.
        email: form.emailConsent ? "subscribed" : "unsubscribed",
        push: "unknown",
        sms: form.smsConsent ? "subscribed" : "unsubscribed",
        globallySuppressed: false,
        hasPushToken: false,
      },
      attributes: {
        bookingStatus: form.bookingStatus,
        weddingDate: form.weddingDate ? new Date(form.weddingDate).toISOString() : null,
        venue: form.venue || "—",
        serviceBooked: form.serviceBooked || "—",
        partySize: Number(form.partySize) || 0,
        trialCompleted: false,
        readyByTime: "",
        depositPaid: form.bookingStatus === "confirmed",
        referredBy: "Website form",
        notes: form.notes || "",
      },
      segmentNote: "Captured from the website sign-up form.",
    };

    addProfile(profile);

    appendEvents([
      {
        id: `evt_${Math.random().toString(36).slice(2, 10)}`,
        name: form.bookingStatus === "confirmed" ? "booking.confirmed" : "enquiry.submitted",
        profileId: id,
        occurredAt: now.toISOString(),
        payload: {
          source: "website-form",
          weddingDate: form.weddingDate || null,
          venue: form.venue || null,
          serviceBooked: form.serviceBooked || null,
          partySize: Number(form.partySize) || 0,
        },
      },
    ]);

    setForm(EMPTY);
    toast.success(`${profile.firstName} added`, {
      description:
        form.bookingStatus === "confirmed"
          ? "A booking.confirmed event was emitted — the Booking confirmation journey listens for it."
          : "An enquiry.submitted event was emitted.",
    });
  };

  const snippet = `<!-- Paste into your website. Replace the action URL with your endpoint. -->
<form method="POST" action="https://YOUR-ENDPOINT/api/intake">
  <input name="firstName"   placeholder="First name" required />
  <input name="lastName"    placeholder="Last name" />
  <input name="email"       type="email" placeholder="Email" required />
  <input name="mobile"      type="tel"   placeholder="Mobile" />
  <input name="weddingDate" type="date" />
  <input name="venue"       placeholder="Venue" />
  <input name="partySize"   type="number" min="1" value="1" />
  <textarea name="notes"    placeholder="Tell me about your day"></textarea>

  <label><input type="checkbox" name="emailConsent" value="true" /> Email me about my booking and offers</label>
  <label><input type="checkbox" name="smsConsent"   value="true" /> Text me reminders before the day</label>

  <button type="submit">Send enquiry</button>
</form>`;

  return (
    <>
      <PageHeader
        title="Client sign-up"
        description="Capture a new enquiry or booking. Adding a client here emits an event, exactly as the website form would."
      />

      <PageBody className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="size-4 text-subtle-foreground" />
              New client
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" required>
                <Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
              </Field>
              <Field label="Last name">
                <Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
              </Field>
              <Field label="Email" required>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </Field>
              <Field label="Mobile">
                <Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} />
              </Field>
              <Field label="Wedding date">
                <Input
                  type="date"
                  value={form.weddingDate}
                  onChange={(e) => set("weddingDate", e.target.value)}
                />
              </Field>
              <Field label="Venue">
                <Input value={form.venue} onChange={(e) => set("venue", e.target.value)} />
              </Field>
              <Field label="Service">
                <Input
                  value={form.serviceBooked}
                  placeholder="Bridal makeup + 3 bridesmaids"
                  onChange={(e) => set("serviceBooked", e.target.value)}
                />
              </Field>
              <Field label="Party size">
                <Input
                  type="number"
                  min={0}
                  value={form.partySize}
                  onChange={(e) => set("partySize", e.target.value)}
                />
              </Field>
            </div>

            <Field label="Status">
              <Select
                value={form.bookingStatus}
                onValueChange={(value) => set("bookingStatus", value as "enquiry" | "confirmed")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enquiry">Enquiry</SelectItem>
                  <SelectItem value="confirmed">Confirmed booking</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Notes">
              <Textarea
                rows={3}
                value={form.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </Field>

            <Separator />

            <div className="space-y-2">
              <Label>Consent</Label>
              <label className="flex items-center gap-2.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={form.emailConsent}
                  onChange={(e) => set("emailConsent", e.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
                Email about their booking and offers
              </label>
              <label className="flex items-center gap-2.5 text-[13px]">
                <input
                  type="checkbox"
                  checked={form.smsConsent}
                  onChange={(e) => set("smsConsent", e.target.checked)}
                  className="size-4 accent-[var(--accent)]"
                />
                SMS reminders before the day
              </label>
              <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                Consent is stored exactly as ticked. Nothing is sent to anyone who has not opted
                in, and the countdown journeys check this on every send.
              </p>
            </div>

            <Button className="w-full" disabled={!canSubmit} onClick={submit}>
              <UserPlus /> Add client
            </Button>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Code2 className="size-4 text-subtle-foreground" />
                Website embed
              </CardTitle>
              <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">
                The same fields as a plain HTML form.
              </p>
            </CardHeader>
            <CardContent className="space-y-3 pt-0">
              <pre className="scroll-slim max-h-72 overflow-auto rounded-lg bg-surface-muted p-3 font-mono text-[10.5px] leading-relaxed">
                {snippet}
              </pre>
              <Button
                variant="secondary"
                size="sm"
                className="w-full"
                onClick={() => {
                  void navigator.clipboard.writeText(snippet);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1800);
                }}
              >
                {copied ? <Check /> : <Copy />} {copied ? "Copied" : "Copy snippet"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>What this needs to go live</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2.5 pt-0 text-[12.5px] leading-relaxed text-muted-foreground">
              <p>
                This app stores everything in <Mono className="text-[11px]">localStorage</Mono> in
                one browser. A form on a real website cannot reach it — there is no server to post
                to, and no shared database.
              </p>
              <p>
                To connect the real form you need a hosted API endpoint writing to a real database,
                which is the same change that lets the countdown triggers run on a schedule instead
                of being clicked by hand.
              </p>
              <p>
                Until then this page is a genuine way to build up a client list and design the
                journeys around it — the data is real and persists, it just lives on this machine.
              </p>
              <Button variant="secondary" size="sm" asChild className="mt-1 w-full">
                <Link href="/triggers">Set up the countdown triggers</Link>
              </Button>
            </CardContent>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label>
        {label}
        {required ? <span className="ml-0.5 text-danger">*</span> : null}
      </Label>
      {children}
    </div>
  );
}

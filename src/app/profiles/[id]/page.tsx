"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  ChevronRight,
  Inbox,
  Mail,
  MessageSquare,
  Smartphone,
  Users,
} from "lucide-react";
import type { CustomerEvent } from "@/domain/event";
import type { Channel } from "@/domain/journey";
import { MESSAGE_STATUS_TONE, type MessageRecord } from "@/domain/message";
import {
  PARTICIPATION_LABEL,
  PARTICIPATION_TONE,
  type JourneyParticipation,
} from "@/domain/participation";
import { fullName, initials, type ConsentState, type Profile } from "@/domain/profile";
import { formatDateTime, formatRelative } from "@/domain/time";
import { useProfileDetail } from "@/hooks/use-data";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, Field, Mono, Separator, Skeleton } from "@/components/ui/misc";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export default function ProfileDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { detail, loading } = useProfileDetail(id);
  const { profile, events, messages, participations } = detail;

  if (loading) {
    return (
      <PageBody className="space-y-4">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </PageBody>
    );
  }

  if (!profile) {
    return (
      <PageBody>
        <EmptyState
          icon={<Users />}
          title="Profile not found"
          description="This customer is not in the seeded dataset."
          action={
            <Button size="sm" asChild>
              <Link href="/profiles">Back to profiles</Link>
            </Button>
          }
        />
      </PageBody>
    );
  }

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="flex size-9 items-center justify-center rounded-full bg-accent-soft text-[13px] font-semibold text-accent">
              {initials(profile)}
            </span>
            {fullName(profile)}
          </span>
        }
        description={profile.segmentNote}
        actions={
          <Button variant="secondary" size="sm" asChild>
            <Link href="/profiles">
              <ArrowLeft /> All profiles
            </Link>
          </Button>
        }
      />

      <PageBody className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-4">
          <IdentityCard profile={profile} />
          <ContactabilityCard profile={profile} />
          <AttributesCard profile={profile} />
        </div>

        <div className="min-w-0 space-y-4">
          <ActiveJourneysCard participations={participations} />

          <Card>
            <Tabs defaultValue="events">
              <div className="px-5 pt-4">
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="events">
                    <Inbox /> Recent events ({events.length})
                  </TabsTrigger>
                  <TabsTrigger value="messages">
                    <MessageSquare /> Message history ({messages.length})
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="events" className="px-5 py-4">
                {events.length === 0 ? (
                  <EmptyState
                    className="border-0 py-8"
                    title="No events recorded"
                    description="Events sent for this customer will appear here."
                  />
                ) : (
                  <ol className="space-y-1">
                    {events.map((event) => (
                      <EventRow key={event.id} event={event} />
                    ))}
                  </ol>
                )}
              </TabsContent>

              <TabsContent value="messages" className="px-5 py-4">
                {messages.length === 0 ? (
                  <EmptyState
                    className="border-0 py-8"
                    title="No messages yet"
                    description="Simulated communications appear here once a journey sends one."
                  />
                ) : (
                  <div className="space-y-2">
                    {messages.map((message) => (
                      <MessageRow key={message.id} message={message} />
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </Card>
        </div>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function IdentityCard({ profile }: { profile: Profile }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Identity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3.5 pt-0">
        <Field label="Customer ID">
          <Mono>{profile.customerId}</Mono>
        </Field>
        <Field label="Email">
          <span className="break-all">{profile.email}</span>
        </Field>
        <Field label="Mobile">{profile.mobile}</Field>
        <Field label="Country">{profile.country}</Field>
        <Field label="Customer since">{formatDateTime(profile.createdAt)}</Field>
      </CardContent>
    </Card>
  );
}

const CONSENT_TONE: Record<ConsentState, "positive" | "negative" | "warning"> = {
  subscribed: "positive",
  unsubscribed: "negative",
  unknown: "warning",
};

function ContactabilityCard({ profile }: { profile: Profile }) {
  const channels: { channel: Channel; label: string; icon: React.ReactNode }[] = [
    { channel: "email", label: "Email", icon: <Mail /> },
    { channel: "push", label: "Push", icon: <Smartphone /> },
    { channel: "sms", label: "SMS", icon: <MessageSquare /> },
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Contactability</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2.5 pt-0">
        {channels.map((item) => (
          <div key={item.channel} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[13px] [&_svg]:size-3.5 [&_svg]:text-subtle-foreground">
              {item.icon}
              {item.label}
            </span>
            <Badge tone={CONSENT_TONE[profile.contactability[item.channel]]}>
              {profile.contactability[item.channel]}
            </Badge>
          </div>
        ))}

        <Separator />

        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px]">Push token</span>
          <Badge tone={profile.contactability.hasPushToken ? "positive" : "warning"}>
            {profile.contactability.hasPushToken ? "Registered" : "Missing"}
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px]">Global suppression</span>
          <Badge tone={profile.contactability.globallySuppressed ? "negative" : "neutral"}>
            {profile.contactability.globallySuppressed ? "Suppressed" : "None"}
          </Badge>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px]">Frequency window</span>
          <Badge tone={profile.messagesInLast24h >= 3 ? "negative" : "neutral"}>
            {profile.messagesInLast24h}/3 in 24h
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}

function AttributesCard({ profile }: { profile: Profile }) {
  const rows: [string, React.ReactNode][] = [
    ["First name", profile.firstName],
    ["Loyalty tier", profile.loyaltyTier],
    ["Preferred club", profile.preferredClub],
    ["Lifetime value", `£${profile.lifetimeValue.toLocaleString()}`],
    ["App installed", profile.appInstalled ? "Yes" : "No"],
    ["Preferred language", profile.preferredLanguage],
    ...Object.entries(profile.attributes).map(
      ([key, value]) =>
        [
          key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase()),
          typeof value === "boolean" ? (value ? "Yes" : "No") : String(value),
        ] as [string, React.ReactNode],
    ),
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Attributes</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <dl className="divide-y divide-border">
          {rows.map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 py-2 first:pt-0">
              <dt className="text-[12px] text-muted-foreground">{label}</dt>
              <dd className="truncate text-right text-[12.5px] font-medium">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function ActiveJourneysCard({ participations }: { participations: JourneyParticipation[] }) {
  const active = participations.filter((item) => item.status !== "completed");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Active journeys</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {active.length === 0 ? (
          <p className="py-2 text-[13px] text-muted-foreground">
            This profile is not currently in any journey.
          </p>
        ) : (
          <div className="space-y-2">
            {active.map((participation) => (
              <Link
                key={participation.id}
                href={`/journeys/${participation.journeyId}`}
                className="flex items-center gap-3 rounded-lg border border-border px-3.5 py-3 transition-colors hover:border-border-strong hover:bg-surface-muted"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-[13px] font-medium">{participation.journeyName}</p>
                    <Badge tone={PARTICIPATION_TONE[participation.status]}>
                      {PARTICIPATION_LABEL[participation.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 truncate text-[12px] text-muted-foreground">
                    Current step: {participation.currentStep}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-subtle-foreground">
                    Entered {formatDateTime(participation.enteredAt)}
                    {participation.nextEvaluationAt
                      ? ` · Next evaluation ${formatDateTime(participation.nextEvaluationAt)}`
                      : ""}
                  </p>
                </div>
                <ChevronRight className="size-4 shrink-0 text-subtle-foreground" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EventRow({ event }: { event: CustomerEvent }) {
  const [open, setOpen] = React.useState(false);

  return (
    <li className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-3 py-2.5 text-left"
      >
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-subtle-foreground transition-transform",
            open && "rotate-90",
          )}
        />
        <Mono className="shrink-0">{event.name}</Mono>
        <span className="ml-auto shrink-0 text-[11.5px] text-subtle-foreground">
          {formatRelative(event.occurredAt)}
        </span>
      </button>
      {open ? (
        <div className="pb-3 pl-6.5">
          <p className="mb-1.5 text-[11px] text-subtle-foreground">
            {formatDateTime(event.occurredAt)}
          </p>
          <pre className="scroll-slim max-h-56 overflow-auto rounded-lg border border-border bg-surface-muted px-3 py-2.5 font-mono text-[11px] leading-[1.6]">
            {JSON.stringify(event.payload, null, 2)}
          </pre>
        </div>
      ) : null}
    </li>
  );
}

function MessageRow({ message }: { message: MessageRecord }) {
  return (
    <div className="rounded-lg border border-border px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-[12.5px] font-medium [&_svg]:size-3.5 [&_svg]:text-subtle-foreground">
          {message.channel === "email" ? <Mail /> : <Smartphone />}
          {message.channel === "email" ? "Email" : "Push"}
        </span>
        <Mono>{message.template}</Mono>
        <Badge tone={MESSAGE_STATUS_TONE[message.status]}>{message.status}</Badge>
        <span className="ml-auto text-[11.5px] text-subtle-foreground">
          {formatDateTime(message.sentAt)}
        </span>
      </div>
      <p className="mt-2 text-[13px] font-medium">{message.subject}</p>
      <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{message.body}</p>
      <p className="mt-2 text-[11.5px] text-subtle-foreground">
        Sent by{" "}
        <Link href={`/journeys/${message.journeyId}`} className="text-accent hover:underline">
          {message.journeyName}
        </Link>
      </p>
    </div>
  );
}

"use client";

import * as React from "react";
import {
  AlertTriangle,
  Download,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import {
  describeDeadline,
  isOpen,
  isOverdue,
  REQUEST_KIND_LABEL,
  REQUEST_KIND_OBLIGATION,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE,
  STORE_LABELS,
  totalRecords,
  type DataSubjectRequest,
  type ErasureCounts,
  type RequestKind,
  type RequestStatus,
} from "@/domain/privacy";
import { formatDateTime } from "@/domain/time";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, Mono, Separator, Skeleton } from "@/components/ui/misc";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Data subject requests.
 *
 * Deliberately a worklist rather than a one-click automation. Identity has to
 * be checked by a human before anything is disclosed or destroyed, and the
 * deletion preview exists so somebody sees what is about to go before it goes.
 */
export default function PrivacyPage() {
  const [requests, setRequests] = React.useState<DataSubjectRequest[] | null>(null);
  const [creating, setCreating] = React.useState(false);

  const load = React.useCallback(() => {
    void fetch("/api/privacy", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload: { requests: DataSubjectRequest[] }) => setRequests(payload.requests));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const open = requests?.filter(isOpen) ?? [];
  const closed = requests?.filter((request) => !isOpen(request)) ?? [];
  const overdue = open.filter((request) => isOverdue(request));

  return (
    <>
      <PageHeader
        title="Privacy requests"
        description="Access, erasure and objection requests from clients. UK GDPR gives you one calendar month to respond."
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={load}>
              <RefreshCw /> Refresh
            </Button>
            <Button size="sm" onClick={() => setCreating((value) => !value)}>
              <Plus /> Log a request
            </Button>
          </>
        }
      />

      <PageBody className="space-y-5">
        {overdue.length > 0 ? (
          <div className="flex items-start gap-2.5 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-3">
            <AlertTriangle className="mt-px size-4 shrink-0 text-danger" />
            <p className="text-[12.5px] leading-relaxed text-danger">
              <strong>
                {overdue.length} request{overdue.length === 1 ? " is" : "s are"} past the
                one-month deadline.
              </strong>{" "}
              Missing it is itself a breach. Respond, even if only to explain the delay.
            </p>
          </div>
        ) : null}

        {creating ? (
          <NewRequest
            onCreated={() => {
              setCreating(false);
              load();
            }}
          />
        ) : null}

        {requests === null ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : requests.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck />}
            title="No requests"
            description="When a client asks for their data or asks to be deleted, log it here so the clock and the evidence are in one place."
          />
        ) : (
          <>
            {open.length > 0 ? (
              <div className="space-y-3">
                <h2 className="text-[13px] font-semibold tracking-tight">Open</h2>
                {open.map((request) => (
                  <RequestCard key={request.id} request={request} onChanged={load} />
                ))}
              </div>
            ) : null}

            {closed.length > 0 ? (
              <div className="space-y-3">
                <h2 className="text-[13px] font-semibold tracking-tight">Closed</h2>
                {closed.map((request) => (
                  <RequestCard key={request.id} request={request} onChanged={load} />
                ))}
              </div>
            ) : null}
          </>
        )}

        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          Erasure removes the client record, their events, messages, journey progress,
          experiment ledger entries, journey history and reminder history. A salted hash of
          the email is kept so they are not silently re-added later — that is permitted, and
          holds nothing readable.
        </p>
      </PageBody>
    </>
  );
}

/* -------------------------------------------------------------------------- */

function NewRequest({ onCreated }: { onCreated: () => void }) {
  const [kind, setKind] = React.useState<RequestKind>("access");
  const [email, setEmail] = React.useState("");
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = () => {
    setBusy(true);
    void fetch("/api/privacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "log", kind, email, name }),
    })
      .then((response) => response.json())
      .then((result: { ok: boolean; error?: string; request?: DataSubjectRequest }) => {
        if (!result.ok) {
          toast.error("Could not log it", { description: result.error });
          return;
        }
        toast.success("Request logged", {
          description: result.request?.profileId
            ? "Matched to a client. Verify their identity next."
            : "No client matches that email — they may not be in the system.",
        });
        onCreated();
      })
      .finally(() => setBusy(false));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Log a request</CardTitle>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Log it the day it arrives — the deadline runs from receipt, not from when you start.
        </p>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="space-y-1.5">
          <Label>What are they asking for?</Label>
          <Select value={kind} onValueChange={(value) => setKind(value as RequestKind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(REQUEST_KIND_LABEL) as RequestKind[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {REQUEST_KIND_LABEL[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11.5px] leading-relaxed text-muted-foreground">
            {REQUEST_KIND_OBLIGATION[kind]}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dsr-email">Their email</Label>
            <Input
              id="dsr-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dsr-name">Their name (optional)</Label>
            <Input
              id="dsr-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
        </div>

        <Button disabled={busy || !email.includes("@")} onClick={submit}>
          <Plus /> Log it
        </Button>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */

function RequestCard({
  request,
  onChanged,
}: {
  request: DataSubjectRequest;
  onChanged: () => void;
}) {
  const [counts, setCounts] = React.useState<ErasureCounts | null>(null);
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const overdue = isOverdue(request);

  const call = (body: Record<string, unknown>) => {
    setBusy(true);
    return fetch("/api/privacy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, id: request.id }),
    })
      .then((response) => response.json())
      .finally(() => setBusy(false));
  };

  const preview = () =>
    void call({ action: "preview" }).then(
      (result: { ok: boolean; counts: ErasureCounts | null }) => {
        setCounts(result.counts);
        if (!result.counts) toast.info("No client matches that email.");
      },
    );

  const exportData = () =>
    void call({ action: "export" }).then(
      (result: { ok: boolean; error?: string; data?: unknown }) => {
        if (!result.ok) {
          toast.error("Cannot export", { description: result.error });
          return;
        }
        const blob = new Blob([JSON.stringify(result.data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `personal-data-${request.subjectEmail}.json`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success("Export downloaded", { description: "Send this to them securely." });
        onChanged();
      },
    );

  const erase = () =>
    void call({ action: "erase", confirm }).then(
      (result: { ok: boolean; error?: string; verified?: boolean; remaining?: ErasureCounts }) => {
        if (!result.ok) {
          toast.error("Erasure did not run", { description: result.error });
          return;
        }
        if (result.verified) {
          toast.success("Erased and verified", {
            description: "Nothing remains in any store. You can tell them it is done.",
          });
        } else {
          toast.error("Erasure incomplete", {
            description: "Some records remain. Do not confirm to the client yet.",
          });
        }
        setConfirm("");
        setCounts(null);
        onChanged();
      },
    );

  return (
    <Card className={cn(overdue && "border-danger/40")}>
      <CardContent className="space-y-3 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13.5px] font-semibold">
            {request.subjectName || request.subjectEmail}
          </span>
          <Badge tone={REQUEST_STATUS_TONE[request.status]}>
            {REQUEST_STATUS_LABEL[request.status]}
          </Badge>
          <Badge tone="outline">{REQUEST_KIND_LABEL[request.kind].split(" — ")[0]}</Badge>
          {request.identityVerified ? (
            <Badge tone="positive">
              <UserCheck /> Identity verified
            </Badge>
          ) : (
            <Badge tone="warning">Identity not verified</Badge>
          )}
          <span
            className={cn(
              "ml-auto text-[11.5px]",
              overdue ? "font-medium text-danger" : "text-subtle-foreground",
            )}
          >
            {describeDeadline(request)}
          </span>
        </div>

        <p className="text-[12px] text-muted-foreground">
          <Mono className="text-[11px]">{request.subjectEmail}</Mono> · received{" "}
          {formatDateTime(request.receivedAt)} · due {formatDateTime(request.dueBy)}
          {request.profileId ? null : " · no matching client"}
        </p>

        {isOpen(request) ? (
          <>
            <Separator />

            {!request.identityVerified ? (
              <div className="space-y-2 rounded-lg bg-warning-soft px-3.5 py-3">
                <p className="text-[12.5px] font-medium text-warning">
                  Check who you are talking to first
                </p>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  Anyone can send an email claiming to be someone. Confirm it really is them —
                  reply to the address on their booking, or ask something only they would know.
                  Handing over or deleting the wrong person&apos;s record is itself a breach.
                </p>
                <Button
                  size="xs"
                  disabled={busy}
                  onClick={() => void call({ action: "verify", verified: true }).then(onChanged)}
                >
                  <UserCheck /> I have verified their identity
                </Button>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" disabled={busy} onClick={preview}>
                What is held?
              </Button>

              {(request.kind === "access" || request.kind === "portability") && (
                <Button
                  size="sm"
                  disabled={busy || !request.identityVerified}
                  onClick={exportData}
                >
                  <Download /> Download their data
                </Button>
              )}

              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  void call({ action: "update", status: "completed" as RequestStatus }).then(
                    onChanged,
                  )
                }
              >
                Mark done
              </Button>
            </div>

            {counts ? (
              <div className="space-y-2 rounded-lg border border-border px-3.5 py-3">
                <p className="text-[12px] font-medium">
                  {totalRecords(counts)} record{totalRecords(counts) === 1 ? "" : "s"} held
                </p>
                <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                  {(Object.keys(STORE_LABELS) as (keyof ErasureCounts)[]).map((key) => (
                    <div key={key} className="flex justify-between text-[11.5px]">
                      <span className="text-muted-foreground">{STORE_LABELS[key]}</span>
                      <span className="tnum">{counts[key]}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {request.kind === "erasure" && request.identityVerified && request.profileId ? (
              <div className="space-y-2 rounded-lg border border-danger/30 bg-danger-soft px-3.5 py-3">
                <p className="text-[12.5px] font-medium text-danger">
                  Permanently delete everything
                </p>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  This cannot be undone. Type{" "}
                  <Mono className="text-[11px]">{request.subjectEmail}</Mono> to confirm.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Input
                    value={confirm}
                    placeholder={request.subjectEmail}
                    className="h-8 max-w-xs"
                    onChange={(event) => setConfirm(event.target.value)}
                  />
                  <Button
                    size="sm"
                    disabled={busy || confirm !== request.subjectEmail}
                    onClick={erase}
                  >
                    <Trash2 /> Erase permanently
                  </Button>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {request.receipt ? (
          <div className="rounded-md bg-surface-muted px-3 py-2 text-[11.5px] text-muted-foreground">
            {request.receipt.kind === "erasure" ? (
              <>
                Erased {totalRecords(request.receipt.removed)} record(s) on{" "}
                {formatDateTime(request.receipt.at)}. A salted hash of the email was kept so
                they are not re-added.
              </>
            ) : (
              <>
                Exported {request.receipt.records} record(s) on{" "}
                {formatDateTime(request.receipt.at)}.
              </>
            )}
          </div>
        ) : null}

        {request.notes ? (
          <p className="whitespace-pre-wrap text-[11.5px] text-muted-foreground">
            {request.notes}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

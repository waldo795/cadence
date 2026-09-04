"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Copy,
  GitBranch,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { createNode, type JourneyDefinition } from "@/domain/journey";
import { formatRelative } from "@/domain/time";
import { journeyRepository } from "@/services/local-store";
import { useJourneyActivity, useJourneys } from "@/hooks/use-data";
import { PageBody, PageHeader } from "@/components/shell/page-header";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { EmptyState, Mono, Skeleton } from "@/components/ui/misc";

export default function JourneysPage() {
  const router = useRouter();
  const { journeys, loading, reload } = useJourneys();
  const activeCounts = useJourneyActivity(journeys);
  const [query, setQuery] = React.useState("");
  const [pendingDelete, setPendingDelete] = React.useState<JourneyDefinition | null>(null);

  const filtered = journeys.filter((journey) => {
    const term = query.trim().toLowerCase();
    if (!term) return true;
    return [journey.name, journey.trigger.name, ...journey.tags]
      .join(" ")
      .toLowerCase()
      .includes(term);
  });

  const createJourney = async () => {
    const now = new Date().toISOString();
    const trigger = createNode("event_trigger", { x: 400, y: 80 });
    const exit = createNode("exit", { x: 400, y: 340 });

    const journey: JourneyDefinition = {
      id: `journey_${Math.random().toString(36).slice(2, 9)}`,
      key: `untitled-journey-${Math.random().toString(36).slice(2, 6)}`,
      name: "Untitled journey",
      description: "",
      version: 1,
      status: "draft",
      tags: [],
      trigger: { type: "event", name: "custom.event" },
      nodes: [trigger, exit],
      edges: [],
      createdAt: now,
      updatedAt: now,
    };

    await journeyRepository.save(journey);
    router.push(`/journeys/${journey.id}`);
  };

  const duplicate = async (id: string) => {
    const copy = await journeyRepository.duplicate(id);
    if (copy) {
      reload();
      toast.success("Journey duplicated", { description: copy.name });
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    await journeyRepository.remove(pendingDelete.id);
    setPendingDelete(null);
    reload();
    toast.success("Journey deleted");
  };

  return (
    <>
      <PageHeader
        title="Journeys"
        description="Every journey is a portable definition. The canvas is just one way to edit it."
        actions={
          <Button size="sm" onClick={() => void createJourney()}>
            <Plus /> Create journey
          </Button>
        }
      />

      <PageBody className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-subtle-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, trigger or tag"
            className="pl-9"
          />
        </div>

        {loading ? (
          <div className="space-y-3">
            {[0, 1].map((index) => (
              <Skeleton key={index} className="h-[104px] w-full rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={<GitBranch />}
            title={query ? "No journeys match your search" : "No journeys yet"}
            description={
              query
                ? "Try a different name, trigger or tag."
                : "Create your first journey to start orchestrating customer experiences."
            }
            action={
              query ? null : (
                <Button size="sm" onClick={() => void createJourney()}>
                  <Plus /> Create journey
                </Button>
              )
            }
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((journey) => (
              <JourneyRow
                key={journey.id}
                journey={journey}
                activeProfiles={activeCounts[journey.id] ?? 0}
                onDuplicate={() => void duplicate(journey.id)}
                onDelete={() => setPendingDelete(journey)}
              />
            ))}
          </div>
        )}
      </PageBody>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete “{pendingDelete?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the journey definition from local storage. Profiles currently in the
              journey would stop being evaluated. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmDelete()}>
              Delete journey
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function JourneyRow({
  journey,
  activeProfiles,
  onDuplicate,
  onDelete,
}: {
  journey: JourneyDefinition;
  activeProfiles: number;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const actionCount = journey.nodes.filter((node) =>
    ["send_email", "send_push", "webhook", "update_profile"].includes(node.kind),
  ).length;

  return (
    <div className="group relative rounded-xl border border-border bg-surface transition-colors hover:border-border-strong">
      <Link href={`/journeys/${journey.id}`} className="block px-5 py-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-[14px] font-semibold tracking-tight">{journey.name}</h2>
              <Badge tone={journey.status === "published" ? "positive" : "neutral"}>
                {journey.status === "published" ? "Published" : "Draft"}
              </Badge>
              <Badge tone="outline">v{journey.version}</Badge>
              {journey.tags.map((tag) => (
                <Badge key={tag} tone="accent">
                  {tag}
                </Badge>
              ))}
            </div>

            {journey.description ? (
              <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                {journey.description}
              </p>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                Trigger <Mono>{journey.trigger.name}</Mono>
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="size-3.5 text-subtle-foreground" />
                <span className="tnum">{activeProfiles.toLocaleString()}</span> active
              </span>
              <span className="flex items-center gap-1.5">
                <GitBranch className="size-3.5 text-subtle-foreground" />
                <span className="tnum">{journey.nodes.length}</span> nodes ·{" "}
                <span className="tnum">{actionCount}</span> actions
              </span>
              <span>Updated {formatRelative(journey.updatedAt)}</span>
            </div>
          </div>
        </div>
      </Link>

      <div className="absolute right-4 top-4 flex items-center gap-1.5">
        <Button variant="secondary" size="sm" asChild>
          <Link href={`/journeys/${journey.id}`}>Open</Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Journey actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onDuplicate}>
              <Copy /> Duplicate
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="danger" onSelect={onDelete}>
              <Trash2 /> Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

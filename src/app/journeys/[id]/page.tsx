"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { GitBranch, Loader2 } from "lucide-react";
import { useJourney } from "@/hooks/use-data";
import { JourneyBuilder } from "@/components/journey/journey-builder";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";

export default function JourneyBuilderPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === "string" ? params.id : "";
  const { journey, loading } = useJourney(id);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        <span className="text-[13px]">Loading journey…</span>
      </div>
    );
  }

  if (!journey) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <EmptyState
          className="max-w-md"
          icon={<GitBranch />}
          title="Journey not found"
          description="It may have been deleted, or this link points at a journey that was never saved locally."
          action={
            <Button size="sm" asChild>
              <Link href="/journeys">Back to journeys</Link>
            </Button>
          }
        />
      </div>
    );
  }

  // Keyed so switching journeys remounts the builder with clean local state.
  return <JourneyBuilder key={journey.id} initialJourney={journey} />;
}

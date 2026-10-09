"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { describeCap } from "@/domain/governance";
import { getContactPolicy } from "@/services/governance";
import { resetDemoData } from "@/services/local-store";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Separator } from "@/components/ui/misc";

export default function SettingsPage() {
  const router = useRouter();
  const policy = React.useMemo(() => getContactPolicy(), []);

  const reset = async () => {
    // Await the round trip: navigating first would render the next page against
    // a cache the reset is still rebuilding.
    await resetDemoData();
    toast.success("Demo data reset", { description: "Clients, journeys and triggers restored." });
    router.push("/journeys");
  };

  return (
    <>
      <PageHeader
        title="Settings"
        description="Workspace configuration. Governance policy, team management and API keys arrive with the hosted product."
        actions={<Badge tone="outline">Preview</Badge>}
      />

      <PageBody className="grid max-w-3xl gap-5">
        <Card>
          <CardHeader>
            <CardTitle>Messaging policy</CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Applied by the policy evaluator during every simulated send.
            </p>
          </CardHeader>
          <CardContent className="space-y-3.5 pt-0">
            <Field label="Workspace contact ceiling">
              {describeCap(policy.ceilingMaxMessages, policy.ceilingWindowDays)} · reduced per
              profile by {policy.rules.filter((rule) => rule.enabled).length} active rules
            </Field>
            <Separator />
            <Field label="Consent model">
              Global suppression, then per-channel consent, then device availability
            </Field>
            <Separator />
            <Field label="Quiet hours">
              <span className="text-muted-foreground">Not configured in this preview</span>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Storage</CardTitle>
            <p className="text-[12px] text-muted-foreground">
              Everything is stored in Postgres, not in the browser — so the data survives
              clearing site data and is reachable by an API. Locally that is PGlite in{" "}
              <code>data/pg</code>; set <code>DATABASE_URL</code> to point at a hosted server.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft px-3.5 py-3">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-medium text-foreground">Reset demo data</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                  Wipes the database and restores the seeded clients, journeys and triggers.
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="secondary" size="sm" className="shrink-0">
                    <RotateCcw /> Reset
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Reset all demo data?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Every client, journey and trigger in the database will be permanently deleted
                      and the original seed restored. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => void reset()}>Reset everything</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Data notice</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              Every customer, event, message and metric in this application is fictional and
              generated for demonstration. No real personal data is present, and no email, push or
              SMS message is ever delivered.
            </p>
          </CardContent>
        </Card>
      </PageBody>
    </>
  );
}

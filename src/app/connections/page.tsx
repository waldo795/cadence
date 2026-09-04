"use client";

import * as React from "react";
import { Database, Mail, Smartphone, Warehouse, Webhook } from "lucide-react";
import { PageBody, PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type ConnectionStatus = "not_connected" | "available_soon";

interface Connection {
  category: string;
  name: string;
  description: string;
  status: ConnectionStatus;
  icon: React.ReactNode;
}

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  not_connected: "Not connected",
  available_soon: "Available soon",
};

const CONNECTIONS: Connection[] = [
  {
    category: "Email",
    name: "Amazon SES",
    description: "Deliver transactional and marketing email through your own SES account.",
    status: "not_connected",
    icon: <Mail />,
  },
  {
    category: "Push",
    name: "Firebase Cloud Messaging",
    description: "Send push notifications to iOS and Android devices.",
    status: "not_connected",
    icon: <Smartphone />,
  },
  {
    category: "Data",
    name: "Webhook / Events API",
    description: "Stream customer events into Cadence, or forward decisions to your own services.",
    status: "available_soon",
    icon: <Webhook />,
  },
  {
    category: "Warehouse",
    name: "Snowflake",
    description: "Sync profile attributes and audiences directly from your warehouse.",
    status: "available_soon",
    icon: <Warehouse />,
  },
  {
    category: "Warehouse",
    name: "Databricks",
    description: "Read model outputs and computed traits into journey decisioning.",
    status: "available_soon",
    icon: <Database />,
  },
];

export default function ConnectionsPage() {
  return (
    <>
      <PageHeader
        title="Connections"
        description="Channel and data providers plug in behind stable interfaces, so journeys never depend on a specific vendor."
      />

      <PageBody className="space-y-4">
        <div className="rounded-xl border border-dashed border-border bg-surface-muted px-4 py-3">
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            No integrations are implemented in this proof of concept. Every action a journey takes
            is simulated locally and recorded in the run timeline.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {CONNECTIONS.map((connection) => (
            <Card key={connection.name}>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface-muted text-muted-foreground [&_svg]:size-4">
                    {connection.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-wider text-subtle-foreground">
                      {connection.category}
                    </p>
                    <p className="text-[13.5px] font-semibold tracking-tight">{connection.name}</p>
                  </div>
                  <Badge tone={connection.status === "not_connected" ? "neutral" : "outline"}>
                    {STATUS_LABEL[connection.status]}
                  </Badge>
                </div>

                <p className="text-[12.5px] leading-relaxed text-muted-foreground">
                  {connection.description}
                </p>

                <Button variant="secondary" size="sm" disabled className="w-full">
                  {connection.status === "not_connected" ? "Connect" : "Join the waitlist"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </PageBody>
    </>
  );
}

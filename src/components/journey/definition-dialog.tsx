"use client";

import * as React from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Download,
  FileJson,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import type { JourneyDefinition } from "@/domain/journey";
import { parseJourneyDefinition } from "@/domain/validation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface DefinitionDialogProps {
  journey: JourneyDefinition;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (journey: JourneyDefinition) => void;
}

export function DefinitionDialog({
  journey,
  open,
  onOpenChange,
  onImport,
}: DefinitionDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Radix unmounts the content when closed, so the body's local state
          (tab, pasted JSON, validation errors) resets on its own. */}
      <DefinitionDialogBody
        journey={journey}
        onOpenChange={onOpenChange}
        onImport={onImport}
      />
    </Dialog>
  );
}

function DefinitionDialogBody({
  journey,
  onOpenChange,
  onImport,
}: Omit<DefinitionDialogProps, "open">) {
  const [tab, setTab] = React.useState("definition");
  const [importText, setImportText] = React.useState("");
  const [errors, setErrors] = React.useState<string[]>([]);
  const [copied, setCopied] = React.useState(false);

  const json = React.useMemo(() => JSON.stringify(journey, null, 2), [journey]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast.success("Definition copied to clipboard");
    } catch {
      toast.error("Could not access the clipboard");
    }
  };

  const download = () => {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${journey.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Journey exported");
  };

  const handleFile = async (file: File) => {
    const text = await file.text();
    setImportText(text);
    setErrors([]);
  };

  // Imported definitions are parsed and validated before they are allowed to
  // replace the working journey — a bad file must never break the canvas.
  const runImport = () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(importText);
    } catch (error) {
      setErrors([
        `Invalid JSON: ${error instanceof Error ? error.message : "could not parse"}`,
      ]);
      return;
    }

    const result = parseJourneyDefinition(parsed);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    // The journey keeps its current identity so the import lands as a new
    // version of what is open rather than orphaning the URL.
    onImport({
      ...result.journey,
      id: journey.id,
      version: journey.version + 1,
    });
    onOpenChange(false);
    toast.success("Journey definition imported", {
      description: `${result.journey.nodes.length} nodes and ${result.journey.edges.length} connections loaded.`,
    });
  };

  return (
    <DialogContent className="max-w-3xl">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <FileJson className="size-4 text-accent" />
          Journey definition
        </DialogTitle>
        <DialogDescription>
          The canvas is a visual editor over this document. Everything needed to
          version, validate, simulate or deploy the journey lives here.
        </DialogDescription>
      </DialogHeader>

      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="px-5 pt-3">
          <TabsTrigger value="definition">Definition</TabsTrigger>
          <TabsTrigger value="import">Import</TabsTrigger>
        </TabsList>

        <TabsContent
          value="definition"
          className="min-h-0 flex-1 overflow-hidden"
        >
          <pre className="scroll-slim max-h-[52vh] overflow-auto bg-surface-muted px-5 py-4 font-mono text-[11.5px] leading-[1.65] text-foreground">
            {json}
          </pre>
        </TabsContent>

        <TabsContent
          value="import"
          className="min-h-0 flex-1 space-y-3 px-5 py-4"
        >
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" asChild>
              <label className="cursor-pointer">
                <Upload /> Choose file
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFile(file);
                  }}
                />
              </label>
            </Button>
            <span className="text-[12px] text-muted-foreground">
              or paste a definition below
            </span>
          </div>

          <Textarea
            value={importText}
            onChange={(event) => {
              setImportText(event.target.value);
              setErrors([]);
            }}
            rows={12}
            placeholder='{ "name": "My journey", "trigger": { ... }, "nodes": [ ... ], "edges": [ ... ] }'
            className="scroll-slim max-h-[36vh] font-mono text-[11.5px]"
          />

          {errors.length > 0 ? (
            <div className="space-y-1.5 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-[12px] font-semibold text-danger">
                <AlertTriangle className="size-3.5" />
                {errors.length} problem{errors.length === 1 ? "" : "s"} found —
                nothing was imported
              </p>
              <ul className="ml-5 list-disc space-y-0.5 text-[11.5px] leading-relaxed text-danger">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      <DialogFooter>
        {tab === "definition" ? (
          <>
            <Button variant="secondary" size="sm" onClick={download}>
              <Download /> Export JSON
            </Button>
            <Button size="sm" onClick={copy}>
              {copied ? <Check /> : <Copy />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            onClick={runImport}
            disabled={importText.trim() === ""}
          >
            Validate and import
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

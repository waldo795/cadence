"use client";

import * as React from "react";
import { BookmarkPlus, LayoutTemplate } from "lucide-react";
import { toast } from "sonner";
import type { EmailBlock } from "@/domain/email-content";
import { createTemplate, summarise, type EmailTemplate } from "@/domain/email-template";
import { listTemplates, saveTemplate } from "@/services/email-templates";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Moving an email between a journey and the template library.
 *
 * Both directions copy rather than link. A template that stayed bound to the
 * journeys using it would mean editing the welcome email silently rewrote the
 * night-before one, which is a surprise nobody wants to discover by sending.
 */
export function TemplateActions({
  journeyName,
  subject,
  preheader,
  blocks,
  onApply,
}: {
  journeyName: string;
  subject: string;
  preheader: string;
  blocks: EmailBlock[];
  onApply: (template: EmailTemplate) => void;
}) {
  const [saving, setSaving] = React.useState(false);
  const [name, setName] = React.useState("");
  const [picking, setPicking] = React.useState(false);
  const [pending, setPending] = React.useState<EmailTemplate | null>(null);

  const templates = picking ? listTemplates() : [];

  const commit = () => {
    const template = createTemplate({
      name: name.trim() || `${journeyName} email`,
      subject,
      preheader,
      // Deep-copied via the structured clone, so later edits in the journey
      // cannot reach back into the saved template.
      blocks: structuredClone(blocks),
      originJourney: journeyName,
    });
    saveTemplate(template);
    setSaving(false);
    setName("");
    toast.success("Saved as a template", {
      description: `"${template.name}" is now available to every journey.`,
    });
  };

  return (
    <>
      <Popover open={picking} onOpenChange={setPicking}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm">
            <LayoutTemplate /> Templates
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="border-b border-border px-3 py-2">
            <p className="text-[12px] font-medium">Start from a template</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Replaces everything on the canvas with a copy.
            </p>
          </div>
          <div className="scroll-slim max-h-[280px] overflow-y-auto p-1.5">
            {templates.length === 0 ? (
              <p className="px-2 py-3 text-[12px] text-muted-foreground">
                No templates yet. Save this email as one, or build them under Templates.
              </p>
            ) : (
              templates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    setPending(template);
                    setPicking(false);
                  }}
                  className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-muted"
                >
                  <span className="block truncate text-[12px] font-medium">{template.name}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {summarise(template)}
                  </span>
                </button>
              ))
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Button variant="ghost" size="sm" onClick={() => setSaving(true)}>
        <BookmarkPlus /> Save as template
      </Button>

      <AlertDialog open={saving} onOpenChange={setSaving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save as a template</AlertDialogTitle>
            <AlertDialogDescription>
              A copy of this email, available to every journey. Later changes here will not
              affect it, and changes to it will not affect this journey.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="template-name" className="text-[11px]">
              Name
            </Label>
            <Input
              id="template-name"
              value={name}
              placeholder={`${journeyName} email`}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={commit}>Save template</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Use &ldquo;{pending?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              This replaces everything currently on the canvas, including the subject line.
              Cancel out of the designer afterwards if you change your mind — nothing is saved to
              the journey until you press Done.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) onApply({ ...pending, blocks: structuredClone(pending.blocks) });
                setPending(null);
              }}
            >
              Use template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

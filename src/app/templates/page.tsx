"use client";

import * as React from "react";
import { Copy, LayoutTemplate, MoreHorizontal, Plus, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { blocksFor } from "@/domain/email-content";
import {
  blockCounts,
  createTemplate,
  summarise,
  type EmailTemplate,
} from "@/domain/email-template";
import type { SendEmailConfig } from "@/domain/journey";
import { formatRelative } from "@/domain/time";
import { listTemplates, removeTemplate, saveTemplate } from "@/services/email-templates";
import { STARTER_EMAIL_TEMPLATES } from "@/seed/email-templates";
import { EmailDesigner } from "@/components/journey/email-designer";
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
import { EmptyState } from "@/components/ui/misc";

/**
 * Emails built outside any journey.
 *
 * The same designer is used here with no journey behind it, so a template is
 * built exactly the way the real thing is — rather than in a cut-down editor
 * whose output turns out to look different once it is in a journey.
 */
export default function TemplatesPage() {
  /*
   * The counter only forces a re-render; the list is read fresh each time.
   * Templates live in the hydrated document cache rather than in React state,
   * so there is nothing for a memo to key on.
   */
  const [, setVersion] = React.useState(0);
  const templates = listTemplates();

  const [editing, setEditing] = React.useState<EmailTemplate | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<EmailTemplate | null>(null);
  const [renaming, setRenaming] = React.useState<EmailTemplate | null>(null);
  const [name, setName] = React.useState("");

  const refresh = () => setVersion((value) => value + 1);

  const create = () => {
    const template = createTemplate({ name: "New template" });
    saveTemplate(template);
    refresh();
    setEditing(template);
  };

  /**
   * Installs the starter set, skipping any already present.
   *
   * Skipping rather than replacing: the ids are fixed, so a second press
   * would otherwise quietly overwrite whatever had been edited since the
   * first one.
   */
  const installStarters = () => {
    const existing = new Set(listTemplates().map((item) => item.id));
    const missing = STARTER_EMAIL_TEMPLATES.filter((item) => !existing.has(item.id));

    if (missing.length === 0) {
      toast.info("Already added", {
        description: "Every starter template is here. Delete one to get it back.",
      });
      return;
    }

    for (const item of missing) {
      saveTemplate({ ...item, blocks: structuredClone(item.blocks) });
    }
    refresh();
    toast.success(`Added ${missing.length} starter template${missing.length === 1 ? "" : "s"}`, {
      description: "Written for a bridal makeup business — edit them to suit.",
    });
  };

  const duplicate = (template: EmailTemplate) => {
    /*
     * The id is dropped rather than overridden. Passing `id: undefined`
     * through the spread would win over the generated one and leave the copy
     * with no id at all.
     */
    const copy = { ...template } as Partial<EmailTemplate>;
    delete copy.id;
    delete copy.createdAt;
    delete copy.updatedAt;

    saveTemplate(
      createTemplate({
        ...copy,
        name: `${template.name} copy`,
        blocks: structuredClone(template.blocks),
      }),
    );
    refresh();
    toast.success("Template duplicated");
  };

  return (
    <>
      <PageHeader
        title="Templates"
        description="Emails built once and reused. A journey takes a copy, so editing a template never changes an email already in a journey."
        actions={
          <div className="flex items-center gap-1.5">
            <Button variant="secondary" size="sm" onClick={installStarters}>
              <Sparkles /> Add starter set
            </Button>
            <Button size="sm" onClick={create}>
              <Plus /> New template
            </Button>
          </div>
        }
      />

      <PageBody>
        {templates.length === 0 ? (
          <EmptyState
            icon={<LayoutTemplate />}
            title="No templates yet"
            description="Start from the set written for a bridal makeup business, build one here, or save an email you have already designed from inside a journey."
            action={
              <div className="flex items-center justify-center gap-1.5">
                <Button size="sm" onClick={installStarters}>
                  <Sparkles /> Add starter set
                </Button>
                <Button variant="secondary" size="sm" onClick={create}>
                  <Plus /> New template
                </Button>
              </div>
            }
          />
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className="group relative rounded-xl border border-border bg-surface transition-colors hover:border-border-strong"
              >
                <button
                  type="button"
                  onClick={() => setEditing(template)}
                  className="block w-full px-5 py-4 text-left"
                >
                  <div className="flex flex-wrap items-center gap-2 pr-24">
                    <h2 className="text-[14px] font-semibold tracking-tight">{template.name}</h2>
                    {template.originJourney ? (
                      <Badge tone="outline">from {template.originJourney}</Badge>
                    ) : null}
                  </div>

                  {template.subject ? (
                    <p className="mt-1 text-[12.5px] text-muted-foreground">
                      Subject: {template.subject}
                    </p>
                  ) : null}

                  <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">
                    {summarise(template)}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12px] text-muted-foreground">
                    <span>{blockCounts(template)}</span>
                    <span>Updated {formatRelative(template.updatedAt)}</span>
                  </div>
                </button>

                <div className="absolute right-4 top-4 flex items-center gap-1.5">
                  <Button variant="secondary" size="sm" onClick={() => setEditing(template)}>
                    Open
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-sm" aria-label="Template actions">
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onSelect={() => {
                          setRenaming(template);
                          setName(template.name);
                        }}
                      >
                        Rename
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => duplicate(template)}>
                        <Copy /> Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="danger"
                        onSelect={() => setPendingDelete(template)}
                      >
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageBody>

      {editing ? (
        <EmailDesigner
          key={editing.id}
          title={editing.name}
          config={
            {
              template: editing.name,
              senderName: "",
              messageKey: editing.id,
              subject: editing.subject,
              preheader: editing.preheader,
              body: "",
              blocks: blocksFor({ body: "", blocks: editing.blocks }),
            } satisfies SendEmailConfig
          }
          onSave={(next) => {
            saveTemplate({
              ...editing,
              subject: next.subject ?? editing.subject,
              preheader: next.preheader ?? editing.preheader,
              blocks: next.blocks ?? editing.blocks,
            });
            refresh();
            toast.success("Template saved");
          }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      <AlertDialog open={renaming !== null} onOpenChange={(open) => !open && setRenaming(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rename template</AlertDialogTitle>
          </AlertDialogHeader>
          <Input value={name} onChange={(event) => setName(event.target.value)} />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (renaming && name.trim()) {
                  saveTemplate({ ...renaming, name: name.trim() });
                  refresh();
                }
                setRenaming(null);
              }}
            >
              Rename
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &ldquo;{pendingDelete?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Journeys that started from this template keep their own copy and are unaffected.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingDelete) removeTemplate(pendingDelete.id);
                setPendingDelete(null);
                refresh();
              }}
            >
              Delete template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

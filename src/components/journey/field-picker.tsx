"use client";

import * as React from "react";
import { Braces, Search, TriangleAlert } from "lucide-react";
import { isPatchy, type FieldGroup, type MergeField } from "@/domain/field-catalogue";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * Inserting personalisation without typing `{{profile.weddingVenue}}` from
 * memory.
 *
 * The catalogue is built from real data, so this is also the only honest
 * answer to "what can I put in here?" — and it shows a real value beside each
 * field, because the name alone does not tell you whether `readyByTime` holds
 * "07:30" or "Undecided".
 */

const CatalogueContext = React.createContext<FieldGroup[]>([]);

export function FieldCatalogueProvider({
  groups,
  children,
}: {
  groups: FieldGroup[];
  children: React.ReactNode;
}) {
  return <CatalogueContext.Provider value={groups}>{children}</CatalogueContext.Provider>;
}

/* -------------------------------------------------------------------------- */
/* Insertion                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Inserts at the caret, or appends when the field has not been focused.
 *
 * Tracking the last caret position rather than reading it on click: opening
 * the popover moves focus out of the input, and by the time anything is
 * chosen the selection is gone.
 */
function useCaret<T extends HTMLInputElement | HTMLTextAreaElement>() {
  const ref = React.useRef<T>(null);
  const caret = React.useRef<number | null>(null);

  const remember = () => {
    caret.current = ref.current?.selectionStart ?? null;
  };

  const insert = (value: string, token: string, commit: (next: string) => void) => {
    const at = caret.current ?? value.length;
    const next = `${value.slice(0, at)}${token}${value.slice(at)}`;
    commit(next);

    // Put the caret after what was just inserted, so you can keep typing.
    requestAnimationFrame(() => {
      const element = ref.current;
      if (!element) return;
      element.focus();
      const position = at + token.length;
      element.setSelectionRange(position, position);
      caret.current = position;
    });
  };

  return { ref, remember, insert };
}

function FieldMenu({ onPick }: { onPick: (path: string) => void }) {
  const groups = React.useContext(CatalogueContext);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);

  const term = query.trim().toLowerCase();
  const filtered = groups
    .map((group) => ({
      ...group,
      fields: term
        ? group.fields.filter(
            (field) =>
              field.label.toLowerCase().includes(term) ||
              field.path.toLowerCase().includes(term),
          )
        : group.fields,
    }))
    .filter((group) => group.fields.length > 0);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Insert a personalisation field"
          className="flex size-6 shrink-0 items-center justify-center rounded-md border border-border text-subtle-foreground transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          <Braces className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="size-3.5 shrink-0 text-subtle-foreground" />
          <input
            autoFocus
            value={query}
            placeholder="Search fields"
            onChange={(event) => setQuery(event.target.value)}
            className="w-full bg-transparent text-[12px] outline-none placeholder:text-subtle-foreground"
          />
        </div>

        <div className="scroll-slim max-h-[320px] overflow-y-auto p-1.5">
          {filtered.length === 0 ? (
            <p className="px-2 py-3 text-[12px] text-muted-foreground">Nothing matches.</p>
          ) : (
            filtered.map((group) => (
              <div key={group.id} className="mb-1.5">
                <p className="px-2 pb-1 pt-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-subtle-foreground">
                  {group.label}
                </p>
                {group.fields.map((field) => (
                  <FieldRow
                    key={field.path}
                    field={field}
                    onPick={() => {
                      onPick(field.path);
                      setOpen(false);
                      setQuery("");
                    }}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function FieldRow({ field, onPick }: { field: MergeField; onPick: () => void }) {
  const patchy = isPatchy(field);

  return (
    <button
      type="button"
      onClick={onPick}
      className="flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-muted"
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-[12px] font-medium">{field.label}</span>
          {patchy ? (
            <TriangleAlert
              className="size-3 shrink-0 text-warning"
              aria-label="Missing for some clients"
            />
          ) : null}
        </span>
        <span className="block truncate font-mono text-[10.5px] text-subtle-foreground">
          {field.path}
        </span>
        {field.sample ? (
          <span className="block truncate text-[11px] text-muted-foreground">
            e.g. {field.sample}
          </span>
        ) : null}
      </span>
      {field.coverage && patchy ? (
        <span className="shrink-0 pt-0.5 text-[10.5px] text-warning">
          {field.coverage.present}/{field.coverage.total}
        </span>
      ) : null}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

export function FieldInput({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const { ref, remember, insert } = useCaret<HTMLInputElement>();
  const id = React.useId();

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[11px]">
        {label}
      </Label>
      <div className="flex items-center gap-1.5">
        <Input
          id={id}
          ref={ref}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          onSelect={remember}
          onBlur={remember}
        />
        <FieldMenu onPick={(path) => insert(value, `{{${path}}}`, onChange)} />
      </div>
    </div>
  );
}

export function FieldTextarea({
  label,
  value,
  rows = 6,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  rows?: number;
  placeholder?: string;
  onChange: (value: string) => void;
}) {
  const { ref, remember, insert } = useCaret<HTMLTextAreaElement>();
  const id = React.useId();

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label htmlFor={id} className="text-[11px]">
          {label}
        </Label>
        <FieldMenu onPick={(path) => insert(value, `{{${path}}}`, onChange)} />
      </div>
      <textarea
        id={id}
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        onSelect={remember}
        onBlur={remember}
        className={cn(
          "scroll-slim w-full resize-y rounded-md border border-border bg-surface px-2.5 py-2",
          "text-[13px] leading-relaxed outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        )}
      />
    </div>
  );
}

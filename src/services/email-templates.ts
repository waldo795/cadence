import type { EmailTemplate } from "@/domain/email-template";
import { DOCUMENT_KEYS, readDoc, writeDoc } from "./storage";

/**
 * Templates live in a document rather than a table: one writer, edited by
 * hand, read whole every time. The same reasoning as journeys.
 */

export function listTemplates(): EmailTemplate[] {
  const stored = readDoc<EmailTemplate[]>(DOCUMENT_KEYS.emailTemplates) ?? [];
  return [...stored].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );
}

export function getTemplate(id: string): EmailTemplate | null {
  return listTemplates().find((template) => template.id === id) ?? null;
}

export function saveTemplate(template: EmailTemplate): EmailTemplate {
  const next = { ...template, updatedAt: new Date().toISOString() };
  const rest = listTemplates().filter((item) => item.id !== template.id);
  writeDoc(DOCUMENT_KEYS.emailTemplates, [...rest, next]);
  return next;
}

export function removeTemplate(id: string): void {
  writeDoc(
    DOCUMENT_KEYS.emailTemplates,
    listTemplates().filter((template) => template.id !== id),
  );
}

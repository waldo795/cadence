import {
  DEFAULT_CONTROLS,
  settingFor,
  type JourneySendSetting,
  type SendMode,
  type SendingControls,
  type TestRecipient,
} from "@/domain/sending";
import { themeOrDefault, type EmailTheme } from "@/domain/email-theme";
import { DOCUMENT_KEYS, readDoc, writeDoc } from "./storage";

/**
 * Client-side access to the sending controls.
 *
 * Three small documents rather than one: the kill switch is touched in a
 * hurry and must not depend on reading and rewriting a structure that also
 * holds every journey's mode.
 */

export function getControls(): SendingControls {
  return readDoc<SendingControls>(DOCUMENT_KEYS.sendingControls) ?? DEFAULT_CONTROLS;
}

export function setKillSwitch(on: boolean, reason?: string): SendingControls {
  const next: SendingControls = on
    ? {
        killSwitch: true,
        killSwitchReason: reason?.trim() || undefined,
        killSwitchAt: new Date().toISOString(),
      }
    : { killSwitch: false };
  writeDoc(DOCUMENT_KEYS.sendingControls, next);
  return next;
}

export function getSendSettings(): JourneySendSetting[] {
  return readDoc<JourneySendSetting[]>(DOCUMENT_KEYS.sendSettings) ?? [];
}

export function getSendSetting(journeyKey: string): JourneySendSetting | null {
  return settingFor(getSendSettings(), journeyKey);
}

export function saveSendSetting(
  journeyKey: string,
  mode: SendMode,
  testRecipientId: string | null,
): JourneySendSetting {
  const next: JourneySendSetting = {
    journeyKey,
    mode,
    testRecipientId,
    updatedAt: new Date().toISOString(),
  };
  const rest = getSendSettings().filter((item) => item.journeyKey !== journeyKey);
  writeDoc(DOCUMENT_KEYS.sendSettings, [...rest, next]);
  return next;
}

export function getTestRecipients(): TestRecipient[] {
  return readDoc<TestRecipient[]>(DOCUMENT_KEYS.testRecipients) ?? [];
}

export function saveTestRecipient(recipient: TestRecipient): TestRecipient[] {
  const rest = getTestRecipients().filter((item) => item.id !== recipient.id);
  const next = [...rest, recipient].sort((a, b) => a.name.localeCompare(b.name));
  writeDoc(DOCUMENT_KEYS.testRecipients, next);
  return next;
}

export function removeTestRecipient(id: string): TestRecipient[] {
  const next = getTestRecipients().filter((item) => item.id !== id);
  writeDoc(DOCUMENT_KEYS.testRecipients, next);

  /*
   * Any journey pointing at the deleted recipient is cleared at the same time.
   * Leaving a dangling id would read as "in test mode" while quietly sending
   * nothing, which is the one state that should never be possible to reach by
   * accident.
   */
  const settings = getSendSettings();
  if (settings.some((item) => item.testRecipientId === id)) {
    writeDoc(
      DOCUMENT_KEYS.sendSettings,
      settings.map((item) =>
        item.testRecipientId === id ? { ...item, testRecipientId: null } : item,
      ),
    );
  }

  return next;
}

/* -------------------------------------------------------------------------- */
/* Email theme                                                                */
/* -------------------------------------------------------------------------- */

export function getEmailTheme(): EmailTheme {
  return themeOrDefault(readDoc<Partial<EmailTheme>>(DOCUMENT_KEYS.emailTheme));
}

export function saveEmailTheme(theme: EmailTheme): void {
  writeDoc(DOCUMENT_KEYS.emailTheme, theme);
}

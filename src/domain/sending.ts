/**
 * Whether a message actually goes out, and to whom.
 *
 * Deliberately separate from the journey definition. Journeys are versioned
 * and an in-flight instance pins the version it entered on, so a mode stored
 * on the definition would not reach anyone already part-way through — you
 * would flip a journey to live and the people currently in it would carry on
 * in test. Keying on the lineage instead means a change applies to everyone at
 * once, which is the only useful behaviour for both a go-live and a panic.
 *
 * Three independent controls, checked in this order:
 *
 *   1. the org kill switch   — stops everything, instantly
 *   2. the journey's mode    — off / test / live, per journey
 *   3. the usual policy      — consent, caps, suppression
 */

export type SendMode = "off" | "test" | "live";

export const SEND_MODE_LABEL: Record<SendMode, string> = {
  off: "Not sending",
  test: "Test mode",
  live: "Live",
};

export const SEND_MODE_DESCRIPTION: Record<SendMode, string> = {
  off: "Messages are decided and recorded, but nothing is handed to a provider.",
  test: "Messages are really sent, but redirected to a test address instead of the client.",
  live: "Messages go to the client.",
};

export const SEND_MODE_TONE: Record<SendMode, "neutral" | "warning" | "positive"> = {
  off: "neutral",
  test: "warning",
  live: "positive",
};

/** A place test sends are redirected to. Never a client. */
export interface TestRecipient {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface JourneySendSetting {
  /** Lineage key, so the setting survives the journey being versioned. */
  journeyKey: string;
  mode: SendMode;
  /** Which test recipient receives redirected mail. Required for test mode. */
  testRecipientId: string | null;
  updatedAt: string;
}

export interface SendingControls {
  /**
   * Stops every message from every journey, immediately.
   *
   * Separate from pausing journeys on purpose: pausing stops people entering
   * and leaves those already in flight to carry on, and un-pausing later is
   * fiddly. This is the control you want at the moment you realise something
   * is wrong — it changes nothing about the journeys themselves, so turning it
   * off afterwards puts everything back exactly as it was.
   */
  killSwitch: boolean;
  killSwitchReason?: string;
  killSwitchAt?: string;
}

export const DEFAULT_CONTROLS: SendingControls = { killSwitch: false };

/**
 * A journey with no setting does not send.
 *
 * Fail closed. A newly built journey should never start emailing people
 * because nobody remembered to configure it.
 */
export const DEFAULT_SEND_MODE: SendMode = "off";

/* -------------------------------------------------------------------------- */
/* Resolution                                                                 */
/* -------------------------------------------------------------------------- */

export type SendOutcome = "deliver" | "redirect" | "suppress";

export interface SendTarget {
  outcome: SendOutcome;
  /** Where it actually goes. Empty when suppressed. */
  to: string;
  /** Who it was meant for, when redirected — shown in the test message. */
  intendedFor?: string;
  mode: SendMode;
  reason: string;
  /** Shown as a status code in the trace, alongside consent and cap codes. */
  code: "SENT" | "TEST_REDIRECT" | "SENDING_OFF" | "KILL_SWITCH" | "NO_TEST_RECIPIENT";
}

/**
 * Decides where one message goes.
 *
 * Pure, so the simulator and the live runner reach the same verdict and a
 * preview tells you honestly that a send would currently be blocked.
 */
export function resolveSendTarget(args: {
  controls: SendingControls;
  setting: JourneySendSetting | null;
  recipientEmail: string;
  testRecipient: TestRecipient | null;
}): SendTarget {
  const { controls, setting, recipientEmail, testRecipient } = args;
  const mode = setting?.mode ?? DEFAULT_SEND_MODE;

  // 1. The kill switch beats everything, including a live journey.
  if (controls.killSwitch) {
    return {
      outcome: "suppress",
      to: "",
      mode,
      code: "KILL_SWITCH",
      reason: controls.killSwitchReason
        ? `Sending is disabled across the workspace: ${controls.killSwitchReason}`
        : "Sending is disabled across the workspace by the kill switch.",
    };
  }

  // 2. The journey's own mode.
  if (mode === "off") {
    return {
      outcome: "suppress",
      to: "",
      mode,
      code: "SENDING_OFF",
      reason: "This journey is not sending. Messages are recorded only.",
    };
  }

  if (mode === "test") {
    if (!testRecipient) {
      return {
        outcome: "suppress",
        to: "",
        mode,
        code: "NO_TEST_RECIPIENT",
        reason: "This journey is in test mode but no test recipient is chosen, so nothing is sent.",
      };
    }
    return {
      outcome: "redirect",
      to: testRecipient.email,
      intendedFor: recipientEmail,
      mode,
      code: "TEST_REDIRECT",
      reason: `Test mode — redirected to ${testRecipient.email} instead of ${recipientEmail}.`,
    };
  }

  return {
    outcome: "deliver",
    to: recipientEmail,
    mode,
    code: "SENT",
    reason: `Live — sent to ${recipientEmail}.`,
  };
}

/**
 * Marks a redirected message so it is unmistakable in an inbox.
 *
 * Without this, a test run and a real one look identical, and the one thing
 * you most need to know is who it *would* have gone to.
 */
export function testSubjectPrefix(intendedFor: string): string {
  return `[TEST → ${intendedFor}] `;
}

export function createTestRecipient(name: string, email: string): TestRecipient {
  return {
    id: `test_${Math.random().toString(36).slice(2, 9)}`,
    name: name.trim(),
    email: email.trim().toLowerCase(),
    createdAt: new Date().toISOString(),
  };
}

export function settingFor(
  settings: JourneySendSetting[],
  journeyKey: string,
): JourneySendSetting | null {
  return settings.find((setting) => setting.journeyKey === journeyKey) ?? null;
}

export function modeFor(settings: JourneySendSetting[], journeyKey: string): SendMode {
  return settingFor(settings, journeyKey)?.mode ?? DEFAULT_SEND_MODE;
}

/** Journeys that would actually email a client right now. */
export function liveJourneyKeys(
  settings: JourneySendSetting[],
  controls: SendingControls,
): string[] {
  if (controls.killSwitch) return [];
  return settings.filter((setting) => setting.mode === "live").map((s) => s.journeyKey);
}

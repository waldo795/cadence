import { NextResponse } from "next/server";
import { evaluateTrigger, buildTriggerEvent, firedKey } from "@/domain/scheduled-trigger";
import type { ScheduledTrigger } from "@/domain/scheduled-trigger";
import type { CustomerEvent } from "@/domain/event";
import { DOCUMENT_KEYS } from "@/shared/keys";
import { ensureSeeded } from "@/server/seed-db";
import { resumeDueInstances, startInstancesForEvent } from "@/server/runner";
import {
  insertEvents,
  listProfiles,
  readDocument,
  upsertProfiles,
  writeDocument,
} from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The scheduler tick. A cron calls this; nothing else should.
 *
 * Two jobs, in order:
 *
 *  1. **Evaluate date triggers.** Anything due emits an event and tags the
 *     client. Triggers never send — they only produce events.
 *  2. **Advance instances.** Newly emitted events start journeys, and any
 *     instance whose wake time has passed is resumed.
 *
 * The ordering matters: emitting first means a countdown that comes due this
 * tick starts its journey in the same tick, rather than waiting for the next
 * one.
 *
 * Daily is enough for day-granularity countdowns, and is also kinder — nobody
 * wants a 3am text. Run it at a civilised hour.
 */

/**
 * Protected by a shared secret.
 *
 * This endpoint sends messages to real people, so leaving it open would let
 * anyone on the internet trigger a send. With `CRON_SECRET` unset it is
 * allowed only outside production, so local development needs no setup while
 * a deployment cannot accidentally expose it.
 */
function authorised(request: Request): { ok: true } | { ok: false; reason: string } {
  const secret = process.env.CRON_SECRET?.trim();

  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      return { ok: false, reason: "CRON_SECRET is not set on the server." };
    }
    return { ok: true };
  }

  const header = request.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  return provided === secret
    ? { ok: true }
    : { ok: false, reason: "Missing or incorrect bearer token." };
}

export async function POST(request: Request) {
  const auth = authorised(request);
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.reason }, { status: 401 });
  }

  const url = new URL(request.url);
  // A dry run reports what would happen and writes nothing.
  const dryRun = url.searchParams.get("dryRun") === "true";
  const now = new Date();

  await ensureSeeded();

  /* ---------------------------------------------------------------- 1 ---- */

  const triggers = (await readDocument<ScheduledTrigger[]>(DOCUMENT_KEYS.scheduledTriggers)) ?? [];
  const fired = (await readDocument<string[]>(DOCUMENT_KEYS.firedTriggers)) ?? [];
  const firedSet = new Set(fired);
  const profiles = await listProfiles();

  const emitted: CustomerEvent[] = [];
  const tagged = new Map<string, string[]>();

  for (const trigger of triggers) {
    for (const profile of profiles) {
      const evaluation = evaluateTrigger(trigger, profile, now, firedSet);
      if (evaluation.status !== "due" || !evaluation.anchorDate) continue;

      emitted.push(buildTriggerEvent(trigger, profile, evaluation, now));

      if (trigger.addTag) {
        const existing = tagged.get(profile.id) ?? [];
        if (!existing.includes(trigger.addTag)) existing.push(trigger.addTag);
        tagged.set(profile.id, existing);
      }

      firedSet.add(firedKey(trigger.id, profile.id, evaluation.anchorDate));
    }
  }

  if (!dryRun && emitted.length > 0) {
    await insertEvents(emitted);
    await writeDocument(DOCUMENT_KEYS.firedTriggers, [...firedSet]);

    if (tagged.size > 0) {
      const updated = profiles
        .filter((profile) => tagged.has(profile.id))
        .map((profile) => ({
          ...profile,
          tags: [...new Set([...(profile.tags ?? []), ...(tagged.get(profile.id) ?? [])])],
        }));
      await upsertProfiles(updated);
    }
  }

  /* ---------------------------------------------------------------- 2 ---- */

  let startedCount = 0;
  let startedMessages = 0;
  const startSkips: string[] = [];

  if (!dryRun) {
    for (const event of emitted) {
      const result = await startInstancesForEvent(event, { now });
      startedCount += result.started.length;
      startedMessages += result.started.reduce((sum, slice) => sum + slice.sends.length, 0);
      for (const skip of result.skipped) startSkips.push(`${skip.journeyKey}: ${skip.reason}`);
    }
  }

  const resumed = dryRun
    ? { resumed: 0, completed: 0, stillWaiting: 0, failed: 0, messages: 0, details: [] }
    : await resumeDueInstances({ now });

  return NextResponse.json({
    ok: true,
    dryRun,
    at: now.toISOString(),
    triggers: {
      evaluated: triggers.length * profiles.length,
      emitted: emitted.length,
      events: emitted.map((event) => `${event.name} → ${event.profileId}`),
      tagged: tagged.size,
    },
    instances: {
      started: startedCount,
      startedMessages,
      skipped: startSkips,
      ...resumed,
    },
  });
}

/** Convenience for checking the endpoint is reachable and configured. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST to run the scheduler. Add ?dryRun=true to see what would happen.",
    secretConfigured: Boolean(process.env.CRON_SECRET?.trim()),
  });
}

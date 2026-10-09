import { NextResponse } from "next/server";
import type { CustomerEvent } from "@/domain/event";
import type { MessageRecord } from "@/domain/message";
import type { Profile } from "@/domain/profile";
import { resetDatabase } from "@/server/seed-db";
import {
  insertEvents,
  insertMessages,
  upsertProfiles,
  writeDocument,
} from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Every write the UI performs, in one endpoint.
 *
 * The operations are deliberately targeted rather than "replace this
 * collection": appending events and upserting individual profiles are safe to
 * interleave with the intake endpoint and the trigger cron, which a
 * read-modify-write of a whole collection would not be.
 */
type Mutation =
  | { kind: "upsertProfiles"; profiles: Profile[] }
  | { kind: "appendEvents"; events: CustomerEvent[] }
  | { kind: "appendMessages"; messages: MessageRecord[] }
  | { kind: "writeDocument"; key: string; value: unknown }
  | { kind: "reset" };

export async function POST(request: Request) {
  let mutation: Mutation;
  try {
    mutation = (await request.json()) as Mutation;
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  try {
    switch (mutation.kind) {
      case "upsertProfiles":
        if (!Array.isArray(mutation.profiles)) {
          return NextResponse.json({ error: "profiles must be an array." }, { status: 400 });
        }
        await upsertProfiles(mutation.profiles);
        break;

      case "appendEvents":
        if (!Array.isArray(mutation.events)) {
          return NextResponse.json({ error: "events must be an array." }, { status: 400 });
        }
        await insertEvents(mutation.events);
        break;

      case "appendMessages":
        if (!Array.isArray(mutation.messages)) {
          return NextResponse.json({ error: "messages must be an array." }, { status: 400 });
        }
        await insertMessages(mutation.messages);
        break;

      case "writeDocument":
        if (typeof mutation.key !== "string" || mutation.key === "") {
          return NextResponse.json({ error: "key is required." }, { status: 400 });
        }
        await writeDocument(mutation.key, mutation.value);
        break;

      case "reset":
        await resetDatabase();
        break;

      default:
        return NextResponse.json({ error: "Unknown mutation." }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Write failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

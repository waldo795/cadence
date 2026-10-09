import { NextResponse } from "next/server";
import {
  createRequest,
  type DataSubjectRequest,
  type RequestKind,
  type RequestStatus,
} from "@/domain/privacy";
import { ensureSeeded } from "@/server/seed-db";
import {
  collectPersonalData,
  executeErasure,
  getRequest,
  listRequests,
  matchProfile,
  planErasure,
  saveRequest,
  verifyErasure,
} from "@/server/privacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Servicing data subject requests.
 *
 * Behind the password gate — these actions read and permanently destroy
 * personal data, so they are never reachable without a session.
 */

const KINDS: RequestKind[] = [
  "access",
  "erasure",
  "rectification",
  "portability",
  "objection",
];

export async function GET() {
  await ensureSeeded();
  return NextResponse.json(
    { requests: await listRequests() },
    { headers: { "Cache-Control": "no-store" } },
  );
}

type Action =
  | { action: "log"; kind: RequestKind; email: string; name?: string }
  | { action: "update"; id: string; status?: RequestStatus; notes?: string }
  | { action: "verify"; id: string; verified: boolean; note?: string }
  | { action: "preview"; id: string }
  | { action: "export"; id: string }
  | { action: "erase"; id: string; confirm: string };

export async function POST(request: Request) {
  await ensureSeeded();

  let body: Action;
  try {
    body = (await request.json()) as Action;
  } catch {
    return NextResponse.json({ ok: false, error: "Body must be JSON." }, { status: 400 });
  }

  switch (body.action) {
    /* ------------------------------------------------------------ log --- */
    case "log": {
      if (!KINDS.includes(body.kind)) {
        return NextResponse.json({ ok: false, error: "Unknown request type." }, { status: 400 });
      }
      if (typeof body.email !== "string" || !body.email.includes("@")) {
        return NextResponse.json({ ok: false, error: "A valid email is required." }, { status: 400 });
      }

      const created = createRequest(body.kind, body.email);
      created.subjectName = typeof body.name === "string" ? body.name.trim() : undefined;
      // Match immediately so the operator can see at once whether a record
      // even exists for this person.
      created.profileId = await matchProfile(created.subjectEmail);
      await saveRequest(created);

      return NextResponse.json({ ok: true, request: created }, { status: 201 });
    }

    /* --------------------------------------------------------- update --- */
    case "update": {
      const existing = await getRequest(body.id);
      if (!existing) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

      const next: DataSubjectRequest = {
        ...existing,
        status: body.status ?? existing.status,
        notes: body.notes ?? existing.notes,
        completedAt:
          body.status === "completed" || body.status === "refused"
            ? (existing.completedAt ?? new Date().toISOString())
            : null,
      };
      await saveRequest(next);
      return NextResponse.json({ ok: true, request: next });
    }

    /* --------------------------------------------------------- verify --- */
    case "verify": {
      const existing = await getRequest(body.id);
      if (!existing) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

      const next: DataSubjectRequest = {
        ...existing,
        identityVerified: Boolean(body.verified),
        verifiedNote: body.note,
        status: body.verified && existing.status === "received" ? "in_progress" : existing.status,
      };
      await saveRequest(next);
      return NextResponse.json({ ok: true, request: next });
    }

    /* -------------------------------------------------------- preview --- */
    case "preview": {
      const existing = await getRequest(body.id);
      if (!existing) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });
      if (!existing.profileId) {
        return NextResponse.json({ ok: true, counts: null, matched: false });
      }
      return NextResponse.json({
        ok: true,
        matched: true,
        counts: await planErasure(existing.profileId),
      });
    }

    /* --------------------------------------------------------- export --- */
    case "export": {
      const existing = await getRequest(body.id);
      if (!existing) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

      // Identity gate applies to disclosure too: handing someone else's record
      // over is itself a breach.
      if (!existing.identityVerified) {
        return NextResponse.json(
          { ok: false, error: "Verify their identity before disclosing any data." },
          { status: 403 },
        );
      }
      if (!existing.profileId) {
        return NextResponse.json({ ok: false, error: "No client matches that email." }, { status: 404 });
      }

      const data = await collectPersonalData(existing.profileId);
      if (!data) {
        return NextResponse.json({ ok: false, error: "That client no longer exists." }, { status: 404 });
      }

      const records =
        data.events.length +
        data.messages.length +
        data.journeyProgress.length +
        data.experimentParticipation.length +
        data.journeyHistory.length +
        data.remindersSent.length +
        1;

      await saveRequest({
        ...existing,
        receipt: { kind: "export", at: new Date().toISOString(), records },
      });

      return NextResponse.json({ ok: true, data });
    }

    /* ---------------------------------------------------------- erase --- */
    case "erase": {
      const existing = await getRequest(body.id);
      if (!existing) return NextResponse.json({ ok: false, error: "Not found." }, { status: 404 });

      /*
       * Three gates, because this cannot be undone.
       *
       * The identity check is the one that matters most: without it, anyone
       * who knows a client's email could have that client deleted.
       */
      if (!existing.identityVerified) {
        return NextResponse.json(
          { ok: false, error: "Verify their identity before erasing anything." },
          { status: 403 },
        );
      }
      if (!existing.profileId) {
        return NextResponse.json({ ok: false, error: "No client matches that email." }, { status: 404 });
      }
      if (body.confirm !== existing.subjectEmail) {
        return NextResponse.json(
          { ok: false, error: "Type the client's email exactly to confirm." },
          { status: 400 },
        );
      }

      const receipt = await executeErasure(existing.profileId, existing.subjectEmail);
      // Prove it worked rather than assuming. Anything non-zero means a store
      // was missed, and the operator needs to know before telling the client.
      const remaining = await verifyErasure(existing.profileId);
      const leftover = Object.values(remaining).reduce((sum, n) => sum + n, 0);

      await saveRequest({
        ...existing,
        status: leftover === 0 ? "completed" : "in_progress",
        completedAt: leftover === 0 ? new Date().toISOString() : null,
        // The profile is gone; keep no pointer to it.
        profileId: null,
        receipt,
        notes: leftover === 0
          ? existing.notes
          : `${existing.notes ?? ""}\nWARNING: ${leftover} record(s) remained after erasure.`.trim(),
      });

      return NextResponse.json({ ok: true, receipt, remaining, verified: leftover === 0 });
    }

    default:
      return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  }
}

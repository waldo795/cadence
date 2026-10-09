import { NextResponse } from "next/server";
import { ensureSeeded } from "@/server/seed-db";
import {
  isSpam,
  recordIntake,
  validateIntake,
  type IntakeInput,
} from "@/server/intake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The public endpoint the website enquiry form posts to.
 *
 * Handles both shapes a real form takes: a plain HTML `<form action>` post,
 * which arrives URL-encoded and expects a redirect back to the site, and a
 * `fetch()` post, which arrives as JSON and expects JSON back. Supporting only
 * the second would force her site to run JavaScript for something that works
 * fine without it.
 */

/* -------------------------------------------------------------------------- */
/* Origin allowlist                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Comma-separated list in `INTAKE_ALLOWED_ORIGINS`, e.g.
 * `https://herstudio.co.uk,https://www.herstudio.co.uk`.
 *
 * Unset means allow any origin, which is right for local development and wrong
 * for production — the deployment checklist in the README calls this out.
 */
function allowedOrigins(): string[] | null {
  const configured = process.env.INTAKE_ALLOWED_ORIGINS?.trim();
  if (!configured) return null;
  return configured.split(",").map((origin) => origin.trim()).filter(Boolean);
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed = allowedOrigins();
  const value = allowed === null ? "*" : origin && allowed.includes(origin) ? origin : "";

  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
  if (value) headers["Access-Control-Allow-Origin"] = value;
  return headers;
}

function originPermitted(origin: string | null): boolean {
  const allowed = allowedOrigins();
  if (allowed === null) return true;
  // A plain form post from some browsers omits Origin; those are allowed
  // through because the allowlist cannot judge them either way, and the
  // honeypot plus rate limit still apply.
  if (!origin) return true;
  return allowed.includes(origin);
}

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                              */
/* -------------------------------------------------------------------------- */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

/**
 * In-memory sliding window, keyed by client IP.
 *
 * Deliberately simple, and honestly limited: it resets when the server
 * restarts and does not span multiple instances. It exists to stop a public
 * form being trivially flooded, not to withstand a determined attacker — that
 * would need a shared store or a WAF in front.
 */
const hits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((at) => now - at < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);

  // Opportunistic cleanup so the map cannot grow without bound.
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (times.every((at) => now - at >= WINDOW_MS)) hits.delete(key);
    }
  }

  return recent.length > MAX_PER_WINDOW;
}

function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/* -------------------------------------------------------------------------- */
/* Handlers                                                                   */
/* -------------------------------------------------------------------------- */

export async function OPTIONS(request: Request) {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders(request.headers.get("origin")),
  });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const cors = corsHeaders(origin);

  if (!originPermitted(origin)) {
    return NextResponse.json(
      { ok: false, errors: ["This origin is not allowed to submit the form."] },
      { status: 403, headers: cors },
    );
  }

  if (rateLimited(clientIp(request))) {
    return NextResponse.json(
      { ok: false, errors: ["Too many submissions. Please wait a moment and try again."] },
      { status: 429, headers: cors },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  const isFormPost =
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data");

  let input: IntakeInput;
  let redirectTo = "";

  try {
    if (isFormPost) {
      const form = await request.formData();
      input = Object.fromEntries(form.entries()) as IntakeInput;
      redirectTo = String(form.get("redirectTo") ?? "");
    } else {
      input = (await request.json()) as IntakeInput;
    }
  } catch {
    return NextResponse.json(
      { ok: false, errors: ["Could not read the submission."] },
      { status: 400, headers: cors },
    );
  }

  await ensureSeeded();

  /*
   * A spam submission gets a success response but is never stored. Telling a
   * bot it was rejected just teaches whoever wrote it which field to leave
   * alone next time.
   */
  if (isSpam(input)) {
    return isFormPost && redirectTo
      ? NextResponse.redirect(redirectTo, 303)
      : NextResponse.json({ ok: true }, { status: 200, headers: cors });
  }

  const validation = validateIntake(input);
  if (!validation.ok) {
    if (isFormPost && redirectTo) {
      const url = new URL(redirectTo);
      url.searchParams.set("error", validation.errors[0]);
      return NextResponse.redirect(url.toString(), 303);
    }
    return NextResponse.json(
      { ok: false, errors: validation.errors },
      { status: 400, headers: cors },
    );
  }

  let result;
  try {
    result = await recordIntake(validation.clean);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not save the enquiry.";
    return NextResponse.json({ ok: false, errors: [message] }, { status: 500, headers: cors });
  }

  if (isFormPost && redirectTo) {
    const url = new URL(redirectTo);
    url.searchParams.set("enquiry", "received");
    return NextResponse.redirect(url.toString(), 303);
  }

  return NextResponse.json(
    { ok: true, created: result.created },
    { status: 201, headers: cors },
  );
}

import { NextResponse } from "next/server";
import {
  authConfigured,
  createSessionToken,
  passwordMatches,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
} from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sign in. */
export async function POST(request: Request) {
  if (!authConfigured()) {
    return NextResponse.json(
      { ok: false, error: "No password is configured on this server." },
      { status: 503 },
    );
  }

  let password = "";
  try {
    const body = (await request.json()) as { password?: unknown };
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  if (!(await passwordMatches(password))) {
    // Deliberately vague, and slowed slightly to make guessing tedious.
    await new Promise((resolve) => setTimeout(resolve, 400));
    return NextResponse.json({ ok: false, error: "Incorrect password." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set({
    name: SESSION_COOKIE,
    value: await createSessionToken(),
    httpOnly: true,
    sameSite: "lax",
    // Cookies are only sent over HTTPS in production; localhost has no TLS.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

/** Sign out. */
export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set({ name: SESSION_COOKIE, value: "", path: "/", maxAge: 0 });
  return response;
}

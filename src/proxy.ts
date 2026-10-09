import { NextResponse, type NextRequest } from "next/server";
import { authConfigured, SESSION_COOKIE, verifySessionToken } from "@/lib/auth";

/**
 * The gate.
 *
 * Next 16 calls this a proxy; it was `middleware.ts` in earlier versions and
 * the deprecated name still works, but the new one avoids a build warning.
 *
 * Everything requires a session except three deliberate exceptions:
 *
 *  - `/api/intake` — the public website form. That is the whole point of it;
 *    it has its own honeypot, rate limit and origin allowlist.
 *  - `/api/cron` — called by a scheduler with no browser session. It carries
 *    its own bearer token instead.
 *  - `/api/health` — so an uptime monitor can reach it. It reveals nothing
 *    beyond whether the service is up.
 *
 * Everything else, including `/api/snapshot` and `/api/mutate`, is closed.
 * Those read and destroy real client data, and were open until now.
 */
const PUBLIC_PATHS = ["/api/intake", "/api/cron", "/api/health", "/login", "/api/auth"];

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublic(pathname)) return NextResponse.next();

  if (!authConfigured()) {
    /*
     * No password set.
     *
     * Development runs open so there is nothing to configure locally. In
     * production it refuses outright: serving a real client list with no
     * password because an environment variable was forgotten is exactly the
     * failure this exists to prevent, and failing loudly is the only way that
     * gets noticed before a customer does.
     */
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "APP_PASSWORD is not set. Refusing to serve client data without a password.",
        { status: 503, headers: { "Content-Type": "text/plain" } },
      );
    }
    return NextResponse.next();
  }

  const valid = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (valid) return NextResponse.next();

  // An API call gets a status it can act on; a page gets the login screen.
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
  }

  const login = request.nextUrl.clone();
  login.pathname = "/login";
  login.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname)}`;
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except Next's own assets and the favicon.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

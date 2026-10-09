import { NextResponse } from "next/server";
import { verifyUnsubscribeToken } from "@/lib/unsubscribe";
import { getProfile, upsertProfiles } from "@/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Acts on an unsubscribe. Public, by necessity — the person clicking has no
 * account and never will.
 *
 * POST rather than GET on purpose. Inbox providers and corporate mail
 * scanners follow every link in a message to check it is safe, so an
 * unsubscribe that happened on GET would opt people out of emails they never
 * even opened. The link in the email leads to a page with a button; this is
 * what the button posts to.
 */
export async function POST(request: Request) {
  let body: { profileId?: string; token?: string };
  try {
    body = (await request.json()) as { profileId?: string; token?: string };
  } catch {
    return NextResponse.json({ error: "Body must be JSON." }, { status: 400 });
  }

  const { profileId, token } = body;
  if (!profileId || !(await verifyUnsubscribeToken(profileId, token))) {
    // One message for both cases: confirming that a profile id exists would
    // turn this into a way of testing whether an address is on the list.
    return NextResponse.json({ error: "This unsubscribe link is not valid." }, { status: 403 });
  }

  const profile = await getProfile(profileId);
  if (!profile) {
    return NextResponse.json({ error: "This unsubscribe link is not valid." }, { status: 403 });
  }

  /*
   * Already unsubscribed is a success, not an error. Someone clicking twice
   * should be reassured, not told something went wrong.
   */
  if (profile.contactability.email !== "unsubscribed") {
    await upsertProfiles([
      {
        ...profile,
        contactability: { ...profile.contactability, email: "unsubscribed" },
      },
    ]);
  }

  return NextResponse.json({ ok: true, email: profile.email });
}

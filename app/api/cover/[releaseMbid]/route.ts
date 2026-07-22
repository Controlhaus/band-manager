import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { CAA_BASE } from "@/lib/musicbrainz";
import { musicbrainzUserAgent } from "@/lib/env";

/**
 * Self-origin proxy for album cover art from the Cover Art Archive. Streaming
 * it through our own origin keeps the CSP strict (img-src 'self') instead of
 * allow-listing the archive's rotating redirect hosts. Requires a session so
 * the app isn't usable as an open image proxy; the art itself is public data.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ releaseMbid: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { releaseMbid } = await params;
  if (!UUID_RE.test(releaseMbid)) {
    return NextResponse.json({ error: "Invalid release id" }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const upstream = await fetch(
      `${CAA_BASE}/release/${releaseMbid}/front-500`,
      {
        headers: { "User-Agent": musicbrainzUserAgent },
        signal: controller.signal,
        // fetch follows the 307 redirect to the archive automatically.
      },
    );
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: "No cover art" }, { status: 404 });
    }

    const contentType = upstream.headers.get("content-type") ?? "image/jpeg";
    if (!contentType.startsWith("image/")) {
      return NextResponse.json({ error: "No cover art" }, { status: 404 });
    }

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "X-Content-Type-Options": "nosniff",
        // Cover art is immutable for a given release; cache aggressively.
        "Cache-Control": "public, max-age=604800, immutable",
      },
    });
  } catch {
    return NextResponse.json({ error: "No cover art" }, { status: 404 });
  } finally {
    clearTimeout(timer);
  }
}

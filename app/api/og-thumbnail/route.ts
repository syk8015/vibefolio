import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== "string") return NextResponse.json({ imageUrl: null });

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Vibefolio/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return NextResponse.json({ imageUrl: null });

    const html = await res.text();

    // Match og:image or twitter:image in either attribute order
    const patterns = [
      /property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    ];

    let rawUrl: string | null = null;
    for (const pattern of patterns) {
      const m = html.match(pattern);
      if (m?.[1]) { rawUrl = m[1]; break; }
    }

    if (!rawUrl) return NextResponse.json({ imageUrl: null });

    const imageUrl = rawUrl.startsWith("http") ? rawUrl : new URL(rawUrl, url).href;
    return NextResponse.json({ imageUrl });
  } catch {
    return NextResponse.json({ imageUrl: null });
  }
}

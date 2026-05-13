import { NextRequest, NextResponse } from "next/server";

function screenshotFallback(url: string) {
  return `https://image.thum.io/get/width/1200/crop/630/${url}`;
}

export async function POST(req: NextRequest) {
  let url = "";
  try {
    ({ url } = await req.json());
    if (!url || typeof url !== "string") return NextResponse.json({ imageUrl: null });

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Vibefolio/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return NextResponse.json({ imageUrl: screenshotFallback(url) });

    const html = await res.text();

    const patterns = [
      /property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i,
    ];

    for (const pattern of patterns) {
      const m = html.match(pattern);
      if (m?.[1]) {
        const imageUrl = m[1].startsWith("http") ? m[1] : new URL(m[1], url).href;
        return NextResponse.json({ imageUrl });
      }
    }

    // No og:image — fall back to screenshot
    return NextResponse.json({ imageUrl: screenshotFallback(url) });
  } catch {
    return NextResponse.json({ imageUrl: url ? screenshotFallback(url) : null });
  }
}

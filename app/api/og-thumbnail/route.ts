import { NextRequest, NextResponse } from "next/server";
import { screenshotUrl } from "@/lib/thumbnail";

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const h = parsed.hostname;
    if (h === "localhost" || h === "127.0.0.1" || h === "::1") return false;
    if (h === "169.254.169.254") return false;
    if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return false;
    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  let url = "";
  try {
    ({ url } = await req.json());
    if (!url || typeof url !== "string") return NextResponse.json({ imageUrl: null });
    if (url.length > 2048) return NextResponse.json({ imageUrl: null });
    if (!isSafeUrl(url)) return NextResponse.json({ imageUrl: null });

    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Nookframe/1.0)",
        Accept: "text/html,application/xhtml+xml",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) return NextResponse.json({ imageUrl: screenshotUrl(url) });

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
    return NextResponse.json({ imageUrl: screenshotUrl(url) });
  } catch {
    return NextResponse.json({ imageUrl: url ? screenshotUrl(url) : null });
  }
}

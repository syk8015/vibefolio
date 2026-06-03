import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Open-redirect guard: `next` is user-controlled and concatenated onto origin.
  // Only allow a same-origin relative path — reject `//evil.com`, `/\evil.com`,
  // `@evil.com` (userinfo trick), or any absolute URL, all of which would escape
  // our origin and turn the post-login redirect into a phishing hop.
  const nextParam = searchParams.get("next") ?? "/";
  const next =
    nextParam.startsWith("/") &&
    !nextParam.startsWith("//") &&
    !nextParam.startsWith("/\\")
      ? nextParam
      : "/";

  if (code) {
    try {
      // Create the redirect response first so we can set cookies on it
      const response = NextResponse.redirect(`${origin}${next}`);

      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          cookies: {
            getAll() {
              return request.cookies.getAll();
            },
            setAll(cookiesToSet) {
              // Must set cookies directly on the response object in Route Handlers
              cookiesToSet.forEach(({ name, value, options }) =>
                response.cookies.set(name, value, options)
              );
            },
          },
        }
      );

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) {
        return response;
      }
    } catch (err) {
      // Unexpected failure during code exchange — never 500 the browser on an
      // auth callback; fall through to the same graceful /login redirect.
      logger.error("auth/callback: code exchange threw", { error: err });
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

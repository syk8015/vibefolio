// Custom portfolio CSS is authored freely by the profile owner and injected into
// a <style> tag via dangerouslySetInnerHTML on the PUBLIC card page. Inside a
// <style> element the browser parses in "raw text" mode, where the ONLY thing
// that can terminate the element — and let whatever follows be parsed as HTML —
// is a `</style` sequence. A malicious owner could close the tag early and inject
// a <script> that runs on the nookframe.com origin and steals a visitor's session.
//
// Strip every `</style` (case-insensitive), looping until the string is stable so
// nested / overlapping payloads (e.g. `</sty</stylele>`) can't reassemble into a
// closing tag after one pass. Real CSS never contains `</style`, so nothing valid
// is lost. This is the security boundary — it runs wherever the CSS is rendered,
// not just where it's authored.
export function sanitizeCustomCss(css: string | null | undefined): string {
  if (!css) return "";
  let out = css;
  let prev: string;
  do {
    prev = out;
    out = out.replace(/<\/style/gi, "");
  } while (out !== prev);
  return out;
}

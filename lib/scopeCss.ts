// Scope owner-authored custom portfolio CSS to a container so it can only restyle
// the portfolio content — never the report button, the mode toggle, or the page
// chrome (all of which live OUTSIDE the scope). Runs AFTER sanitizeCustomCss (the
// </style breakout guard); this layer is the containment guard.
//
// It prefixes every style-rule selector with `scope` (e.g. `#vf-custom-scope`).
// Selectors that would otherwise escape — `html`, `body`, `:root`, `*` — become
// descendants of the scope and simply never match page chrome (fail-safe). @media/
// @supports/@container recurse; @keyframes/@font-face/@page pass through (their inner
// tokens aren't page-element selectors); @import/@charset/other bare at-rules are
// dropped. Overlay attempts are separately contained by `isolation: isolate` on the
// scope element, which traps any z-index below the controls' stacking level.
//
// Best-effort tokenizer (not a full CSS parser), but sound for the security goal:
// anything it can't cleanly scope is dropped or neutralized, never left global.
export function scopeCustomCss(css: string | null | undefined, scope: string): string {
  if (!css) return "";
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  return scopeBlock(noComments, scope);
}

function scopeBlock(css: string, scope: string): string {
  let out = "";
  let i = 0;
  const n = css.length;
  while (i < n) {
    // Scan the prelude up to the next `{` (rule block), `}` (stray close), or `;`
    // (a bare at-statement like @import).
    let j = i;
    while (j < n && css[j] !== "{" && css[j] !== "}" && css[j] !== ";") j++;

    if (j >= n) break;

    if (css[j] === ";") {
      // Bare statement (no block) — @import/@charset/@namespace etc. Drop it all.
      i = j + 1;
      continue;
    }
    if (css[j] === "}") {
      // Stray close brace — skip.
      i = j + 1;
      continue;
    }

    // css[j] === "{" → prelude is [i, j); find the matching close brace.
    const prelude = css.slice(i, j).trim();
    let depth = 1;
    let k = j + 1;
    while (k < n && depth > 0) {
      if (css[k] === "{") depth++;
      else if (css[k] === "}") depth--;
      k++;
    }
    const body = css.slice(j + 1, k - 1);
    out += transformRule(prelude, body, scope);
    i = k;
  }
  return out;
}

function transformRule(prelude: string, body: string, scope: string): string {
  if (!prelude) return "";

  if (prelude.startsWith("@")) {
    const name = prelude.slice(1).split(/[\s({]/)[0].toLowerCase();
    if (name === "media" || name === "supports" || name === "container") {
      // Conditional group rule — recurse into its inner style rules.
      return `${prelude}{${scopeBlock(body, scope)}}`;
    }
    if (name === "keyframes" || name === "font-face" || name === "page" || name === "layer") {
      // Inner tokens aren't page-element selectors; pass through unchanged.
      return `${prelude}{${body}}`;
    }
    // Unknown at-rule with a block — drop for safety.
    return "";
  }

  // Plain style rule: prefix each selector in the (comma-separated) list.
  const scoped = prelude
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => `${scope} ${s}`)
    .join(",");
  return scoped ? `${scoped}{${body}}` : "";
}

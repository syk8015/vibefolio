/**
 * Compact brand mark — mono "n" + the block cursor. The brand rule says `n` never
 * appears alone: the smallest unit is always n + block. Block geometry is the same as
 * the wordmark's (components/Logo.tsx): .55em × 1.02em, .05em radius, .08em gap.
 * Both letter and block use currentColor, so the caller's `color` paints the whole mark.
 * Decorative only (aria-hidden) — the screens that use it say "Nookframe" in words.
 */
export default function BrandMark({ size = "1rem" }: { size?: string }) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: "var(--font-mono), monospace",
        fontWeight: 500,
        fontSize: size,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      n
      <span
        style={{
          display: "inline-block",
          flexShrink: 0,
          width: "0.55em",
          height: "1.02em",
          borderRadius: "0.05em",
          background: "currentColor",
          marginLeft: "0.08em",
        }}
      />
    </span>
  );
}

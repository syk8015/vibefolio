import Link from "next/link";

/**
 * Brand wordmark — lowercase mono "nookframe" + block cursor.
 * The block never appears without the letters and always shares
 * their ink (currentColor); pass href={null} for non-link contexts.
 */
export default function Logo({ href = "/", size = "1rem" }: { href?: string | null; size?: string }) {
  const mark = (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        color: "var(--text-primary)",
        fontFamily: "var(--font-mono), monospace",
        fontWeight: 500,
        fontSize: size,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      }}
    >
      nookframe
      <span
        aria-hidden
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
  if (href === null) return mark;
  return (
    <Link href={href} style={{ textDecoration: "none", display: "inline-flex" }}>
      {mark}
    </Link>
  );
}

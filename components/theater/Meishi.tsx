// Meishi — the literal business-card identity element that anchors
// the Theater layout. Variants:
//
//   • <MeishiBig>      large pocket card sitting beside the stage on desktop
//   • <MeishiInline>   horizontal name-card used in the mobile About section
//   • <StampSeal>      red stamp accent; carries the owner's initial so it
//                      reads as a personal seal rather than a generic 印

import Link from "next/link";
import { getSocialMeta } from "@/components/SocialBadge";

export type MeishiProfile = {
  username: string;
  name: string | null;
  avatar_url?: string | null;
  bio?: string | null;
};

const ROLE_LABEL = "Vibe coder";

function initial(p: MeishiProfile): string {
  // The seal and avatar fallback both pull from this so they stay in sync —
  // first character of the display name, uppercased.
  return (p.name || p.username || "?").trim().charAt(0).toUpperCase();
}

function displayName(p: MeishiProfile): string {
  return p.name || p.username;
}

export function StampSeal({
  size = 38,
  label,
  style,
}: {
  size?: number;
  label: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: 4,
        background: "#b34747",
        color: "#fff",
        fontFamily: "var(--font-serif), 'Noto Serif KR', serif",
        fontWeight: 900,
        fontSize: size * 0.5,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: "rotate(-6deg)",
        opacity: 0.82,
        boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
        mixBlendMode: "multiply",
        flexShrink: 0,
        ...style,
      }}
    >
      {label}
    </div>
  );
}

// Vertical list of social links shown inside the meishi card — each
// row is a small colored dot + @handle so visitors can copy/recognize
// the actual ID, not just guess from a color.
function SocialHandleList({
  urls,
  dotSize = 18,
  fontSize = 12,
  gap = 5,
}: {
  urls: string[];
  dotSize?: number;
  fontSize?: number;
  gap?: number;
}) {
  const items = urls
    .map((u) => getSocialMeta(u))
    .filter((m): m is NonNullable<ReturnType<typeof getSocialMeta>> => !!m);
  if (items.length === 0) return null;
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap,
        position: "relative",
      }}
    >
      {items.map((meta) => (
        <a
          key={meta.href}
          href={meta.href}
          target="_blank"
          rel="noopener noreferrer"
          title={meta.name}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            textDecoration: "none",
            color: "var(--text-secondary)",
            transition: "color 0.15s ease",
            fontFamily: "var(--font-nunito)",
            fontSize,
            fontWeight: 500,
            width: "fit-content",
            maxWidth: "100%",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.color = "var(--text-secondary)";
          }}
        >
          <span
            style={{
              width: dotSize,
              height: dotSize,
              borderRadius: 999,
              background: meta.color,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {meta.icon}
          </span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {meta.handle}
          </span>
        </a>
      ))}
    </div>
  );
}

// Large pocket-style card used as the identity centerpiece on desktop.
// Aspect-ratio is the minimum — the card grows taller when the owner
// has many social links so the handle list isn't clipped.
export function MeishiBig({
  profile,
  socialLinks = [],
  withSeal = true,
  number = "06",
  style,
}: {
  profile: MeishiProfile;
  socialLinks?: string[];
  withSeal?: boolean;
  number?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: 260,
        background: "var(--surface)",
        borderRadius: 4,
        boxShadow: "0 1px 0 rgba(0,0,0,0.04), 0 18px 40px rgba(0,0,0,0.16), 0 3px 8px rgba(0,0,0,0.08)",
        padding: "22px 26px",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "var(--font-nunito)",
        ...style,
      }}
    >
      <div className="vf-paper-grain" />

      {/* Inner hairline — the "printed" inset border real meishi often have */}
      <div
        style={{
          position: "absolute",
          inset: 8,
          border: "1px solid var(--border)",
          borderRadius: 2,
          pointerEvents: "none",
          opacity: 0.7,
        }}
      />

      {/* Header — role label + seal */}
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.28em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            fontWeight: 800,
          }}
        >
          {ROLE_LABEL}
        </div>
        {withSeal && <StampSeal label={initial(profile)} />}
      </div>

      {/* Identity stack — name → @username → SNS handle list, all left-aligned
          so visitors read it as a single contact block. */}
      <div style={{ position: "relative", marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <div className="vf-serif-display" style={{ fontWeight: 700, fontSize: 30, lineHeight: 1 }}>
            {displayName(profile)}
          </div>
          <div style={{ fontSize: 12, color: "var(--text-secondary)", marginTop: 4, fontWeight: 500 }}>
            @{profile.username}
          </div>
        </div>
        <SocialHandleList urls={socialLinks} />
      </div>

      {/* Bottom rail — flex-spacer above pushes this to the card floor */}
      <div style={{ flex: 1 }} />
      <div
        style={{
          position: "relative",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: 12,
          marginTop: 14,
          paddingTop: 10,
          borderTop: "1px solid var(--border)",
        }}
      >
        <Link
          href={`/${profile.username}`}
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.15em",
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            textDecoration: "none",
          }}
        >
          vibefolio.app/{profile.username}
        </Link>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            letterSpacing: "0.15em",
            color: "var(--text-muted)",
            whiteSpace: "nowrap",
          }}
        >
          No. {number} · {new Date().getFullYear()}
        </span>
      </div>
    </div>
  );
}

// Inline name card used in the mobile About section — same DNA as the
// big card but laid out so avatar + name sit on one row and the social
// handles stack below.
export function MeishiInline({
  profile,
  socialLinks = [],
  style,
}: {
  profile: MeishiProfile;
  socialLinks?: string[];
  style?: React.CSSProperties;
}) {
  const hasSocials = socialLinks.length > 0;
  return (
    <div
      style={{
        position: "relative",
        background: "var(--surface)",
        borderRadius: 4,
        boxShadow: "0 1px 0 rgba(0,0,0,0.04), 0 12px 28px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.08)",
        padding: "18px 20px",
        display: "flex",
        flexDirection: "column",
        gap: 14,
        overflow: "hidden",
        fontFamily: "var(--font-nunito)",
        ...style,
      }}
    >
      <div className="vf-paper-grain" />
      <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative" }}>
        <Avatar profile={profile} size={44} fontSize={18} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="vf-serif-display" style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}>
            {displayName(profile)}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, fontWeight: 500 }}>
            @{profile.username}
          </div>
        </div>
        <StampSeal size={28} label={initial(profile)} />
      </div>
      {hasSocials && (
        <div
          style={{
            position: "relative",
            paddingTop: 12,
            borderTop: "1px solid var(--border)",
          }}
        >
          <SocialHandleList urls={socialLinks} dotSize={20} fontSize={12} gap={6} />
        </div>
      )}
    </div>
  );
}

function Avatar({ profile, size, fontSize }: { profile: MeishiProfile; size: number; fontSize: number }) {
  if (profile.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.avatar_url}
        alt={displayName(profile)}
        width={size}
        height={size}
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          objectFit: "cover",
          flexShrink: 0,
          position: "relative",
        }}
      />
    );
  }
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: "var(--text-primary)",
        color: "var(--bg)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize,
        fontWeight: 900,
        flexShrink: 0,
        position: "relative",
      }}
    >
      {initial(profile)}
    </div>
  );
}

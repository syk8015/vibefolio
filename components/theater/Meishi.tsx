// Meishi (名刺) — the literal business-card identity element that
// anchors the Theater layout. Three variants:
//
//   • <MeishiSticker>  small peeling-corner sticker pinned to the stage
//   • <MeishiBig>      large pocket card sitting beside the stage on desktop
//   • <StampSeal>      tiny red 印 stamp, used as a personality accent

import Link from "next/link";

export type MeishiProfile = {
  username: string;
  name: string | null;
  avatar_url?: string | null;
  bio?: string | null;
};

const ROLE_LABEL = "Vibe coder";

function initial(p: MeishiProfile): string {
  return (p.name || p.username || "?").trim().charAt(0).toUpperCase();
}

function displayName(p: MeishiProfile): string {
  return p.name || p.username;
}

export function StampSeal({
  size = 38,
  label = "印",
  style,
}: {
  size?: number;
  label?: string;
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

// Small sticker pinned to the corner of the stage — reads as a peeled
// business card stuck onto the live demo.
export function MeishiSticker({ profile, style }: { profile: MeishiProfile; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        position: "relative",
        width: 130,
        height: 78,
        padding: "10px 12px",
        background: "var(--surface)",
        borderRadius: 4,
        boxShadow: "0 1px 0 rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.18), 0 1.5px 4px rgba(0,0,0,0.08)",
        fontFamily: "var(--font-nunito)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        ...style,
      }}
    >
      <div className="vf-paper-grain" />
      <div style={{ display: "flex", alignItems: "center", gap: 7, position: "relative" }}>
        <Avatar profile={profile} size={22} fontSize={11} />
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1, minWidth: 0 }}>
          <span
            style={{
              fontWeight: 800,
              fontSize: 12,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {displayName(profile)}
          </span>
          <span style={{ fontWeight: 500, fontSize: 9, color: "var(--text-muted)" }}>@{profile.username}</span>
        </div>
      </div>
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 8,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          position: "relative",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        vibefolio.app/{profile.username}
      </div>
    </div>
  );
}

// Large pocket-style card used as the identity centerpiece on desktop.
// Mirrors the proportions of a real Japanese meishi (1.68:1).
export function MeishiBig({
  profile,
  withSeal = true,
  number = "06",
  style,
}: {
  profile: MeishiProfile;
  withSeal?: boolean;
  number?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "1.68 / 1",
        background: "var(--surface)",
        borderRadius: 4,
        boxShadow: "0 1px 0 rgba(0,0,0,0.04), 0 18px 40px rgba(0,0,0,0.16), 0 3px 8px rgba(0,0,0,0.08)",
        padding: "22px 26px",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
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

      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
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
            {ROLE_LABEL} · 名刺
          </div>
          <div
            className="vf-serif-display"
            style={{
              fontWeight: 700,
              fontSize: 30,
              marginTop: 14,
              lineHeight: 1,
            }}
          >
            {displayName(profile)}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 6, fontWeight: 500 }}>
            @{profile.username}
          </div>
        </div>
        {withSeal && <StampSeal />}
      </div>

      <div style={{ position: "relative", display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
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
          }}
        >
          No. {number} · {new Date().getFullYear()}
        </span>
      </div>
    </div>
  );
}

// Inline name card used in the mobile About section — same DNA as the
// big card but laid out horizontally so it nests inside a body section.
export function MeishiInline({ profile, style }: { profile: MeishiProfile; style?: React.CSSProperties }) {
  return (
    <div
      style={{
        position: "relative",
        background: "var(--surface)",
        borderRadius: 4,
        boxShadow: "0 1px 0 rgba(0,0,0,0.04), 0 12px 28px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.08)",
        padding: "18px 20px",
        display: "flex",
        alignItems: "center",
        gap: 14,
        overflow: "hidden",
        fontFamily: "var(--font-nunito)",
        ...style,
      }}
    >
      <div className="vf-paper-grain" />
      <Avatar profile={profile} size={44} fontSize={18} />
      <div style={{ flex: 1, position: "relative", minWidth: 0 }}>
        <div
          className="vf-serif-display"
          style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.1 }}
        >
          {displayName(profile)}
        </div>
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, fontWeight: 500 }}>
          {ROLE_LABEL} · @{profile.username}
        </div>
      </div>
      <StampSeal size={28} />
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

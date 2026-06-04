// Meishi — the literal business-card identity element that anchors
// the Theater layout. Variants:
//
//   • <MeishiBig>      large pocket card sitting beside the stage on desktop
//   • <MeishiInline>   horizontal name-card used in the mobile About section
//   • <StampSeal>      red stamp accent; carries the owner's initial so it
//                      reads as a personal seal rather than a generic 印

import Link from "next/link";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
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
      className="vf-stamp-seal"
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
        boxShadow: "0 1px 3px rgba(0,0,0,0.18)",
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
// Two-column body: identity stack on the left, seal + QR on the right.
// min-height lets the card grow when the owner has many social handles
// so nothing clips.
export function MeishiBig({
  profile,
  profileUrl,
  socialLinks = [],
  withSeal = true,
  number = "06",
  style,
  showcase = false,
}: {
  profile: MeishiProfile;
  profileUrl: string;
  socialLinks?: string[];
  withSeal?: boolean;
  number?: string;
  style?: React.CSSProperties;
  // In the landing showcase the card's URL must not be a live link.
  showcase?: boolean;
}) {
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        minHeight: 290,
        background: "var(--surface)",
        borderRadius: 4,
        boxShadow: "var(--shadow-card-big)",
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

      {/* Role label — full-width header before the split body */}
      <div
        style={{
          position: "relative",
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

      {/* Split body: left = identity stack, right = seal + QR */}
      <div
        style={{
          position: "relative",
          marginTop: 14,
          display: "flex",
          gap: 16,
          flex: 1,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
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

        <div
          style={{
            flexShrink: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 12,
          }}
        >
          {withSeal && <StampSeal label={initial(profile)} />}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div
              style={{
                padding: 4,
                background: "var(--surface)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                display: "inline-flex",
              }}
              title={profileUrl}
            >
              <QRCodeSVG
                value={profileUrl}
                size={72}
                level="M"
                fgColor="var(--text-primary)"
                bgColor="transparent"
              />
            </div>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 8,
                letterSpacing: "0.2em",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              Scan
            </span>
          </div>
        </div>
      </div>

      {/* Bottom contact rail */}
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
        {showcase ? (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              letterSpacing: "0.15em",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
            }}
          >
            nookframe.com/{profile.username}
          </span>
        ) : (
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
            nookframe.com/{profile.username}
          </Link>
        )}
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
  profileUrl,
  socialLinks = [],
  bio,
  style,
}: {
  profile: MeishiProfile;
  profileUrl: string;
  socialLinks?: string[];
  // 슬림 About: 짧은 bio를 카드 안에 2줄 말줄임으로 동반(정체성 한 줄은 히어로에 있으므로 중복 회피).
  bio?: string | null;
  style?: React.CSSProperties;
}) {
  const hasSocials = socialLinks.length > 0;
  return (
    <div
      style={{
        position: "relative",
        background: "var(--surface)",
        borderRadius: 4,
        boxShadow: "var(--shadow-card-small)",
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

      {/* 짧은 bio — 2줄 말줄임. 정체성 한 줄(관찰형)은 히어로 오버레이에 이미 있으므로
          여기서는 자유형 소개만 압축해 보여준다. */}
      {bio && (
        <p
          style={{
            position: "relative",
            margin: 0,
            fontSize: 12.5,
            lineHeight: 1.6,
            color: "var(--text-secondary)",
            fontFamily: "var(--font-nunito)",
            fontWeight: 400,
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            whiteSpace: "pre-line",
          }}
        >
          {bio}
        </p>
      )}

      {/* Bottom rail: socials (or the card URL when there are none) on the left,
          a scannable QR on the right — gives the mobile card the same
          scan-to-visit affordance the desktop MeishiBig has. */}
      <div
        style={{
          position: "relative",
          paddingTop: 14,
          borderTop: "1px solid var(--border)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 14,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          {hasSocials ? (
            <SocialHandleList urls={socialLinks} dotSize={20} fontSize={12} gap={6} />
          ) : (
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: "0.12em",
                color: "var(--text-secondary)",
                textTransform: "uppercase",
                wordBreak: "break-all",
              }}
            >
              nookframe.com/{profile.username}
            </span>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <div
            style={{
              padding: 4,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              display: "inline-flex",
            }}
            title={profileUrl}
          >
            <QRCodeSVG
              value={profileUrl}
              size={60}
              level="M"
              fgColor="var(--text-primary)"
              bgColor="transparent"
            />
          </div>
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              letterSpacing: "0.2em",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            Scan
          </span>
        </div>
      </div>
    </div>
  );
}

function Avatar({ profile, size, fontSize }: { profile: MeishiProfile; size: number; fontSize: number }) {
  if (profile.avatar_url) {
    return (
      <Image
        src={profile.avatar_url}
        alt={displayName(profile)}
        width={size}
        height={size}
        unoptimized /* user-supplied avatar URL — skip optimizer (any host, no SSRF) */
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

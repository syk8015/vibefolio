"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { isReservedUsername } from "@/lib/reservedUsernames";
import { hasBlockedTerm } from "@/lib/nameFilter";
import {
  BIO_MAX, NAME_MAX, USERNAME_MAX, USERNAME_PATTERN,
  isValidUsername, normalizeUsername, usernameIlikePattern,
} from "@/lib/username";
// 링크 판정은 명함이 실제로 렌더하는 것과 같은 매처 하나만 쓴다 — 여기서 따로
// 넓게 인식해주면 "확인됐다"고 보여놓고 명함에선 조용히 버려진다.
import { getSocialMeta } from "@/components/SocialBadge";
import type { DashboardProfile } from "./DashboardClient";
import { useT } from "@/lib/i18n/client";

// 칸 이름표·도움말 — 이름표는 본문 글꼴 14px. 고정폭 글꼴(.vf-label)은 한글 사이를 벌려
// "표 시 이 름"처럼 띄엄띄엄 읽혔다(09-26 사용자 "가독성이 떨어지는 느낌").
const FIELD_LABEL: React.CSSProperties = {
  display: "block", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)",
  fontFamily: "var(--font-nunito)", marginBottom: 8,
};
const HELP: React.CSSProperties = {
  marginTop: 8, fontSize: "0.8125rem", lineHeight: 1.5, color: "var(--text-secondary)", fontFamily: "var(--font-nunito)",
};

function migrateOldLinks(profile: DashboardProfile): string[] {
  const links: string[] = [];
  if (profile.twitter) links.push(`https://twitter.com/${profile.twitter.replace("@", "")}`);
  if (profile.github) links.push(`https://github.com/${profile.github}`);
  return links;
}

// 명함 탭(옛 ProfileTab) — 남에게 보여줄 명함에 찍히는 것만 고친다. 로그인 방법·회원 탈퇴는
// 09-26에 설정 화면(/settings)으로 옮겼다. 상단 아이덴티티 미리보기는 헤더의 미니 명함(실물
// 문법)이 대체해서 여기선 폼만 남았다.
export default function CardTab({ user, profile }: { user: User; profile: DashboardProfile }) {
  const { t } = useT();
  // 폼의 초기값도 공개 명함이 읽는 profiles 행 — auth metadata는 표시 값의
  // 출처로 쓰지 않는다(둘이 갈라지면 대시보드와 명함의 이름이 달라진다).
  const existingLinks = profile.social_links?.length
    ? profile.social_links
    : migrateOldLinks(profile);

  const [form, setForm] = useState({
    name: profile.name || "",
    username: profile.username || user.email?.split("@")[0] || "",
    bio: profile.bio || "",
    avatarUrl: profile.avatar_url || "",
    socialLinks: existingLinks.length > 0 ? existingLinks : [""],
  });
  // 아이디 변경 경고 등 "저장된 username"이 필요한 곳에 쓴다 — 폼의 미저장 입력과 분리.
  const [savedUsername, setSavedUsername] = useState(profile.username || "");
  // 아바타는 선택 시 로컬 미리보기만 만들고, 실제 업로드는 저장 시점에 한다 —
  // 선택 즉시 올리면 저장 없이 떠났을 때 스토리지에 고아 파일이 남는다.
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name } = e.target;
    const value = name === "username" ? normalizeUsername(e.target.value) : e.target.value;
    setForm((prev) => ({ ...prev, [name]: value }));
    setSaved(false);
    setError("");
  }

  function handleLinkChange(index: number, value: string) {
    setForm((prev) => {
      const links = [...prev.socialLinks];
      links[index] = value;
      return { ...prev, socialLinks: links };
    });
    setSaved(false);
  }

  function addLink() {
    setForm((prev) => ({ ...prev, socialLinks: [...prev.socialLinks, ""] }));
    setSaved(false);
  }

  function removeLink(index: number) {
    setForm((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks.filter((_, i) => i !== index),
    }));
    setSaved(false);
  }

  function handleImagePick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError(t.card.imageTooLarge);
      return;
    }

    setError("");
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();

    const filteredLinks = form.socialLinks.filter((l) => l.trim());
    const username = normalizeUsername(form.username);

    if (!isValidUsername(username)) {
      setLoading(false);
      setError(t.onboarding.errors.usernameInvalid);
      return;
    }
    // 금지어는 바뀐 값만 본다 — 규칙이 생기기 전에 정한 아이디·이름(예: 운영 계정
    // claudehelp)이 명함 저장 자체를 막으면 안 된다.
    if (form.name !== (profile.name || "") && hasBlockedTerm(form.name, "name")) {
      setLoading(false);
      setError(t.onboarding.errors.nameBlocked);
      return;
    }
    if (isReservedUsername(username) || (username !== savedUsername && hasBlockedTerm(username, "username"))) {
      setLoading(false);
      setError(t.onboarding.errors.usernameReserved);
      return;
    }

    // Username is unique in profiles. The upsert below would reject a collision (caught
    // as 23505 there), but checking first gives a clear message and avoids writing the
    // new name into auth metadata when the profiles row can't take it. Exclude our own row.
    // 대소문자 무시 — DB 유일 인덱스가 lower(username)이다.
    const { data: takenBy } = await supabase
      .from("profiles").select("id").ilike("username", usernameIlikePattern(username)).neq("id", user.id).limit(1);
    if (takenBy?.length) {
      setLoading(false);
      setError(t.onboarding.errors.usernameTaken);
      return;
    }

    // 미뤄둔 아바타 업로드 — 저장이 확정되는 지금만 스토리지에 쓴다.
    let avatarUrl = form.avatarUrl;
    if (avatarFile) {
      const ext = avatarFile.name.split(".").pop();
      const path = `${user.id}/avatar.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, avatarFile, { upsert: true });
      if (uploadError) {
        setLoading(false);
        setError(t.card.avatarUploadFailed);
        return;
      }
      // 경로가 매번 같아서(upsert로 덮음) 주소도 같다 — ?v=를 붙이지 않으면 브라우저·CDN
      // 캐시가 옛 사진을 계속 보여 준다(B13).
      avatarUrl = `${supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
    }

    // 공개 명함이 읽는 profiles를 먼저 커밋한다. metadata부터 쓰면 반쪽 실패 시
    // 대시보드(새 이름)와 명함(옛 이름)이 갈라진 채 남는다.
    const { error: profileErr } = await supabase.from("profiles").upsert({
      id: user.id,
      username,
      name: form.name,
      bio: form.bio,
      avatar_url: avatarUrl,
      social_links: filteredLinks,
      updated_at: new Date().toISOString(),
    });
    if (profileErr) {
      // Don't claim "saved" when the row write failed (e.g. a taken username) — the
      // profile the public card reads from would be stale/absent.
      setLoading(false);
      setError(
        profileErr.code === "23505"
          ? t.onboarding.errors.usernameTaken
          : t.onboarding.errors.saveAuth,
      );
      return;
    }

    // metadata는 파생 사본(온보딩 게이트·로그인 직후 폴백용) — 진실은 위에서
    // 이미 저장됐으므로, 여기 실패가 저장 실패로 표시되면 안 된다.
    await supabase.auth
      .updateUser({
        data: {
          name: form.name,
          username,
          bio: form.bio,
          avatar_url: avatarUrl,
          social_links: filteredLinks,
        },
      })
      .catch(() => {});

    setForm((prev) => ({ ...prev, username, avatarUrl }));
    setAvatarFile(null);
    setSavedUsername(username);
    setLoading(false);
    setSaved(true);
    // 헤더는 서버가 내려준 profiles 값을 그리므로, 같은 값을 보도록 재렌더.
    router.refresh();
  }

  const avatarInitial = (form.name || form.username || "?").charAt(0).toUpperCase();
  const bioCount = form.bio.length;
  const displayAvatar = avatarPreview ?? form.avatarUrl;

  return (
    // 제목 있는 카드 두 장(09-26 사용자 확정 "B안 수정", 시안=claude.ai/artifact/JG1rHep7VpWvfWbBBJo6og).
    // 한 폼을 두 칸으로 반씩 자르면 칸 높이가 달라 눈이 지그재그로 움직였다 — 무리마다 카드로 묶고
    // PC는 나란히(스크롤이 거의 없다), 폰은 위아래로.
    <form onSubmit={handleSave} className="flex flex-col gap-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        <Panel title={t.card.basicTitle} body={t.card.basicBody}>
          {/* 사진 — 큰 아이덴티티 미리보기는 헤더의 미니 명함이 맡는다(감사 A10). */}
          <div>
            <span style={FIELD_LABEL}>{t.card.avatarLabel}</span>
            <div className="flex items-center gap-3">
              <div
                className="relative w-12 h-12 rounded-full flex items-center justify-center overflow-hidden shrink-0"
                style={{
                  background: "var(--surface-soft)",
                  color: "var(--text-primary)",
                  fontFamily: "var(--font-serif), 'Noto Serif KR', serif",
                  fontSize: "1.1rem",
                  fontWeight: 500,
                }}
              >
                {displayAvatar
                  ? <Image src={displayAvatar} alt="avatar" fill sizes="48px" unoptimized className="object-cover" />
                  : avatarInitial}
              </div>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
              <button type="button" onClick={() => fileInputRef.current?.click()} className="vf-button-ghost" style={{ fontSize: "0.875rem" }}>
                {displayAvatar ? t.card.changeImage : t.card.uploadImage}
              </button>
            </div>
            <p style={HELP}>{avatarFile ? t.card.avatarPendingNote : t.card.photoHelp}</p>
          </div>

          <div>
            <label htmlFor="card-name" style={FIELD_LABEL}>{t.card.nameLabel}</label>
            <input id="card-name" className="vf-input" name="name" type="text"
              placeholder={t.signup.namePlaceholder} value={form.name} onChange={handleChange} maxLength={NAME_MAX} />
          </div>

          <div>
            <label htmlFor="card-username" style={FIELD_LABEL}>{t.card.usernameLabel}</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>@</span>
              <input id="card-username" className="vf-input vf-mono" style={{ paddingLeft: "1.75rem" }}
                name="username" type="text" placeholder="alexvibe"
                value={form.username} onChange={handleChange}
                pattern={USERNAME_PATTERN} title={t.auth.usernamePattern} maxLength={USERNAME_MAX}
                autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="off" />
            </div>
            <p style={HELP}>
              {t.card.cardAddress}{" "}
              <span className="vf-mono" style={{ color: "var(--text-primary)", overflowWrap: "anywhere" }}>nookframe.com/{form.username || "username"}</span>
            </p>
            {/* 아이디를 바꾸면 옛 주소는 바로 404다(옛 주소 이어주기 없음) — 저장 전에 알린다(C11). */}
            {savedUsername && form.username && form.username !== savedUsername && (
              <p role="note" style={{ ...HELP, color: "var(--danger)" }}>
                {t.card.usernameChangeWarning(savedUsername)}
              </p>
            )}
          </div>
        </Panel>

        <Panel title={t.card.aboutTitle} body={t.card.aboutBody}>
          <div>
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="card-bio" style={FIELD_LABEL}>{t.card.bioLabel}</label>
              <span className="vf-mono" style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{bioCount}/{BIO_MAX}</span>
            </div>
            <textarea
              id="card-bio"
              className="vf-input"
              name="bio"
              placeholder={t.onboarding.bioPlaceholder}
              value={form.bio}
              onChange={handleChange}
              rows={3}
              maxLength={BIO_MAX}
              style={{ resize: "vertical", lineHeight: 1.55 }}
            />
          </div>

          <div>
            <span style={FIELD_LABEL}>{t.card.socialLabel}</span>
            <div className="flex flex-col gap-3">
              {form.socialLinks.map((link, i) => {
                const detected = link.trim() ? getSocialMeta(link) : null;
                return (
                  <div key={i} className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <input
                        className="vf-input flex-1 min-w-0"
                        type="text"
                        placeholder="https://instagram.com/username"
                        aria-label={t.card.socialLabel}
                        value={link}
                        onChange={(e) => handleLinkChange(i, e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => removeLink(i)}
                        className="vf-icon-button w-9 h-9 text-base flex-shrink-0"
                        style={{ color: "var(--text-muted)" }}
                        aria-label={t.card.removeLink}
                      >
                        ×
                      </button>
                    </div>
                    {link.trim() && (detected ? (
                      <p className="pl-1 vf-mono" style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", letterSpacing: "0.02em" }}>
                        · {detected.name} {detected.handle}
                      </p>
                    ) : (
                      <p className="pl-1" style={{ ...HELP, marginTop: 0, color: "var(--danger)" }}>
                        {t.card.unrecognizedLink}
                      </p>
                    ))}
                  </div>
                );
              })}
              <button type="button" onClick={addLink} className="vf-button-text w-fit">
                <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>+</span> {t.card.addLink}
              </button>
            </div>
          </div>
        </Panel>
      </div>

      {/* 저장 — PC는 오른쪽 아래(결과 문구는 버튼 왼쪽). 폰은 화면 아래에 붙는다(토스 BottomCTA) —
          카드 두 장이 위아래로 쌓여 길어서, 끝까지 내려가야 버튼이 보였다. */}
      <div
        className="flex flex-col-reverse md:flex-row-reverse md:items-center gap-3 max-md:sticky max-md:bottom-0 max-md:-mx-6 max-md:px-6 max-md:py-3 max-md:border-t"
        style={{ background: "var(--bg)", borderColor: "var(--border)" }}
      >
        <button
          type="submit"
          disabled={loading}
          className="vf-button-primary max-md:w-full"
          style={{ fontSize: "0.9375rem", cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? t.card.saving : t.card.save}
        </button>
        {saved && (
          <span role="status" className="text-sm flex items-center gap-1.5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <path d="M2.5 7l3 3 6-6.5" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {t.card.savedMsg}
          </span>
        )}
        {error && (
          <span role="alert" className="text-sm" style={{ color: "var(--danger)", fontFamily: "var(--font-nunito)" }}>
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

// 무리 하나 — 흰 카드 + 제목·설명(토스 ListHeader). 크림 바탕 위라 --shadow-panel로 띄운다.
function Panel({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl p-6 flex flex-col gap-6" style={{ background: "var(--surface)", boxShadow: "var(--shadow-panel)" }}>
      <header className="flex flex-col gap-1">
        <h2 style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 700, letterSpacing: "-0.01em", color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
          {title}
        </h2>
        <p style={{ margin: 0, fontSize: "0.8125rem", lineHeight: 1.5, color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
          {body}
        </p>
      </header>
      {children}
    </section>
  );
}

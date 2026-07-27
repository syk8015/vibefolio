"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
// 링크 판정은 명함이 실제로 렌더하는 것과 같은 매처 하나만 쓴다 — 여기서 따로
// 넓게 인식해주면 "확인됐다"고 보여놓고 명함에선 조용히 버려진다.
import { getSocialMeta } from "@/components/SocialBadge";
import type { DashboardProfile } from "./DashboardClient";

function migrateOldLinks(profile: DashboardProfile): string[] {
  const links: string[] = [];
  if (profile.twitter) links.push(`https://twitter.com/${profile.twitter.replace("@", "")}`);
  if (profile.github) links.push(`https://github.com/${profile.github}`);
  return links;
}

export default function ProfileTab({ user, profile }: { user: User; profile: DashboardProfile }) {
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
  // 탈퇴 확인 등 "저장된 username"이 필요한 곳에 쓴다 — 폼의 미저장 입력과 분리.
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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
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
      setError("이미지는 5MB 이하만 업로드할 수 있어요.");
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

    // Username is unique in profiles. The upsert below would reject a collision (caught
    // as 23505 there), but checking first gives a clear message and avoids writing the
    // new name into auth metadata when the profiles row can't take it. Exclude our own row.
    const { data: takenBy } = await supabase
      .from("profiles").select("id").eq("username", form.username).neq("id", user.id).maybeSingle();
    if (takenBy) {
      setLoading(false);
      setError("이미 사용 중인 username이에요. 다른 걸 입력해주세요.");
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
        setError("이미지 업로드에 실패했어요. 잠시 후 다시 시도해주세요.");
        return;
      }
      avatarUrl = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
    }

    // 공개 명함이 읽는 profiles를 먼저 커밋한다. metadata부터 쓰면 반쪽 실패 시
    // 대시보드(새 이름)와 명함(옛 이름)이 갈라진 채 남는다.
    const { error: profileErr } = await supabase.from("profiles").upsert({
      id: user.id,
      username: form.username,
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
          ? "이미 사용 중인 username이에요. 다른 걸 입력해주세요."
          : "저장 중 오류가 발생했어요. 다시 시도해주세요.",
      );
      return;
    }

    // metadata는 파생 사본(온보딩 게이트·로그인 직후 폴백용) — 진실은 위에서
    // 이미 저장됐으므로, 여기 실패가 저장 실패로 표시되면 안 된다.
    await supabase.auth
      .updateUser({
        data: {
          name: form.name,
          username: form.username,
          bio: form.bio,
          avatar_url: avatarUrl,
          social_links: filteredLinks,
        },
      })
      .catch(() => {});

    setForm((prev) => ({ ...prev, avatarUrl }));
    setAvatarFile(null);
    setSavedUsername(form.username);
    setLoading(false);
    setSaved(true);
    // 헤더는 서버가 내려준 profiles 값을 그리므로, 같은 값을 보도록 재렌더.
    router.refresh();
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "탈퇴 처리에 실패했어요.");
      }
      // Account + data are gone — drop the local session and leave.
      await createClient().auth.signOut();
      router.push("/");
      router.refresh();
    } catch (err) {
      setDeleting(false);
      setDeleteError(err instanceof Error ? err.message : "탈퇴 처리에 실패했어요.");
    }
  }

  const avatarInitial = (form.name || form.username).charAt(0).toUpperCase();
  const displayName = form.name || form.username || "이름";
  const bioCount = form.bio.length;
  const displayAvatar = avatarPreview ?? form.avatarUrl;

  return (
    <div className="flex flex-col gap-8 max-w-lg mx-auto w-full">
      <form onSubmit={handleSave} className="flex flex-col gap-8">

      {/* Identity preview — serif display */}
      <div className="text-center pb-2">
        <div
          className="relative mx-auto mb-5 w-28 h-28 rounded-full flex items-center justify-center overflow-hidden"
          style={{
            background: "var(--surface-soft)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-serif), 'Noto Serif KR', serif",
            fontSize: "2.25rem",
            fontWeight: 500,
          }}
        >
          {displayAvatar
            ? <Image src={displayAvatar} alt="avatar" fill sizes="112px" unoptimized className="object-cover" />
            : avatarInitial}
        </div>
        <p
          className="vf-serif-display"
          style={{ fontSize: "clamp(1.4rem, 3vw, 1.85rem)", fontWeight: 500, margin: 0, marginBottom: "0.35rem" }}
        >
          {displayName}
        </p>
        <p className="vf-mono" style={{ color: "var(--text-secondary)", fontSize: "0.85rem", letterSpacing: "0.02em" }}>
          @{form.username || "username"}
        </p>
      </div>

      {/* Avatar upload */}
      <div>
        <label className="vf-label">프로필 이미지</label>
        <div className="flex items-center gap-3 flex-wrap">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImagePick} />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="vf-button-ghost"
          >
            {displayAvatar ? "이미지 변경" : "이미지 업로드"}
          </button>
          <p className="text-xs vf-mono" style={{ color: "var(--text-muted)" }}>
            JPG · PNG · GIF · 최대 5MB
          </p>
          {avatarFile && (
            <p className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
              저장하기를 누르면 반영돼요
            </p>
          )}
        </div>
      </div>

      {/* Name */}
      <div>
        <label className="vf-label">표시 이름</label>
        <input className="vf-input" name="name" type="text"
          placeholder="홍길동" value={form.name} onChange={handleChange} />
      </div>

      {/* Username */}
      <div>
        <label className="vf-label">사용자 이름</label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm pointer-events-none"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono), monospace" }}>@</span>
          <input className="vf-input vf-mono" style={{ paddingLeft: "1.75rem" }}
            name="username" type="text" placeholder="alexvibe"
            value={form.username} onChange={handleChange}
            pattern="[a-zA-Z0-9_-]+" title="영문, 숫자, _-만 사용 가능해요" />
        </div>
        <p className="text-xs mt-2 vf-mono" style={{ color: "var(--text-muted)", letterSpacing: "0.02em" }}>
          nookframe.com/<span style={{ color: "var(--text-secondary)" }}>{form.username || "username"}</span>
        </p>
      </div>

      {/* Bio */}
      <div>
        <label className="vf-label">한 줄 소개</label>
        <textarea
          className="vf-input"
          name="bio"
          placeholder="바이브코딩으로 아이디어를 현실로 만들고 있어요."
          value={form.bio}
          onChange={handleChange}
          rows={3}
          maxLength={140}
          style={{ resize: "vertical", lineHeight: 1.55 }}
        />
        <p className="text-xs mt-2 vf-mono text-right" style={{ color: "var(--text-muted)" }}>
          {bioCount} / 140
        </p>
      </div>

      {/* Social Links */}
      <div>
        <label className="vf-label">소셜 링크</label>
        <div className="flex flex-col gap-3">
          {form.socialLinks.map((link, i) => {
            const detected = link.trim() ? getSocialMeta(link) : null;
            return (
              <div key={i} className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <input
                    className="vf-input flex-1"
                    type="text"
                    placeholder="https://instagram.com/username"
                    value={link}
                    onChange={(e) => handleLinkChange(i, e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => removeLink(i)}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-base transition-colors flex-shrink-0"
                    style={{ color: "var(--text-muted)", background: "var(--surface-soft)", border: "none", cursor: "pointer" }}
                    aria-label="링크 삭제"
                  >
                    ×
                  </button>
                </div>
                {link.trim() && (detected ? (
                  <p className="text-xs pl-1 vf-mono" style={{ color: "var(--text-secondary)", letterSpacing: "0.02em" }}>
                    · {detected.name} {detected.handle}
                  </p>
                ) : (
                  <p className="text-xs pl-1" style={{ color: "var(--danger)", fontFamily: "var(--font-nunito)", lineHeight: 1.6 }}>
                    아직 인식되지 않는 주소예요 — 명함에는 Instagram · X · GitHub · LinkedIn · YouTube · TikTok · Facebook · Threads 링크만 표시돼요.
                  </p>
                ))}
              </div>
            );
          })}
          <button
            type="button"
            onClick={addLink}
            className="flex items-center gap-1.5 text-sm w-fit transition-opacity hover:opacity-70"
            style={{ color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-nunito)", padding: 0 }}
          >
            <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>+</span> 링크 추가
          </button>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2 flex-wrap">
        <button
          type="submit"
          disabled={loading}
          className="vf-button-primary"
          style={{ cursor: loading ? "not-allowed" : "pointer" }}
        >
          {loading ? "저장 중…" : "저장하기"}
        </button>
        {saved && (
          <span className="text-sm flex items-center gap-1.5" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2.5 7l3 3 6-6.5" stroke="var(--text-primary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            저장됐어요
          </span>
        )}
        {error && (
          <span className="text-sm" style={{ color: "#b34747", fontFamily: "var(--font-nunito)" }}>
            {error}
          </span>
        )}
      </div>
      </form>

      {/* Danger zone — account deletion (privacy: 탈퇴 즉시 파기) */}
      <div className="rounded-2xl p-5" style={{ border: "1px solid rgba(179,71,71,0.35)", background: "rgba(179,71,71,0.045)" }}>
        <h3 className="text-sm font-black mb-1.5" style={{ color: "#b34747", fontFamily: "var(--font-nunito)" }}>위험 구역</h3>
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.65 }}>
          회원 탈퇴 시 프로필과 모든 프로젝트·업로드한 파일이{" "}
          <strong style={{ color: "var(--text-primary)" }}>즉시·영구 삭제</strong>되며, 되돌릴 수 없어요.
        </p>
        <button
          type="button"
          onClick={() => { setShowDeleteModal(true); setDeleteConfirm(""); setDeleteError(""); }}
          className="text-sm font-bold px-4 py-2.5 rounded-xl transition-opacity hover:opacity-80"
          style={{ color: "#b34747", background: "rgba(179,71,71,0.08)", border: "1px solid rgba(179,71,71,0.3)", cursor: "pointer", fontFamily: "var(--font-nunito)" }}
        >
          회원 탈퇴
        </button>
      </div>

      {/* Confirmation modal */}
      {showDeleteModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.55)" }}
          onClick={() => { if (!deleting) setShowDeleteModal(false); }}
        >
          <div
            className="w-full max-w-sm rounded-2xl p-6"
            style={{ background: "var(--surface)", border: "1px solid var(--border-bright)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
              정말 탈퇴하시겠어요?
            </h3>
            <p className="text-sm mb-4" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", lineHeight: 1.65 }}>
              <strong style={{ color: "var(--text-primary)" }}>@{savedUsername}</strong>의 프로필과 모든 프로젝트·업로드 파일이 즉시·영구 삭제돼요. 이 작업은 되돌릴 수 없어요.
            </p>
            {/* 확인 문자열은 "저장된" username — 폼에 고쳐 쓰고 저장 안 한 값과
                비교하면 존재하지 않는 이름을 타이핑하라고 요구하게 된다. */}
            <label className="vf-label">
              확인을 위해 <span style={{ color: "var(--text-primary)" }}>{savedUsername}</span> 를 입력해주세요
            </label>
            <input
              className="vf-input"
              value={deleteConfirm}
              onChange={(e) => { setDeleteConfirm(e.target.value); setDeleteError(""); }}
              placeholder={savedUsername}
              autoComplete="off"
              disabled={deleting}
              autoFocus
            />
            {deleteError && (
              <p className="text-sm mt-2" style={{ color: "#b34747", fontFamily: "var(--font-nunito)" }}>{deleteError}</p>
            )}
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowDeleteModal(false)}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-opacity hover:opacity-80"
                style={{ background: "var(--surface-soft)", color: "var(--text-primary)", border: "none", cursor: deleting ? "not-allowed" : "pointer", fontFamily: "var(--font-nunito)" }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || deleteConfirm.trim() !== savedUsername}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-opacity"
                style={{ background: "#b34747", color: "#fff", border: "none", cursor: (deleting || deleteConfirm.trim() !== savedUsername) ? "not-allowed" : "pointer", opacity: (deleting || deleteConfirm.trim() !== savedUsername) ? 0.5 : 1, fontFamily: "var(--font-nunito)" }}
              >
                {deleting ? "탈퇴 중…" : "영구 삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

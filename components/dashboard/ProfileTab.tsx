"use client";

import { useState, useRef } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

function detectPlatform(url: string): { platform: string; handle: string } | null {
  if (!url.trim()) return null;
  try {
    const normalized = url.startsWith("http") ? url : `https://${url}`;
    const u = new URL(normalized);
    const host = u.hostname.replace("www.", "");
    const path = u.pathname.replace(/^\/+/, "").replace(/\/+$/, "");

    if (host === "instagram.com") return { platform: "Instagram", handle: `@${path}` };
    if (host === "twitter.com" || host === "x.com") return { platform: "X (Twitter)", handle: `@${path.replace("@", "")}` };
    if (host === "github.com") return { platform: "GitHub", handle: `@${path}` };
    if (host.includes("linkedin.com")) {
      const parts = path.split("/");
      const idx = parts.indexOf("in");
      return { platform: "LinkedIn", handle: `@${idx >= 0 ? parts[idx + 1] : path}` };
    }
    if (host === "youtube.com" || host === "youtu.be") {
      return { platform: "YouTube", handle: path.startsWith("@") ? path : `@${path}` };
    }
    if (host === "tiktok.com") return { platform: "TikTok", handle: path.startsWith("@") ? path : `@${path}` };
    if (host === "facebook.com") return { platform: "Facebook", handle: `@${path}` };
    if (host === "threads.net") return { platform: "Threads", handle: `@${path.replace("@", "")}` };
    return { platform: host, handle: `/${path}` };
  } catch {
    return null;
  }
}

function migrateOldLinks(meta: Record<string, unknown>): string[] {
  const links: string[] = [];
  if (meta.twitter) links.push(`https://twitter.com/${String(meta.twitter).replace("@", "")}`);
  if (meta.github) links.push(`https://github.com/${meta.github}`);
  return links;
}

export default function ProfileTab({ user }: { user: User }) {
  const meta = user.user_metadata || {};
  const existingLinks = Array.isArray(meta.social_links) && meta.social_links.length > 0
    ? (meta.social_links as string[])
    : migrateOldLinks(meta);

  const [form, setForm] = useState({
    name: (meta.name as string) || "",
    username: (meta.username as string) || user.email?.split("@")[0] || "",
    bio: (meta.bio as string) || "",
    avatarUrl: (meta.avatar_url as string) || "",
    socialLinks: existingLinks.length > 0 ? existingLinks : [""],
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
  }

  function removeLink(index: number) {
    setForm((prev) => ({
      ...prev,
      socialLinks: prev.socialLinks.filter((_, i) => i !== index),
    }));
    setSaved(false);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("이미지는 5MB 이하만 업로드할 수 있어요.");
      return;
    }

    setUploading(true);
    setError("");
    const supabase = createClient();
    const ext = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) {
      setError("이미지 업로드 실패. Supabase Storage 설정을 확인해주세요.");
      setUploading(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
    setForm((prev) => ({ ...prev, avatarUrl: publicUrl }));
    setUploading(false);
    setSaved(false);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();

    const filteredLinks = form.socialLinks.filter((l) => l.trim());

    const { error: authErr } = await supabase.auth.updateUser({
      data: {
        name: form.name,
        username: form.username,
        bio: form.bio,
        avatar_url: form.avatarUrl,
        social_links: filteredLinks,
      },
    });

    if (authErr) {
      setLoading(false);
      setError("저장 중 오류가 발생했어요. 다시 시도해주세요.");
      return;
    }

    await supabase.from("profiles").upsert({
      id: user.id,
      username: form.username,
      name: form.name,
      bio: form.bio,
      avatar_url: form.avatarUrl,
      social_links: filteredLinks,
      updated_at: new Date().toISOString(),
    });

    setLoading(false);
    setSaved(true);
  }

  const avatarInitial = (form.name || form.username).charAt(0).toUpperCase();

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-lg mx-auto w-full">

      {/* Avatar */}
      <div>
        <Label>프로필 이미지</Label>
        <div className="flex items-center gap-4 mt-2">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black overflow-hidden flex-shrink-0"
            style={{ background: "linear-gradient(135deg, var(--blue), var(--blue-bright))", color: "var(--bg)", fontFamily: "var(--font-nunito)" }}
          >
            {form.avatarUrl
              ? <img src={form.avatarUrl} alt="avatar" className="w-full h-full object-cover" />
              : avatarInitial}
          </div>
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-opacity hover:opacity-75 disabled:opacity-50"
              style={{ border: "1px solid var(--border-bright)", color: "var(--text-primary)", background: "var(--surface)", fontFamily: "var(--font-nunito)", cursor: uploading ? "not-allowed" : "pointer" }}
            >
              {uploading ? "업로드 중..." : "이미지 업로드"}
            </button>
            <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              JPG, PNG, GIF · 최대 5MB
            </p>
          </div>
        </div>
      </div>

      {/* Name */}
      <div>
        <Label>이름</Label>
        <input className="vf-input mt-1.5" name="name" type="text"
          placeholder="홍길동" value={form.name} onChange={handleChange} />
      </div>

      {/* Username */}
      <div>
        <Label>사용자 이름</Label>
        <div className="relative mt-1.5">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
            style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>@</span>
          <input className="vf-input" style={{ paddingLeft: "1.75rem" }}
            name="username" type="text" placeholder="alexvibe"
            value={form.username} onChange={handleChange}
            pattern="[a-zA-Z0-9_-]+" title="영문, 숫자, _-만 사용 가능해요" />
        </div>
        <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
          vibefolio.com/{form.username || "username"}
        </p>
      </div>

      {/* Bio */}
      <div>
        <Label>한 줄 소개</Label>
        <textarea
          className="vf-input mt-1.5"
          name="bio"
          placeholder="바이브코딩으로 아이디어를 현실로 만들고 있어요."
          value={form.bio}
          onChange={handleChange}
          rows={3}
          style={{ resize: "vertical" }}
        />
      </div>

      {/* Social Links */}
      <div>
        <Label>소셜 링크</Label>
        <div className="flex flex-col gap-3 mt-1.5">
          {form.socialLinks.map((link, i) => {
            const detected = detectPlatform(link);
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
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-lg transition-opacity hover:opacity-70 flex-shrink-0"
                    style={{ color: "var(--text-muted)", background: "var(--surface)", border: "1px solid var(--border)", cursor: "pointer" }}
                  >
                    ×
                  </button>
                </div>
                {detected && link.trim() && (
                  <p className="text-xs pl-1 font-bold" style={{ color: "var(--blue)", fontFamily: "var(--font-nunito)" }}>
                    {detected.platform} {detected.handle}
                  </p>
                )}
              </div>
            );
          })}
          <button
            type="button"
            onClick={addLink}
            className="flex items-center gap-1.5 text-sm font-bold w-fit transition-opacity hover:opacity-70"
            style={{ color: "var(--text-secondary)", background: "none", border: "none", cursor: "pointer", fontFamily: "var(--font-nunito)", padding: 0 }}
          >
            <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>+</span> 링크 추가
          </button>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 rounded-xl text-sm font-black transition-opacity hover:opacity-85 disabled:opacity-50"
          style={{ background: "var(--blue)", color: "var(--bg)", fontFamily: "var(--font-nunito)", border: "none", cursor: loading ? "not-allowed" : "pointer", boxShadow: "0 0 16px var(--blue-glow)" }}
        >
          {loading ? "저장 중..." : "저장하기"}
        </button>
        {saved && (
          <span className="text-sm font-bold" style={{ color: "var(--blue)", fontFamily: "var(--font-nunito)" }}>
            ✓ 저장됐어요
          </span>
        )}
        {error && (
          <span className="text-sm font-bold" style={{ color: "#ef4444", fontFamily: "var(--font-nunito)" }}>
            {error}
          </span>
        )}
      </div>
    </form>
  );
}

function Label({ children }: { children: string }) {
  return (
    <label className="block text-xs font-bold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
      {children}
    </label>
  );
}

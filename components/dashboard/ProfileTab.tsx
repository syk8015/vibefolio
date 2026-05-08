"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export default function ProfileTab({ user }: { user: User }) {
  const meta = user.user_metadata || {};
  const [form, setForm] = useState({
    name: meta.name || "",
    username: meta.username || user.email?.split("@")[0] || "",
    bio: meta.bio || "",
    twitter: meta.twitter || "",
    github: meta.github || "",
  });
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setSaved(false);
    setError("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const supabase = createClient();

    const { error: authErr } = await supabase.auth.updateUser({ data: form });
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
      twitter: form.twitter,
      github: form.github,
      updated_at: new Date().toISOString(),
    });

    setLoading(false);
    setSaved(true);
  }

  return (
    <form onSubmit={handleSave} className="flex flex-col gap-6 max-w-lg">

      {/* Avatar placeholder */}
      <div>
        <Label>프로필 이미지</Label>
        <div className="flex items-center gap-4 mt-2">
          <div
            className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-black"
            style={{ background: "linear-gradient(135deg, var(--blue), var(--blue-bright))", color: "#fff", fontFamily: "var(--font-nunito)" }}
          >
            {(form.name || form.username).charAt(0).toUpperCase()}
          </div>
          <div>
            <button
              type="button"
              className="px-4 py-2 rounded-xl text-sm font-bold transition-opacity hover:opacity-75"
              style={{ border: "1px solid var(--border-bright)", color: "var(--text-primary)", background: "var(--surface)", fontFamily: "var(--font-nunito)", cursor: "pointer" }}
            >
              이미지 업로드
            </button>
            <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              JPG, PNG, GIF · 최대 5MB
            </p>
          </div>
        </div>
      </div>

      <div>
        <Label>이름</Label>
        <input className="vf-input mt-1.5" name="name" type="text"
          placeholder="홍길동" value={form.name} onChange={handleChange} />
      </div>

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

      <div>
        <Label>소셜 링크</Label>
        <div className="flex flex-col gap-2.5 mt-1.5">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold pointer-events-none w-16 text-right"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>Twitter</span>
            <input className="vf-input" style={{ paddingLeft: "5rem" }}
              name="twitter" type="text" placeholder="@username"
              value={form.twitter} onChange={handleChange} />
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold pointer-events-none w-16 text-right"
              style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>GitHub</span>
            <input className="vf-input" style={{ paddingLeft: "5rem" }}
              name="github" type="text" placeholder="username"
              value={form.github} onChange={handleChange} />
          </div>
        </div>
      </div>

      {/* Save button */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 rounded-xl text-sm font-black transition-opacity hover:opacity-85 disabled:opacity-50"
          style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", border: "none", cursor: loading ? "not-allowed" : "pointer", boxShadow: "0 0 16px var(--blue-glow)" }}
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

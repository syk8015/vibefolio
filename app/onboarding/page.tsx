"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function OnboardingPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", username: "", bio: "" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setError("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    // Check username uniqueness
    const { data: existing } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", form.username)
      .single();

    if (existing) {
      setError("이미 사용 중인 username이에요. 다른 걸 입력해주세요.");
      setLoading(false);
      return;
    }

    // Save to auth metadata
    const { error: authErr } = await supabase.auth.updateUser({
      data: { name: form.name, username: form.username, bio: form.bio },
    });

    if (authErr) {
      setError("저장 중 오류가 발생했어요. 다시 시도해주세요.");
      setLoading(false);
      return;
    }

    // Save to profiles table
    await supabase.from("profiles").upsert({
      id: user.id,
      username: form.username,
      name: form.name,
      bio: form.bio,
      updated_at: new Date().toISOString(),
    });

    router.push("/");
    router.refresh();
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "var(--bg)" }}>

      {/* Logo */}
      <div className="flex items-center gap-2 mb-12">
        <div className="w-2 h-2 rounded-full" style={{ background: "var(--blue)", boxShadow: "0 0 8px var(--blue)" }} />
        <span className="font-black text-base" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)" }}>
          Vibefolio
        </span>
      </div>

      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-black mb-2" style={{ color: "var(--text-primary)", fontFamily: "var(--font-nunito)", letterSpacing: "-0.02em" }}>
            명함을 만들어볼게요
          </h1>
          <p className="text-sm font-semibold" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
            기본 정보를 입력해주세요. 나중에 언제든 바꿀 수 있어요.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <Field label="이름">
            <input className="vf-input" type="text" name="name"
              placeholder="홍길동" value={form.name} onChange={handleChange} required autoFocus />
          </Field>

          <Field label="사용자 이름 (URL)">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold pointer-events-none"
                style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>@</span>
              <input className="vf-input" style={{ paddingLeft: "1.75rem" }}
                type="text" name="username" placeholder="alexvibe"
                value={form.username} onChange={handleChange} required
                pattern="[a-zA-Z0-9_-]+" title="영문, 숫자, _-만 사용 가능해요" />
            </div>
            {form.username && (
              <p className="mt-1.5 text-xs font-semibold" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
                vibefolio.com/<span style={{ color: "var(--blue)" }}>{form.username}</span>
              </p>
            )}
          </Field>

          <Field label="한 줄 소개 (선택)">
            <textarea className="vf-input" name="bio"
              placeholder="바이브코딩으로 아이디어를 현실로 만들고 있어요."
              value={form.bio} onChange={handleChange} rows={2} style={{ resize: "none" }} />
          </Field>

          {error && (
            <p className="text-sm font-semibold text-center py-2 px-3 rounded-xl"
              style={{ color: "#ef4444", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", fontFamily: "var(--font-nunito)" }}>
              {error}
            </p>
          )}

          <button type="submit" disabled={loading}
            className="w-full py-3.5 rounded-xl font-black text-sm mt-2 transition-opacity hover:opacity-85 disabled:opacity-50"
            style={{ background: "var(--blue)", color: "#fff", fontFamily: "var(--font-nunito)", cursor: loading ? "not-allowed" : "pointer", border: "none", boxShadow: "0 0 20px var(--blue-glow)" }}>
            {loading ? "저장 중..." : "시작하기 →"}
          </button>
        </form>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-bold mb-1.5"
        style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", letterSpacing: "0.05em" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

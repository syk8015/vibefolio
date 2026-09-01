// Nookframe Connect 마이그레이션 검증 프로브.
// 사용: supabase/migration_api_ingest.sql 를 SQL 에디터에 적용한 뒤 실행.
//   node scripts/probe-api-ingest.mjs
// 단언: (1) api_tokens 존재 (2) projects.is_draft 존재 (3) 초안 RLS 에어타이트
//       — 서비스롤로 넣은 초안을 anon 키로는 못 읽고, 서비스롤로는 읽힌다.

// 서비스롤 키는 macOS 키체인에서 온다(파일 폴백) — scripts/_secrets.mjs 참조.
import "./_secrets.mjs";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL || !SERVICE || !ANON) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY 필요 (.env.local)");
  process.exit(1);
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });
const anon = createClient(URL, ANON, { auth: { persistSession: false } });

let failed = 0;
function ok(name, pass, detail = "") {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
}

// (1) api_tokens 존재
{
  const { error } = await svc.from("api_tokens").select("id").limit(1);
  ok("api_tokens 테이블 존재", !error, error ? error.message : "");
}

// (2) projects.is_draft 존재
{
  const { error } = await svc.from("projects").select("is_draft").limit(1);
  ok("projects.is_draft 컬럼 존재", !error, error ? error.message : "");
}

// (3) 초안 RLS 에어타이트 — throwaway 행으로 실증
{
  const { data: prof } = await svc.from("profiles").select("id").limit(1).maybeSingle();
  if (!prof) {
    console.log("~ profiles 행이 없어 RLS 행 테스트 건너뜀 (스키마 단언만).");
  } else {
    const { data: ins, error: insErr } = await svc
      .from("projects")
      .insert({ user_id: prof.id, title: "__probe_draft_delete_me__", is_draft: true, demo_url: "" })
      .select("id")
      .single();
    if (insErr || !ins) {
      ok("초안 행 insert(서비스롤)", false, insErr?.message ?? "no row");
    } else {
      const id = ins.id;
      const { data: anonSee } = await anon.from("projects").select("id").eq("id", id).maybeSingle();
      ok("anon은 초안을 못 읽음 (RLS)", anonSee == null, anonSee ? "누출! anon이 초안을 읽음" : "");

      const { data: svcSee } = await svc.from("projects").select("id").eq("id", id).maybeSingle();
      ok("서비스롤은 초안을 읽음", svcSee != null);

      // 대조군: 같은 행을 공개로 바꾸면 anon도 읽혀야 함.
      await svc.from("projects").update({ is_draft: false }).eq("id", id);
      const { data: anonPub } = await anon.from("projects").select("id").eq("id", id).maybeSingle();
      ok("공개로 바꾸면 anon이 읽음 (대조군)", anonPub != null);

      await svc.from("projects").delete().eq("id", id);
      console.log("  (throwaway 행 삭제 완료)");
    }
  }
}

console.log(failed === 0 ? "\n✅ 전부 통과" : `\n❌ ${failed}건 실패`);
process.exit(failed === 0 ? 0 : 1);

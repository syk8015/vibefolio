// Connect 요청2(demoAccess) 마이그레이션 검증 프로브.
// 사용: supabase/migration_demo_access.sql 를 SQL 에디터에 적용한 뒤 실행.
//   node scripts/probe-demo-access.mjs
// 단언: (1) projects.demo_access 컬럼 존재 (2) object insert 왕복
//       (3) 2KB 초과 거부 (4) array 거부 (5) 스칼라 거부 — 전부 23514(check).

import { createClient } from "@supabase/supabase-js";

try { process.loadEnvFile(".env.local"); } catch { try { process.loadEnvFile(".env"); } catch { /* env already present */ } }

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !SERVICE) {
  console.error("✗ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요 (.env.local)");
  process.exit(1);
}

const svc = createClient(URL, SERVICE, { auth: { persistSession: false } });

let failed = 0;
function ok(name, pass, detail = "") {
  console.log(`${pass ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
  if (!pass) failed++;
}

// (1) 컬럼 존재
{
  const { error } = await svc.from("projects").select("demo_access").limit(1);
  ok("projects.demo_access 컬럼 존재", !error, error ? error.message : "");
}

// (2)~(5) throwaway 초안 행으로 shape check 실증
{
  const { data: prof } = await svc.from("profiles").select("id").limit(1).maybeSingle();
  if (!prof) {
    console.log("~ profiles 행이 없어 행 테스트 건너뜀 (스키마 단언만).");
  } else {
    const access = {
      url: "/demo",
      params: { guest: "1", lang: "ko" },
      note: "상단 '둘러보기'를 누르면 샘플 데이터가 뜬다",
    };
    const { data: ins, error: insErr } = await svc
      .from("projects")
      .insert({
        user_id: prof.id,
        title: "__probe_demo_access_delete_me__",
        is_draft: true,
        demo_url: "",
        demo_access: access,
      })
      .select("id, demo_access")
      .single();
    if (insErr || !ins) {
      ok("object insert", false, insErr?.message ?? "no row");
    } else {
      // jsonb는 키 순서를 재정렬하므로 순서 무관 딥비교.
      const canon = (v) =>
        JSON.stringify(v, (_k, x) =>
          x && typeof x === "object" && !Array.isArray(x)
            ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
            : x,
        );
      ok("object insert 왕복", canon(ins.demo_access) === canon(access),
        canon(ins.demo_access) === canon(access) ? "" : `readback=${JSON.stringify(ins.demo_access)}`);
      const id = ins.id;

      const fat = { note: "x".repeat(3000) }; // pg_column_size > 2048
      const { error: fatErr } = await svc.from("projects").update({ demo_access: fat }).eq("id", id);
      ok("2KB 초과 거부(23514)", fatErr?.code === "23514", fatErr ? fatErr.code : "통과돼버림");

      const { error: arrErr } = await svc.from("projects").update({ demo_access: ["a"] }).eq("id", id);
      ok("array 거부(23514)", arrErr?.code === "23514", arrErr ? arrErr.code : "통과돼버림");

      const { error: strErr } = await svc.from("projects").update({ demo_access: "guest" }).eq("id", id);
      ok("스칼라 거부(23514)", strErr?.code === "23514", strErr ? strErr.code : "통과돼버림");

      const { error: nullErr } = await svc.from("projects").update({ demo_access: null }).eq("id", id);
      ok("null 허용", !nullErr, nullErr ? nullErr.message : "");

      await svc.from("projects").delete().eq("id", id);
      const { data: gone } = await svc.from("projects").select("id").eq("id", id).maybeSingle();
      ok("throwaway 행 삭제", gone == null);
    }
  }
}

console.log(failed === 0 ? "\n✅ 전부 통과" : `\n❌ ${failed}건 실패`);
process.exit(failed === 0 ? 0 : 1);

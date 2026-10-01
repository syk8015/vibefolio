// 브라우저 → R2 직행 업로드(2026-10-01). 서버(/api/storage/sign)가 키·형식·크기를 정해 서명한
// URL로 PUT만 한다 — 키를 브라우저가 고르지 않는다(lib/userStorage.ts, app/api/storage/sign).
// 에러는 supabase-js처럼 `{ error: { message } }` 모양으로 돌려준다(부르는 화면 코드를 그대로 두려고).

export type SignedTarget = {
  path: string;
  url: string;
  headers: Record<string, string>;
  publicUrl: string;
};

type Err = { message: string };

async function sign(body: unknown): Promise<{ data: Record<string, unknown> | null; error: Err | null }> {
  try {
    const res = await fetch("/api/storage/sign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) return { data: null, error: { message: String(json.error ?? `HTTP ${res.status}`) } };
    return { data: json, error: null };
  } catch (e) {
    return { data: null, error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

/** 서명 URL로 PUT. 서명에 묶인 헤더를 그대로 보내야 R2가 받는다. */
export async function putSigned(target: SignedTarget | undefined, body: Blob): Promise<{ error: Err | null }> {
  if (!target) return { error: { message: "no upload target" } };
  try {
    const res = await fetch(target.url, { method: "PUT", headers: target.headers, body });
    return res.ok ? { error: null } : { error: { message: `upload failed (HTTP ${res.status})` } };
  } catch (e) {
    return { error: { message: e instanceof Error ? e.message : String(e) } };
  }
}

/** 앱 폴더 업로드 — 파일 전부를 한 번에 서명받는다(상대경로 → 대상). */
export async function signAppUploads(
  folder: string,
  files: { relativePath: string; data: Blob }[],
): Promise<{ targets: Map<string, SignedTarget>; error: Err | null }> {
  const { data, error } = await sign({
    kind: "app",
    folder,
    files: files.map((f) => ({ path: f.relativePath, size: f.data.size })),
  });
  const targets = new Map<string, SignedTarget>();
  for (const t of (data?.targets as SignedTarget[] | undefined) ?? []) targets.set(t.path, t);
  return { targets, error };
}

/** 영상·썸네일·프로필 사진 한 장 — 서명받고 올린 뒤 공개 주소를 돌려준다. */
export async function uploadUserFile(
  kind: "video" | "thumbnail" | "avatar",
  file: Blob,
  ext: string,
): Promise<{ publicUrl: string | null; error: Err | null }> {
  const { data, error } = await sign({ kind, ext: ext.toLowerCase(), size: file.size, contentType: file.type || null });
  if (error || !data?.target) return { publicUrl: null, error: error ?? { message: "sign failed" } };
  const target = data.target as SignedTarget;
  const put = await putSigned(target, file);
  return put.error ? { publicUrl: null, error: put.error } : { publicUrl: target.publicUrl, error: null };
}

import { memo } from "react";
import { AI_TOOL_DOMAINS } from "@/lib/projectTaxonomy";
import { safeRelativePath, secretFileKind, summarizeDropped, type DroppedFile } from "@/lib/upload-safety";
import type { DBProject } from "./types";

// Shared helpers for the Projects tab. Extracted verbatim from ProjectsTab.tsx —
// pure/module-level, no component state, so safe to move as-is.

// Pure, primitive props + a fixed domain map. Memoized so it doesn't re-render
// (and re-issue the favicon request) on unrelated dashboard state changes.
export const AiToolLogo = memo(function AiToolLogo({ id, size = 13 }: { id: string; size?: number }) {
  const domain = AI_TOOL_DOMAINS[id];
  if (!domain) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt={id}
      width={size}
      height={size}
      style={{ borderRadius: 3, display: "block", flexShrink: 0 }}
    />
  );
});

export function isUploadedProject(demoUrl: string) {
  return demoUrl?.startsWith("/api/preview/");
}


// zip → 압축해제, 일반 파일 → 그대로. 결과는 {relativePath, blob} 배열.
// (zip-slip 가드 safeRelativePath는 서버 인제스트와 공유하려고 @/lib/upload-safety로 이전.)
// zip 안에 단일 최상위 폴더가 있으면 strip해서 index.html이 root에 오게 한다.
//
// `.env`·`.git/` 같은 비밀 파일은 여기서 걸러 스토리지에 올리지 않는다(2026-09-01).
// ⚠️ 이 경로는 브라우저가 스토리지로 직행 업로드하므로(서버를 안 거친다) 이 필터는
// 강제가 아니라 사고 방지다 — 우회하는 사람은 자기 비밀을 스스로 공개하는 소유자다.
// 서버 인제스트(expandZipBundle)는 서비스롤이라 그쪽이 진짜 강제 지점이고,
// 이미 저장된 것에 대한 마지막 그물은 /api/preview의 서빙 차단이다.
export async function expandUploadEntries(
  rawFiles: File[],
): Promise<{ entries: { relativePath: string; data: Blob }[]; dropped: DroppedFile[] }> {
  const out: { relativePath: string; data: Blob }[] = [];
  const dropped: DroppedFile[] = [];
  const keep = (relativePath: string, data: Blob) => {
    const kind = secretFileKind(relativePath);
    if (kind) dropped.push({ path: relativePath, kind });
    else out.push({ relativePath, data });
  };
  for (const file of rawFiles) {
    if (/\.zip$/i.test(file.name)) {
      const { default: JSZip } = await import("jszip");
      const zip = await JSZip.loadAsync(file);
      const fileEntries = Object.values(zip.files).filter((e) => !e.dir);
      const topSegments = new Set(fileEntries.map((e) => e.name.split("/")[0]));
      const stripTop =
        topSegments.size === 1 && fileEntries.every((e) => e.name.includes("/"));
      for (const entry of fileEntries) {
        const parts = entry.name.split("/");
        if (stripTop) parts.shift();
        const relativePath = safeRelativePath(parts.join("/"));
        if (!relativePath) continue;
        // 비밀 파일은 압축을 풀지도 않는다(`.git` 수백 개를 blob으로 만들 이유 없음).
        const kind = secretFileKind(relativePath);
        if (kind) {
          dropped.push({ path: relativePath, kind });
          continue;
        }
        out.push({ relativePath, data: await entry.async("blob") });
      }
    } else {
      let rawPath: string;
      if (file.webkitRelativePath) {
        const parts = file.webkitRelativePath.split("/");
        parts.shift();
        rawPath = parts.join("/");
      } else {
        rawPath = file.name;
      }
      const relativePath = safeRelativePath(rawPath);
      if (!relativePath) continue;
      keep(relativePath, file);
    }
  }
  return { entries: out, dropped };
}

export { summarizeDropped };

// 수정 저장 후, 교체·제거된 이전 업로드 영상/썸네일 객체를 청소한다.
// DB 업데이트가 커밋된 뒤 old↔new를 비교하므로(업로드 시점 X) 저장 안 하고
// 닫는 footgun이 없다. thum.io·picsum 등 우리 객체가 아닌 값은 서버가 무시한다.
//
// 실제 삭제는 서버에서 — 여기서 storage.remove()를 직접 부르면 스토리지 RLS가
// 조용히 막아 파일이 그대로 쌓인다(삭제 라우트가 서버로 간 것과 같은 이유, 감사 #18).
export async function deleteSwappedAssets(
  projectId: string,
  prev: Pick<DBProject, "video_url" | "thumbnail">,
  next: Pick<DBProject, "video_url" | "thumbnail">,
) {
  const prevVideoUrl = prev.video_url !== next.video_url ? prev.video_url : null;
  const prevThumbnail = prev.thumbnail !== next.thumbnail ? prev.thumbnail : null;
  if (!prevVideoUrl && !prevThumbnail) return;
  try {
    await fetch(`/api/projects/${projectId}/demo-assets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prevVideoUrl, prevThumbnail }),
      keepalive: true,
    });
  } catch { /* 청소 실패가 저장 흐름을 막지는 않는다 — 서버 로그에 남는다 */ }
}

// ── 팝오버 위치 계산 (2026-09-05) ────────────────────────────────────────────
// 행 팝오버(⋯ 메뉴·촬영 배지)는 fixed + 트리거 rect 앵커다. 전에는 무조건
// `rect.bottom + 6`으로 아래에만 띄워서, 리스트 맨 아래 행에서는 메뉴가 화면
// 밖으로 잘리고 fixed라 페이지 스크롤로도 따라가지 못해 항목을 못 눌렀다.
// 아래 공간이 모자라고 위가 더 넓으면 위로 뒤집고, 어느 쪽이든 남은 공간에
// 맞춰 최대 높이를 잘라 내부 스크롤로 넘긴다.
export type PopoverAnchor = { top: number; left: number; maxHeight: number };

export function popoverAnchor(
  rect: DOMRect,
  {
    width,
    estHeight,
    align = "left",
    gap = 6,
    pad = 8,
  }: { width: number; estHeight: number; align?: "left" | "right"; gap?: number; pad?: number },
): PopoverAnchor {
  const below = window.innerHeight - rect.bottom - gap - pad;
  const above = rect.top - gap - pad;
  const flip = estHeight > below && above > below;
  const room = flip ? above : below;
  // 최소 높이(120)는 보장한다 — 그보다 좁으면 내부 스크롤로 읽게 두는 편이
  // 팝오버가 1~2줄만 보이는 것보다 낫다.
  const maxHeight = Math.max(120, Math.min(estHeight, room));
  const rawLeft = align === "right" ? rect.right - width : rect.left;
  return {
    top: flip ? Math.max(pad, rect.top - gap - maxHeight) : rect.bottom + gap,
    left: Math.max(pad, Math.min(rawLeft, window.innerWidth - width - pad)),
    maxHeight,
  };
}

// 업로드 시각 — 같은 작품을 여러 번 올리면 제목만으로는 구분이 안 돼서
// 행에 날짜+분까지 보여준다(2026-09-05 사용자 요청). title 속성엔 초까지.
export function formatUploadedAt(iso: string | null | undefined, locale: "ko" | "en") {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const tag = locale === "ko" ? "ko-KR" : "en-US";
  return {
    // dateStyle:"short"는 연도를 2자리로 줄여 준다("26. 9. 5. 오후 9:17").
    // 연도를 빼면 작년 업로드와 구분이 안 되고, 렌더 중 new Date()로 올해인지
    // 판정하면 순수하지 않은 렌더가 된다.
    short: d.toLocaleString(tag, { dateStyle: "short", timeStyle: "short" }),
    full: d.toLocaleString(tag, { dateStyle: "full", timeStyle: "medium" }),
  };
}

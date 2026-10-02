"use client";

import { useId } from "react";
import { useT } from "@/lib/i18n/client";
import { extractPublishJson } from "@/lib/extractPublishJson";
import { normalizeTags } from "@/lib/projectTaxonomy";
import { AI_TOOL_MARKS as TOOL_MARK } from "@/components/dashboard/aiToolPaths";

// 초안 미리보기(업그레이드, 2026-10-01 사용자 확정) — 붙여넣은 AI 답이 어떤 초안이 될지 작은 명함 카드로.
// /publish 오른쪽 판과 연결 창의 "초안이 왔어요"가 같은 카드를 쓴다.
//
// 카드는 초안 검토 창의 명함(DraftReviewModal)처럼 테마와 무관하게 어두운 바탕이다 — 실제 명함이
// 작품 위에 뜨는 모양이라 라이트에서도 어둡다. 다크 테마에선 둘레 1px(--border)가 바탕과 갈라 준다.
// 글은 읽기만 한다(extractPublishJson — 실행하지 않음). 보이는 건 주인이 쓴 기본 언어 판이다.

const CARD_BG = "linear-gradient(180deg, #2a241f 0%, #1a1612 100%)";

/** 소개글은 줄바꿈으로 2~3줄(52칸) — 카드엔 앞의 세 줄까지. */
export function descriptionLines(description: string | null | undefined): string[] {
  return (description ?? "").split("\n").map((line) => line.trim()).filter(Boolean).slice(0, 3);
}

export interface DraftPreviewData {
  title: string;
  lines: string[];
  tools: string[];
}

/** 칸의 글 → 카드에 그릴 것. 제목이 없으면(아직 올릴 답이 아니면) null — 빈 자리표시가 뜬다. */
export function draftPreview(raw: string): DraftPreviewData | null {
  const r = extractPublishJson(raw);
  if (!r.ok) return null;
  const title = typeof r.payload.title === "string" ? r.payload.title.trim() : "";
  if (!title) return null;
  const description = typeof r.payload.description === "string" ? r.payload.description : "";
  return { title, lines: descriptionLines(description), tools: normalizeTags(r.payload.tags) };
}

/** 작은 어두운 명함 — 제목 · 소개 세 줄 · (AI 도구) · "초안" 딱지. solidBadge = 밝은 딱지(흰 판 위). */
export function DraftMiniCard({ title, lines, tools = [], solidBadge = false, style }: {
  title: string;
  lines: string[];
  tools?: string[];
  solidBadge?: boolean;
  style?: React.CSSProperties;
}) {
  const { t } = useT();
  return (
    <div
      className="w-full flex flex-col text-left"
      style={{
        background: CARD_BG, color: "#f4ede0", borderRadius: 18, padding: "18px 22px 20px", gap: 8,
        boxShadow: "0 0 0 1px var(--border), 0 16px 32px rgba(40, 30, 15, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.06)",
        ...style,
      }}
    >
      <div className="flex items-start gap-3">
        <p className="vf-serif-display flex-1 min-w-0" style={{ color: "#f4ede0", fontSize: "1.1875rem", fontWeight: 600, lineHeight: 1.35, margin: 0 }}>
          {title}
        </p>
        <span
          className="shrink-0 rounded-full"
          style={{
            marginTop: 2, padding: "2px 10px", fontFamily: "var(--font-nunito)", fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.4,
            ...(solidBadge ? { background: "#f4ede0", color: "#1a1612" } : { background: "rgba(255, 255, 255, 0.12)", color: "#f4ede0" }),
          }}
        >
          {t.publish.draftBadge}
        </span>
      </div>
      {lines.length > 0 && (
        <p style={{
          margin: 0, color: "#d6cab4", fontFamily: "var(--font-nunito)", fontSize: "0.875rem", lineHeight: 1.55, whiteSpace: "pre-line",
          display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3, overflow: "hidden",
        }}>
          {lines.join("\n")}
        </p>
      )}
      {tools.length > 0 && (
        <div className="flex flex-wrap gap-1.5" style={{ marginTop: 4 }}>
          {tools.map((tool) => (
            <span key={tool} className="inline-flex items-center gap-1.5 rounded-full"
              style={{ padding: "2px 9px", background: "rgba(255, 255, 255, 0.10)", color: "rgba(255, 255, 255, 0.88)", fontFamily: "var(--font-nunito)", fontSize: "0.8125rem", lineHeight: 1.5 }}>
              {TOOL_MARK[tool] && (
                <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
                  <path d={TOOL_MARK[tool].d} fill={TOOL_MARK[tool].fill} />
                </svg>
              )}
              {tool}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** /publish 오른쪽 판. 비었을 땐 점선 빈 카드 + 한 줄, 올릴 수 있는 답이면 그 초안 카드. */
export function DraftPreviewPanel({ preview }: { preview: DraftPreviewData | null }) {
  const { t } = useT();
  const tp = t.publish;
  const labelId = useId();
  const bar = (width: number | string, height = 9, marginTop = 0) => (
    <span className="block rounded-full" style={{ width, height, marginTop, background: "var(--surface-soft)" }} />
  );
  return (
    <section
      aria-labelledby={labelId}
      className="flex-1 flex flex-col"
      style={{ background: "var(--surface)", borderRadius: 20, padding: "16px 18px 18px", gap: 12, boxShadow: "0 0 0 1px var(--border), var(--shadow-panel)" }}
    >
      <p id={labelId} style={{ margin: 0, color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.8125rem", fontWeight: 600, lineHeight: 1.5 }}>
        {tp.previewLabel}
      </p>
      <div className="flex-1 flex flex-col justify-center gap-3">
        {preview ? (
          <DraftMiniCard title={preview.title} lines={preview.lines} tools={preview.tools} solidBadge />
        ) : (
          <>
            <div aria-hidden="true" className="flex flex-col items-start" style={{ border: "1.5px dashed var(--border-bright)", borderRadius: 16, padding: "16px 18px", gap: 8 }}>
              {bar("54%", 13)}
              {bar("80%", 9, 4)}
              {bar("62%")}
              {bar(92, 18, 4)}
            </div>
            <p className="text-center" style={{ margin: 0, color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.8125rem", lineHeight: 1.5 }}>
              {tp.previewEmpty}
            </p>
          </>
        )}
      </div>
    </section>
  );
}

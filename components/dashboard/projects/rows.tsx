import { useState, type DragEvent } from "react";
import Image from "next/image";
import ShareKit from "@/components/dashboard/ShareKit";
import { parseDemoFailure, DEMO_FAILURE_COPY } from "@/lib/demo-failure";
import { placeholderThumbnail } from "@/lib/placeholder";
import { CONTENT_TYPES } from "@/lib/projectTaxonomy";
import { AiToolLogo, isUploadedProject } from "./helpers";
import { type DBProject, type DemoBuildStatus, DEMO_IN_FLIGHT, DEMO_SLOW_MS } from "./types";

// Row components for the dashboard Projects tab. Extracted verbatim from
// ProjectsTab.tsx (no behavior change). DemoBuildBadge + RowMenu are internal to
// this module (only the rows use them); DraftRow + ProjectRow are exported.

// 실패 코드별 카피는 lib/demo-failure.ts의 DEMO_FAILURE_COPY — 실패 알림 이메일과
// 공유하므로 여기서 따로 들지 않는다. raw 메시지는 팝오버의 "기술 정보" 토글 뒤로.

const DEMO_PHASE_LABEL: Record<Exclude<DemoBuildStatus, "done" | "failed" | "held">, string> = {
  pending: "촬영 대기",
  building: "앱 준비 중",
  recording: "촬영 중",
  editing: "편집 중",
};

function DemoBuildBadge({
  status,
  error,
  statusChangedAt,
  paused,
  nowMs,
  onRetry,
}: {
  status: DemoBuildStatus | null;
  error: string | null;
  statusChangedAt: string | null;
  paused: boolean;
  nowMs: number;
  onRetry?: () => void;
}) {
  // 팝오버는 fixed + 버튼 rect 앵커 — 리스트 카드(vf-card overflow-hidden)가
  // absolute 팝오버를 클리핑하는 것을 실측으로 확인(2026-07-13), fixed로 탈출.
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  if (!status || status === "done") return null;

  if (status === "failed") {
    const { code, message } = parseDemoFailure(error);
    const copy = DEMO_FAILURE_COPY[code ?? "error"];
    return (
      <div className="shrink-0" style={{ position: "relative", display: "inline-flex" }}>
        <button
          onClick={e => {
            const r = e.currentTarget.getBoundingClientRect();
            setAnchor(a => (a ? null : {
              top: r.bottom + 6,
              left: Math.max(8, Math.min(r.left, window.innerWidth - 264 - 8)),
            }));
          }}
          className="px-2 py-0.5 rounded-full text-xs"
          style={{
            background: "rgba(179, 71, 71, 0.12)",
            color: "#8e3535",
            fontFamily: "var(--font-nunito)",
            fontSize: "0.6rem",
            fontWeight: 600,
            border: "none",
            cursor: "pointer",
          }}
        >
          시연 영상 실패
        </button>
        {anchor && (
          <>
            <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setAnchor(null)} />
            <div
              className="rounded-2xl"
              style={{
                position: "fixed",
                top: anchor.top,
                left: anchor.left,
                zIndex: 50,
                width: 264,
                maxHeight: `calc(100vh - ${anchor.top}px - 12px)`,
                overflowY: "auto",
                padding: "0.9rem 1rem",
                background: "var(--surface)",
                boxShadow: "0 12px 32px rgba(0, 0, 0, 0.16)",
                textAlign: "left",
              }}
            >
              <p style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)", fontFamily: "var(--font-nunito)", margin: 0 }}>
                {copy.title}
              </p>
              <p style={{ fontSize: "0.7rem", color: "var(--text-secondary)", lineHeight: 1.6, fontFamily: "var(--font-nunito)", margin: "0.4rem 0 0" }}>
                {copy.body}
              </p>
              {onRetry && (
                <button
                  onClick={() => { setAnchor(null); onRetry(); }}
                  className="rounded-full"
                  style={{
                    marginTop: "0.7rem",
                    padding: "0.4rem 0.95rem",
                    background: "var(--text-primary)",
                    color: "var(--bg)",
                    border: "none",
                    fontSize: "0.68rem",
                    fontWeight: 600,
                    fontFamily: "var(--font-nunito)",
                    cursor: "pointer",
                  }}
                >
                  다시 시도
                </button>
              )}
              {message && (
                <details style={{ marginTop: "0.6rem" }}>
                  <summary style={{ fontSize: "0.6rem", color: "var(--text-muted)", cursor: "pointer", fontFamily: "var(--font-nunito)" }}>
                    기술 정보
                  </summary>
                  <pre
                    style={{
                      margin: "0.35rem 0 0",
                      padding: "0.5rem 0.6rem",
                      background: "var(--surface-soft)",
                      borderRadius: 10,
                      fontSize: "0.58rem",
                      lineHeight: 1.5,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      color: "var(--text-secondary)",
                      maxHeight: 120,
                      overflowY: "auto",
                    }}
                  >
                    {message}
                  </pre>
                </details>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  if (status === "held") {
    // '[moderation]' 마커 = 게시 전 콘텐츠 검토 격리(모더레이션 파이프라인).
    // 마커 없는 held는 기존 쿼터/크레딧 보류 — 카피가 서로 다르다.
    const isModeration = !!error?.startsWith("[moderation]");
    return (
      <span
        className="px-2 py-0.5 rounded-full text-xs shrink-0"
        style={{
          background: "var(--surface-soft)",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-nunito)",
          fontSize: "0.6rem",
          fontWeight: 600,
          cursor: "help",
        }}
        title={
          isModeration
            ? "게시 전에 확인이 필요하다고 표시돼 잠시 보류 중이에요. 검토가 끝나면 자동으로 게시되고, 보통 하루 안에 처리돼요."
            : "하루 자동 시연 한도를 넘어 승인 대기 중이에요. 보통 24시간 안에 처리되고, 그동안은 이미지로 표시돼요."
        }
      >
        {isModeration ? "게시 전 확인 중" : "승인 대기 · 이미지 표시"}
      </span>
    );
  }

  // pending | building | recording | editing — 단계 서사 + 기대 시간.
  //
  // 다만 스피너가 정직한 건 실제로 진행 중일 때뿐이다. 워커가 멈췄거나 일시정지면
  // 큐는 계속 접수되는데(요청 경로는 demo_paused를 보지 않는다) 이 배지만 영원히
  // 돌고, RerecordButton은 in-flight라 숨는다 → 유저가 할 수 있는 게 없는 데드엔드.
  // 그래서 두 경우엔 스피너를 걷어내고 지금 무슨 일인지 말해준다.
  // nowMs는 폴링이 실어주는 값(0 = 아직 모름). 렌더는 순수하게 유지된다.
  const isSlow =
    !!statusChangedAt && nowMs > 0 && nowMs - new Date(statusChangedAt).getTime() > DEMO_SLOW_MS;

  if (paused || isSlow) {
    return (
      <span
        className="px-2 py-0.5 rounded-full text-xs shrink-0"
        style={{
          background: "var(--surface-soft)",
          color: "var(--text-secondary)",
          fontFamily: "var(--font-nunito)",
          fontSize: "0.6rem",
          fontWeight: 600,
          cursor: "help",
        }}
        title={
          paused
            ? "촬영 요청이 접수됐어요. 순서대로 촬영되고, 끝나면 메일로 알려드릴게요."
            : "창을 닫으셔도 돼요 — 촬영이 끝나면 메일로 알려드릴게요."
        }
      >
        {paused ? "촬영 대기 중" : "예상보다 오래 걸려요"}
      </span>
    );
  }

  return (
    <span
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs shrink-0"
      style={{
        background: "var(--surface-soft)",
        color: "var(--text-secondary)",
        fontFamily: "var(--font-nunito)",
        fontSize: "0.6rem",
        fontWeight: 600,
      }}
    >
      <span
        className="rounded-full border-2 animate-spin"
        style={{
          width: 8,
          height: 8,
          borderColor: "var(--text-secondary)",
          borderTopColor: "transparent",
        }}
      />
      {DEMO_PHASE_LABEL[status]} · 보통 1–3분
    </span>
  );
}

// 행 액션 접기(시안 A 확정): 1차 액션(공유)만 상시 노출, 나머지는 ⋯ 메뉴로.
// 팝오버는 fixed + 트리거 rect 앵커 — 리스트 카드(vf-card overflow-hidden)의
// 클리핑을 피하는 기검증 패턴(DemoBuildBadge와 동일).
type RowMenuItem = { label: string; onClick: () => void; danger?: boolean; disabled?: boolean };

function RowMenu({ items }: { items: RowMenuItem[] }) {
  const [anchor, setAnchor] = useState<{ top: number; left: number } | null>(null);
  const MENU_W = 152;
  return (
    <div className="shrink-0" style={{ position: "relative", display: "inline-flex" }}>
      <button
        title="더 보기"
        aria-haspopup="menu"
        aria-expanded={!!anchor}
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect();
          setAnchor(a => (a ? null : {
            top: r.bottom + 6,
            left: Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8)),
          }));
        }}
        className="vf-icon-button"
        style={{ background: anchor ? "var(--surface-active)" : undefined }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="var(--text-primary)">
          <circle cx="2.6" cy="7" r="1.25"/><circle cx="7" cy="7" r="1.25"/><circle cx="11.4" cy="7" r="1.25"/>
        </svg>
      </button>
      {anchor && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setAnchor(null)} />
          <div
            role="menu"
            className="rounded-2xl"
            style={{
              position: "fixed",
              top: anchor.top,
              left: anchor.left,
              zIndex: 50,
              width: MENU_W,
              padding: 5,
              background: "var(--surface)",
              boxShadow: "0 12px 32px rgba(0, 0, 0, 0.16)",
            }}
          >
            {items.map(it => (
              <button
                key={it.label}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => { setAnchor(null); it.onClick(); }}
                className="w-full text-left rounded-xl transition-colors hover:bg-[var(--surface-soft)] disabled:opacity-35"
                style={{
                  display: "block",
                  padding: "8px 11px",
                  border: "none",
                  background: "transparent",
                  fontSize: "0.78rem",
                  fontFamily: "var(--font-nunito)",
                  fontWeight: 500,
                  color: it.danger ? "var(--danger)" : "var(--text-primary)",
                  cursor: it.disabled ? "not-allowed" : "pointer",
                }}
              >
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// AI가 인제스트로 보낸 "초안" 행. 공개 리스트와 같은 행 언어(시안 A 확정) —
// 좌측 잉크 바 + "확인하고 공개" 1차 버튼만 다르다. AI가 쓴 카피를 확인 후
// 공개하면 기존 추가 플로우처럼 자동 시연이 트리거된다.
export function DraftRow({ draft, highlight, isLast, onEdit, onDelete, onPublish }: {
  draft: DBProject;
  highlight: boolean;
  isLast: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onPublish: () => void;
}) {
  const [publishing, setPublishing] = useState(false);
  const thumbnail = draft.thumbnail || placeholderThumbnail(draft.id);
  const ct = CONTENT_TYPES.find((c) => c.id === draft.content_type);

  return (
    <div
      id={`draft-${draft.id}`}
      className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-3 md:p-4"
      style={{
        background: "var(--surface)",
        borderBottom: isLast ? "none" : "1px solid var(--border)",
        borderLeft: "3px solid var(--text-primary)",
        boxShadow: highlight ? "inset 0 0 0 2px var(--text-primary)" : undefined,
        transition: "box-shadow 0.4s",
      }}
    >
      <div className="flex items-start md:items-center gap-3 md:gap-4 flex-1 min-w-0">
        <div className="relative w-20 h-14 rounded-xl overflow-hidden shrink-0" style={{ background: "var(--surface-soft)" }}>
          <Image src={thumbnail} unoptimized alt={draft.title || "초안"} fill className="object-cover" sizes="80px" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="vf-serif-display truncate" style={{ fontSize: "1rem", fontWeight: 500, lineHeight: 1.35, margin: 0 }}>
              {draft.title || "제목 없음"}
            </h3>
            <span className="px-2 py-0.5 rounded-full shrink-0"
              style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.6rem", fontWeight: 600 }}>
              AI 초안
            </span>
            {ct && (
              <span className="text-xs shrink-0" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", fontSize: "0.62rem" }}>
                {ct.emoji} {ct.label}
              </span>
            )}
          </div>
          {draft.description && (
            <p className="text-xs truncate" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", margin: 0 }}>
              {draft.description}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 md:gap-2 justify-end shrink-0">
        <button
          onClick={() => { setPublishing(true); onPublish(); }}
          disabled={publishing}
          className="vf-button-primary"
          style={{ fontSize: "0.75rem", padding: "0.4rem 0.85rem", opacity: publishing ? 0.6 : 1 }}
        >
          {publishing ? "공개 중…" : "확인하고 공개"}
        </button>
        <RowMenu
          items={[
            { label: "수정", onClick: onEdit },
            { label: "삭제", onClick: onDelete, danger: true },
          ]}
        />
      </div>
    </div>
  );
}

export function ProjectRow({ project, username, demoPaused, nowMs, onDelete, onEdit, onToggleFeatured, onRerecord, onMoveUp, onMoveDown, canMoveUp, canMoveDown, isDragging, isDragOver, isLast, onDragStart, onDragOver, onDrop, onDragEnd }: {
  project: DBProject;
  username: string;
  demoPaused: boolean;
  nowMs: number;
  onDelete: () => void;
  onEdit: () => void;
  onToggleFeatured: () => void;
  onRerecord: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  isDragging: boolean;
  isDragOver: boolean;
  isLast: boolean;
  onDragStart: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const thumbnail = project.thumbnail || placeholderThumbnail(project.id);
  const contentType = CONTENT_TYPES.find(c => c.id === project.content_type);

  // 재촬영 계열은 상태에 따라 라벨이 달라지고, 진행 중·승인 대기면 지금 할 수
  // 있는 게 없어 메뉴에서 아예 뺀다(옛 RerecordButton의 노출 규칙 그대로).
  const status = project.demo_build_status;
  const demoInFlight = !!status && DEMO_IN_FLIGHT.has(status);
  const rerecordLabel =
    !project.demo_source_value || demoInFlight || status === "held"
      ? null
      : project.demo_video_url || status === "done"
        ? "재촬영 요청"
        : status === "failed"
          ? "촬영 다시 시도"
          : "시연 영상 만들기";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className="flex flex-col md:flex-row md:items-center gap-3 md:gap-4 p-3 md:p-4 transition-all duration-150"
      style={{
        background: isDragOver ? "var(--blue-tint)" : (project.is_featured ? "var(--blue-tint)" : "var(--surface)"),
        opacity: isDragging ? 0.4 : 1,
        borderBottom: isLast ? "none" : "1px solid var(--border)",
        borderTop: isDragOver ? "2px solid var(--text-primary)" : undefined,
        borderLeft: project.is_featured ? "3px solid var(--text-primary)" : "3px solid transparent",
      }}
    >
      {/* Top section: drag handle (desktop) + thumbnail + info — stays in row even on mobile */}
      <div className="flex items-start md:items-center gap-3 md:gap-4 flex-1 min-w-0">
        {/* Drag handle — desktop only (mobile uses ↑↓ buttons) */}
        <div className="hidden md:flex items-center shrink-0" style={{ color: "var(--text-muted)", cursor: "grab", padding: "4px 2px" }}>
          <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor">
            <circle cx="3" cy="3" r="1.5"/><circle cx="9" cy="3" r="1.5"/>
            <circle cx="3" cy="9" r="1.5"/><circle cx="9" cy="9" r="1.5"/>
            <circle cx="3" cy="15" r="1.5"/><circle cx="9" cy="15" r="1.5"/>
          </svg>
        </div>

        <div className="relative w-20 h-14 rounded-xl overflow-hidden shrink-0" style={{ background: "var(--surface-soft)" }}>
          <Image src={thumbnail} unoptimized alt={project.title} fill className="object-cover" sizes="80px" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3
              className="vf-serif-display truncate"
              style={{ fontSize: "1rem", fontWeight: 500, lineHeight: 1.35, margin: 0 }}
            >
              {project.title}
            </h3>
            <span className="text-xs shrink-0 vf-mono" style={{ color: "var(--text-muted)" }}>{project.year}</span>
            {project.is_featured && (
              <span className="px-2 py-0.5 rounded-full shrink-0"
                style={{ background: "var(--text-primary)", color: "var(--bg)", fontFamily: "var(--font-nunito)", fontSize: "0.6rem", fontWeight: 700 }}>
                ★ 대표
              </span>
            )}
            {contentType && (
              <span className="px-2 py-0.5 rounded-full text-xs shrink-0"
                style={{ background: "var(--surface-soft)", color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", fontSize: "0.6rem", fontWeight: 500 }}>
                {contentType.emoji} {contentType.label}
              </span>
            )}
            {isUploadedProject(project.demo_url) && (
              <span className="px-2 py-0.5 rounded-full text-xs shrink-0 vf-mono"
                style={{ background: "var(--text-primary)", color: "var(--bg)", fontSize: "0.58rem", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                upload
              </span>
            )}
            <DemoBuildBadge
              status={project.demo_build_status}
              error={project.demo_build_error}
              statusChangedAt={project.demo_status_changed_at}
              paused={demoPaused}
              nowMs={nowMs}
              onRetry={project.demo_source_value ? onRerecord : undefined}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(project.tags ?? []).map(tag => (
              <span key={tag} className="flex items-center gap-1 px-2 py-0.5 rounded-full"
                style={{
                  background: "var(--surface-soft)",
                  color: "var(--text-secondary)", fontSize: "0.62rem", fontWeight: 500, fontFamily: "var(--font-nunito)",
                }}>
                <AiToolLogo id={tag} size={11} />
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom section: type badge + actions. Full-width row on mobile, inline on desktop */}
      <div className="flex items-center gap-2 justify-between md:justify-start shrink-0" onDragStart={e => e.stopPropagation()}>
        <span className="px-2.5 py-1 rounded-full text-xs shrink-0 vf-mono"
          style={{
            background: "var(--surface-soft)",
            color: "var(--text-secondary)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontSize: "0.58rem",
          }}>
          {project.type === "video" ? "video" : "image"}
        </span>

        <div className="flex items-center gap-1.5 md:gap-2">
          {/* 1차 액션은 공유뿐 — 나머지는 전부 ⋯ 메뉴로(시안 A).
              위/아래 이동이 메뉴에 있어 모바일(드래그 불가)도 정렬이 된다. */}
          {project.demo_video_url && (
            <ShareKit
              username={username}
              projectId={project.id}
              demoVideoUrl={project.demo_video_url}
              projectTitle={project.title}
            />
          )}
          <RowMenu
            items={[
              // "작품 보기"가 공유 팝오버 안에만 숨어 있던 것(계획 항목) —
              // 업로드형의 /api/preview 상대 경로도 그대로 열린다.
              ...(project.demo_url
                ? [{ label: "작품 열기 ↗", onClick: () => window.open(project.demo_url, "_blank", "noopener") }]
                : []),
              { label: "수정", onClick: onEdit },
              { label: project.is_featured ? "대표 해제" : "대표로 설정", onClick: onToggleFeatured },
              ...(rerecordLabel ? [{ label: rerecordLabel, onClick: onRerecord }] : []),
              { label: "위로 이동", onClick: onMoveUp, disabled: !canMoveUp },
              { label: "아래로 이동", onClick: onMoveDown, disabled: !canMoveDown },
              { label: "삭제", onClick: onDelete, danger: true },
            ]}
          />
        </div>
      </div>
    </div>
  );
}

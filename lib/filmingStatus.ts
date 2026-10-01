import { getDictionary } from "./i18n/dictionaries";
import { parseDemoFailure, type DemoFailureCode } from "./demo-failure";
import { normalizeLocaleVideos } from "./workLanguages";

// 외부 AI가 "영상 다 찍혔어?"를 스스로 묻는 길(2026-10-02, 09-17 외부 AI 피드백의 마지막 항목).
// 예전엔 초안을 올린 AI가 그 뒤를 볼 방법이 없었다 — 촬영은 주인이 [공개하기]를 누른
// 다음에야 시작되는데, 인제스트 API는 초안만 보여 주니 공개된 순간 작품이 AI 눈에서
// 사라졌다. 그래서 사람이 대시보드를 들여다보고 AI에게 말로 옮겨 줘야 했다.
//
// 이 파일은 행 하나 → "지금 어디까지 왔고 다음에 무슨 일이 일어나나"로 옮기는 순수 함수다.
// 판정은 대시보드 배지(components/dashboard/projects/rows.tsx DemoBuildBadge)와 같은
// 규칙을 따른다: 일시정지(=몰아서 찍기, 정상 운영)면 "대기"라고 정직하게, 한 단계에 5분
// 넘게 머물면 "평소보다 오래", 실패면 실패 표(t.demoFailure)의 같은 문장.
// 읽는 쪽이 AI라 문장은 영어 고정이다(CLI·MCP 출력과 같은 규칙, 0.1.11~).

/** 대시보드 배지의 DEMO_SLOW_MS와 같은 값 — 둘이 다르면 같은 작품을 두고 말이 갈린다. */
export const FILMING_SLOW_MS = 5 * 60_000;

export type FilmingRow = {
  is_draft: boolean | null;
  demo_build_status: string | null;
  demo_build_error: string | null;
  demo_video_url: string | null;
  demo_generated_at: string | null;
  demo_status_changed_at: string | null;
  demo_attempt_count: number | null;
  demo_locale_videos?: unknown;
  video_url: string | null;
  pending_demo_script?: unknown;
  pending_script_at?: string | null;
  pending_script_note?: string | null;
};

export type FilmingState =
  | "not-started" // 초안 — 공개 전엔 찍지 않는다
  | "no-auto-demo" // 공개됐지만 자동 촬영을 요청한 적이 없다(주인이 올린 영상·그림만)
  | "queued"
  | "in-progress"
  | "done"
  | "failed"
  | "held";

export type FilmingStatus = {
  state: FilmingState;
  /** in-progress일 때만: 앱 준비 → 촬영 → 편집 중 어디인지. */
  stage: "preparing-app" | "filming" | "editing" | null;
  message: string;
  next: string;
  /** 지금 걸려 있는 시연 영상. 다시 찍는 중이면 새 영상이 나올 때까지 옛 영상이다. */
  videoUrl: string | null;
  /** 다른 언어 판 영상(작품 두 언어) — 언어 코드 → 주소. */
  otherLanguageVideos: Record<string, string> | null;
  /** 주인이 직접 올린 영상(자동 촬영과 별개). */
  ownerVideoUrl: string | null;
  filmedAt: string | null;
  statusChangedAt: string | null;
  attempts: number;
  slow: boolean;
  failure: { code: DemoFailureCode | "error"; title: string; body: string; detail: string } | null;
  pendingScript: { submittedAt: string | null; note: string | null; message: string } | null;
};

const STAGE: Record<string, { key: FilmingStatus["stage"]; step: number; label: string }> = {
  building: { key: "preparing-app", step: 1, label: "preparing the app" },
  recording: { key: "filming", step: 2, label: "filming" },
  editing: { key: "editing", step: 3, label: "editing the video" },
};

const RERECORD_HINT =
  "If the demo script caused it (a step that could not find its target, a wrong order), submit a fixed script with " +
  "the re-record tool (rerecord_nookframe_demo, or `nookframe rerecord`) — the owner then confirms it in the dashboard.";

const DETAIL_MAX = 500;

function minutesSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.round((nowMs - t) / 60_000)) : null;
}

/**
 * 행 하나 → 촬영 상태. `paused` = system_status.demo_paused(몰아서 찍기 모드),
 * `nowMs` = 판정 시각(테스트에서 고정하려고 밖에서 받는다).
 */
export function filmingStatus(row: FilmingRow, { paused, nowMs }: { paused: boolean; nowMs: number }): FilmingStatus {
  const en = getDictionary("en");
  const status = row.demo_build_status;
  const videoUrl = row.demo_video_url || null;
  const waited = minutesSince(row.demo_status_changed_at, nowMs);
  const slow = waited !== null && waited * 60_000 > FILMING_SLOW_MS;
  const keepsOld = videoUrl ? " The previous video stays up until the new one is ready." : "";

  const base: FilmingStatus = {
    state: "not-started",
    stage: null,
    message: "",
    next: "",
    videoUrl,
    otherLanguageVideos: normalizeLocaleVideos(row.demo_locale_videos) as Record<string, string> | null,
    ownerVideoUrl: row.video_url || null,
    filmedAt: row.demo_generated_at || null,
    statusChangedAt: row.demo_status_changed_at || null,
    attempts: row.demo_attempt_count ?? 0,
    slow: false,
    failure: null,
    pendingScript: row.pending_demo_script
      ? {
          submittedAt: row.pending_script_at ?? null,
          note: row.pending_script_note ?? null,
          message:
            "A new demo script is waiting. Nothing is re-filmed until the owner reviews it in the dashboard and presses re-record.",
        }
      : null,
  };

  if (!status) {
    if (row.is_draft) {
      return {
        ...base,
        state: "not-started",
        message: "Still a draft — drafts are not filmed.",
        next: "Filming starts only after the owner reviews the draft in the dashboard and presses publish.",
      };
    }
    return {
      ...base,
      state: "no-auto-demo",
      message: row.video_url
        ? "No auto-demo was requested — the work shows the video the owner uploaded."
        : "No auto-demo was requested for this work.",
      next: "The owner can request filming from the dashboard.",
    };
  }

  if (status === "done") {
    return {
      ...base,
      state: "done",
      message: videoUrl ? "The demo video is ready." : "Filming finished.",
      next: row.is_draft
        ? "It shows on the work's card once the owner publishes."
        : "Nothing to do — the video is already on the work's page and the owner's card.",
    };
  }

  if (status === "failed") {
    const { code, message } = parseDemoFailure(row.demo_build_error);
    const copy = en.demoFailure[code ?? "error"];
    return {
      ...base,
      state: "failed",
      message: `Filming failed: ${copy.title}.`,
      next: `${copy.body} ${RERECORD_HINT}`,
      failure: { code: code ?? "error", title: copy.title, body: copy.body, detail: message.slice(0, DETAIL_MAX) },
    };
  }

  if (status === "held") {
    // 보류 표시(demo_build_error 앞머리)는 사람용 한국어 문장이라 그대로 넘기지 않는다.
    // 대시보드 배지는 검토/그 밖 둘로만 가르지만, 크레딧 보류는 한도 초과가 아니라 우리 쪽
    // 사정이라 "승인 대기"라고 하면 틀린 말이 된다 — 여기선 셋으로 가른다.
    const marker = row.demo_build_error ?? "";
    const moderation = marker.startsWith("[moderation]");
    const credit = marker.startsWith("[credit]");
    return {
      ...base,
      state: "held",
      message: moderation
        ? "On hold for a quick content check before filming goes live."
        : credit
          ? "On hold — filming is paused on Nookframe's side for now and resumes automatically."
          : "On hold — past the daily auto-demo limit, waiting for approval.",
      next: moderation
        ? `${en.projects.heldModerationTip} Nothing to do but wait.`
        : credit
          ? "Nothing to do but wait."
          : `${en.projects.heldQuotaTip} Nothing to do but wait.`,
    };
  }

  if (status === "pending") {
    const waitedText = waited !== null && waited >= 1 ? ` (queued ${waited} min ago)` : "";
    return {
      ...base,
      state: "queued",
      slow: !paused && slow,
      message: paused
        ? `Waiting in the filming queue${waitedText}. Nookframe films in batches, so this can take a few hours — sometimes up to a day.${keepsOld}`
        : slow
          ? `Waiting in the filming queue${waitedText} — longer than usual, but still queued.${keepsOld}`
          : `Waiting in the filming queue${waitedText} — filming usually starts within a few minutes.${keepsOld}`,
      next: paused
        ? "Nothing to do — check again later (every few hours is plenty). The video appears on the owner's card by itself."
        : "Nothing to do — check again in a few minutes.",
    };
  }

  const stage = STAGE[status];
  if (stage) {
    return {
      ...base,
      state: "in-progress",
      stage: stage.key,
      slow,
      message:
        `Filming in progress — step ${stage.step} of 3: ${stage.label}.` +
        (slow ? ` It has been at this step for ${waited} min, longer than usual; stuck jobs are stopped automatically.` : "") +
        keepsOld,
      next: "Nothing to do — check again in a few minutes.",
    };
  }

  // 모르는 상태값 — 지어내지 말고 그대로 알린다.
  return { ...base, state: "queued", message: `Filming status: ${status}.`, next: "Check again later." };
}

/** 한 줄 요약 — CLI·원격 MCP가 같은 문장을 찍게 서버가 만들어 싣는다(포맷터가 두 벌이 되지 않게). */
export function filmingSummary(
  work: { id: string; title: string; isDraft: boolean },
  f: FilmingStatus,
): string {
  const where = work.isDraft ? "draft" : "public";
  const video = f.state === "done" && f.videoUrl ? ` ${f.videoUrl}` : "";
  return `${work.id} · ${work.title} · ${where} · filming: ${f.state}${f.stage ? ` (${f.stage})` : ""}${video}`;
}

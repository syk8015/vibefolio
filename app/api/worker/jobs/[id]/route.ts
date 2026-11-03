import { NextRequest, NextResponse } from "next/server";
import { requireWorker } from "@/lib/workerAuth";
import { apiError, bodyTooLarge } from "@/lib/apiError";
import {
  DEMO_FAILURE_CODES, formatDemoFailure, type DemoFailureCode,
} from "@/lib/demo-failure";
import {
  getJobBrief, ownerHandle, setPhase, markFailed, markDone, requeue,
  holdForCredit, holdForModeration, notifyDemoFailed, notifyDemoReady,
  IN_FLIGHT_STATUSES, setLocaleVideo, jobState, isInFlight, isJustDone, ownFilmKey, ownFilmUrlKey,
  type JobState,
} from "@/lib/workerOps";
import { normalizeCaptionTrack, normalizeLocale } from "@/lib/workLanguages";
import { BODY_TOO_LARGE, readJsonOr, MAX_MEDIUM_JSON_BYTES } from "@/lib/upload-safety";

// Every state transition the recorder used to write directly with the service-role
// key. One route, an `op` discriminator, so the auth gate and the "look the row up
// server-side" rule are stated once.
//
// GET returns the endcap @handle (profiles.username via the owner) — the only
// profile read the worker needs.
export const dynamic = "force-dynamic";

const PHASES = new Set<string>([...IN_FLIGHT_STATUSES]);

// 워커 비밀은 '지금 찍고 있는 그 작품'만 다룬다(2026-11-03, 보안 5단계 S6-F1). 입력 모양을 먼저 보고(400),
// 행이 없으면 404, 진행 중(또는 다른 언어 판이면 방금 끝난) 행이 아니면 409.
const notInFlight = () => apiError({ status: 409, message: "job is not in flight", code: "NOT_IN_FLIGHT" });
async function loadJob(id: string, allow: (s: JobState) => boolean): Promise<JobState | NextResponse> {
  const s = await jobState(id);
  if (!s) return apiError({ status: 404, message: "job not found", code: "NOT_FOUND" });
  return allow(s) ? s : notInFlight();
}
const badUrl = () => apiError({ status: 400, message: "video url must be this job's film in our storage", code: "BAD_URL" });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireWorker(req);
  if (denied) return denied;
  const { id } = await params;
  const handle = await ownerHandle(id);
  return NextResponse.json({ ok: true, handle });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const denied = requireWorker(req);
  if (denied) return denied;
  try {
    const { id } = await params;
    const body = await readJsonOr(req, MAX_MEDIUM_JSON_BYTES, {});
    if (body === BODY_TOO_LARGE) return bodyTooLarge();
    const op = body?.op;

    switch (op) {
      case "phase": {
        if (!PHASES.has(body?.phase)) {
          return apiError({ status: 400, message: "unknown phase", code: "BAD_REQUEST" });
        }
        const job = await loadJob(id, isInFlight);
        if (job instanceof NextResponse) return job;
        await setPhase(id, body.phase);
        return NextResponse.json({ ok: true });
      }

      case "requeue": {
        // Transient upstream outage — give the row back without burning the
        // owner's attempt. The worker bounds how often it may ask.
        const job = await loadJob(id, isInFlight);
        if (job instanceof NextResponse) return job;
        await requeue(id);
        return NextResponse.json({ ok: true });
      }

      // Status write only. Analytics and the completion mail are separate ops so
      // the worker keeps the exact ordering it had: upload → mark done → track →
      // notify. A mail outage must never roll back a published film.
      case "done": {
        const videoUrl = body?.videoUrl;
        if (typeof videoUrl !== "string" || !videoUrl) {
          return apiError({ status: 400, message: "videoUrl required", code: "BAD_REQUEST" });
        }
        const job = await loadJob(id, isInFlight);
        if (job instanceof NextResponse) return job;
        // 이 작품 촬영 폴더의 demo 영상만(sign-upload가 준 주소) — 바깥 주소·남의 폴더는 거절.
        const key = ownFilmUrlKey(job.user_id, id, videoUrl);
        if (!key || !/\/demo[^/]*\.mp4$/.test(key)) return badUrl();
        // 자막 시간표(작품 두 언어) — 모양이 어긋나면 자막 없이 영상만 공개한다(영상이 먼저).
        await markDone(id, videoUrl, normalizeCaptionTrack(body?.captions));
        return NextResponse.json({ ok: true });
      }

      case "locale-video": {
        const locale = normalizeLocale(body?.locale);
        const videoUrl = body?.videoUrl;
        if (!locale || typeof videoUrl !== "string" || !/^https:\/\//.test(videoUrl)) {
          return apiError({ status: 400, message: "locale and https videoUrl required", code: "BAD_REQUEST" });
        }
        // 기본 영상이 막 끝난 뒤 같은 배치에서 붙인다.
        const job = await loadJob(id, (s) => isInFlight(s) || isJustDone(s));
        if (job instanceof NextResponse) return job;
        const key = ownFilmUrlKey(job.user_id, id, videoUrl);
        if (!key || !/\/demo-(en|ko)-\d+\.mp4$/.test(key)) return badUrl();
        await setLocaleVideo(id, locale, videoUrl);
        return NextResponse.json({ ok: true });
      }

      case "notify-ready": {
        const job = await getJobBrief(id);
        if (!job) return apiError({ status: 404, message: "job not found", code: "NOT_FOUND" });
        const state = await loadJob(id, isJustDone);
        if (state instanceof NextResponse) return state;
        const notes = body?.notes;
        const videoUrl = typeof body?.videoUrl === "string" && ownFilmUrlKey(state.user_id, id, body.videoUrl)
          ? body.videoUrl as string : undefined;
        await notifyDemoReady(job, videoUrl, {
          landingOnly: notes?.landingOnly === true,
          guessedBeats: Number.isInteger(notes?.guessedBeats) && notes.guessedBeats > 0
            ? Math.min(notes.guessedBeats, 99) : 0,
        });
        return NextResponse.json({ ok: true });
      }

      case "failed": {
        const code: DemoFailureCode = (DEMO_FAILURE_CODES as readonly string[]).includes(body?.code)
          ? body.code
          : "error";
        const message = typeof body?.message === "string" ? body.message : "";
        const job = await getJobBrief(id);
        if (!job) return apiError({ status: 404, message: "job not found", code: "NOT_FOUND" });
        // 진행 중인 행만 실패로 적고, 적었을 때만 주인에게 메일(아무 주인에게 실패 메일 보내기 막음).
        if (await markFailed(id, formatDemoFailure(code, message))) await notifyDemoFailed(job, code);
        return NextResponse.json({ ok: true });
      }

      case "held-credit": {
        const job = await getJobBrief(id);
        if (!job) return apiError({ status: 404, message: "job not found", code: "NOT_FOUND" });
        const state = await loadJob(id, isInFlight);
        if (state instanceof NextResponse) return state;
        await holdForCredit(job, typeof body?.message === "string" ? body.message : "");
        return NextResponse.json({ ok: true });
      }

      case "held-moderation": {
        const job = await getJobBrief(id);
        if (!job) return apiError({ status: 404, message: "job not found", code: "NOT_FOUND" });
        const state = await loadJob(id, isInFlight);
        if (state instanceof NextResponse) return state;
        const categories = Array.isArray(body?.categories)
          ? body.categories.filter((c: unknown): c is string => typeof c === "string")
          : [];
        // 격리 키·주소는 이 작품 촬영 폴더의 것만 — 관리자 [거절]이 그 키를 지우고 [승인]이 그 주소를
        // 공개 영상으로 붙인다(S6-F2). 서버가 키에서 주소를 다시 만들어 맞춰 본다.
        const q = body?.quarantine;
        let quarantine = null;
        if (q != null) {
          const owner = state.user_id;
          const posterOk = q.posterKey == null
            ? q.posterUrl == null
            : ownFilmKey(owner, id, q.posterKey) && ownFilmUrlKey(owner, id, q.posterUrl) === q.posterKey;
          if ((q.storage !== "r2" && q.storage !== "supabase") || !ownFilmKey(owner, id, q.videoKey)
            || ownFilmUrlKey(owner, id, q.videoUrl) !== q.videoKey || !posterOk) {
            return apiError({ status: 400, message: "quarantine keys must be this job's film", code: "BAD_QUARANTINE" });
          }
          quarantine = {
            videoUrl: q.videoUrl as string, posterUrl: (q.posterUrl as string | null) ?? null,
            videoKey: q.videoKey as string, posterKey: (q.posterKey as string | null) ?? null,
            storage: q.storage as "r2" | "supabase",
          };
        }
        await holdForModeration(job, {
          categories,
          reason: typeof body?.reason === "string" ? body.reason : "",
          model: typeof body?.model === "string" ? body.model : "",
          quarantine,
        });
        return NextResponse.json({ ok: true });
      }

      default:
        return apiError({ status: 400, message: "unknown op", code: "BAD_REQUEST" });
    }
  } catch (err) {
    return apiError({ status: 500, message: "job update failed", code: "INTERNAL", cause: err });
  }
}

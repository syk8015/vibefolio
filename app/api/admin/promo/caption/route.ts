import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { apiError } from "@/lib/apiError";
import { isAdminEmail } from "@/lib/demoQuota";
import { PROMO_CAPTION_MODEL } from "@/lib/promo";

// SNS/커뮤니티 캡션 미리보기 생성 — DB에는 아무것도 쓰지 않는다(포스트 생성 시
// 편집된 최종 캡션이 /api/admin/promo/posts로 저장됨). 채널은 자유 텍스트라
// 고정 enum으로 분기하지 않고, 모델이 채널명에서 톤을 스스로 추론하게 한다.
const CAPTION_SYSTEM_PROMPT = `너는 Nookframe(바이브코딩 결과물을 라이브 링크로 전시하는 사이트) 홍보 담당자다.
로그인 후 메인 화면에서 도는 개발자 밈 태그라인의 타이핑 애니메이션을 찍은 5초 안팎 세로 영상에
붙일 SNS/커뮤니티 게시글 캡션을 하나 작성해라.

태그라인은 "질문 → ↳ 답글" 형태의 바이브코딩 자조/밈 유머다. 원문을 왜곡하지 말고, 그 유머가
왜 웃긴지 설명하지 말고(설명하면 재미없어짐), 영상이 그 자체로 훅이 되게 캡션은 짧고 톤을
보태는 역할만 해라.

채널 성격을 스스로 판단해서 분기해라:
- 짧은 영상형 채널(인스타 릴스·틱톡·유튜브 쇼츠 등): 1~2문장 + 해시태그 소수(3개 이하)
- 텍스트 게시판형 채널(스레드·디시인사이드·기타 개발자 커뮤니티 등): 3~6문장, 좀 더
  서술적이고 그 커뮤니티 특유의 드립을 살린 톤

광고 문구·상투적 후킹 표현("당신도 이렇게 될 수 있습니다" 류)은 쓰지 마라. 사람이 진짜로
쓸 법한 자연스러운 말투로. 마지막에 nookframe.com 언급은 선택(과하게 장사꾼처럼 안 보이게).`;

const CAPTION_SCHEMA = {
  type: "object",
  properties: { caption: { type: "string" } },
  required: ["caption"],
  additionalProperties: false,
};

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || !isAdminEmail(user.email)) {
      return apiError({ status: 404, message: "찾을 수 없어요.", code: "NOT_FOUND" });
    }

    let clipId = "";
    let channel = "";
    try {
      const body = await req.json();
      clipId = typeof body?.clipId === "string" ? body.clipId : "";
      channel = typeof body?.channel === "string" ? body.channel.trim() : "";
    } catch {
      // falls through to validation below
    }
    if (!clipId || !channel) {
      return apiError({ status: 400, message: "clipId와 channel이 필요해요.", code: "BAD_REQUEST" });
    }

    // tagline_text/reply는 클라이언트가 보내지 않고 서버가 clipId로 재조회한다
    // — 항상 실제 촬영된 문구 기준으로만 캡션이 생성되도록 보장.
    const admin = createAdminClient();
    const { data: clip, error: clipErr } = await admin
      .from("promo_clips")
      .select("tagline_text, tagline_reply")
      .eq("id", clipId)
      .single();
    if (clipErr || !clip) {
      return apiError({ status: 404, message: "클립을 찾을 수 없어요.", code: "NOT_FOUND" });
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return apiError({ status: 500, message: "ANTHROPIC_API_KEY가 설정되지 않았어요.", code: "NO_API_KEY" });
    }

    const userText =
      `채널: ${channel}\n태그라인: ${clip.tagline_text}` +
      (clip.tagline_reply ? `\n↳ 답글: ${clip.tagline_reply}` : "");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: PROMO_CAPTION_MODEL,
        max_tokens: 400,
        system: CAPTION_SYSTEM_PROMPT,
        output_config: { format: { type: "json_schema", schema: CAPTION_SCHEMA } },
        messages: [{ role: "user", content: userText }],
      }),
    });
    if (!res.ok) {
      return apiError({
        status: 502,
        message: "캡션 생성에 실패했어요. 다시 시도하거나 직접 입력해 주세요.",
        code: "CAPTION_GENERATION_FAILED",
        cause: await res.text().catch(() => res.statusText),
        context: { status: res.status },
      });
    }
    const data = await res.json();
    const raw = data?.content?.[0]?.text;
    let caption = "";
    try {
      caption = typeof raw === "string" ? JSON.parse(raw).caption : "";
    } catch {
      caption = "";
    }
    if (!caption) {
      return apiError({
        status: 502,
        message: "캡션 생성에 실패했어요. 다시 시도하거나 직접 입력해 주세요.",
        code: "CAPTION_PARSE_FAILED",
      });
    }

    return NextResponse.json({ ok: true, caption });
  } catch (err) {
    return apiError({ status: 500, message: "잠시 후 다시 시도해 주세요.", code: "INTERNAL", cause: err });
  }
}

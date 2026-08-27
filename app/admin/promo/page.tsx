import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/demoQuota";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { promoTrackingUrl } from "@/lib/promo";
import { Panel, SectionTitle, MonoAside, Ledger, type LedgerEntry } from "../panels";
import TaglinePicker, { type TaglineShots } from "./TaglinePicker";
import ClipGallery, { type ClipData } from "./ClipGallery";
import PerfRank, { type PerfRow } from "./PerfRank";
import type { ClipPost } from "./ClipCard";

// 홍보 클립 관리 — 관제탑(/admin)과 워크플로우 성격이 달라(운영 모니터링 vs
// 콘텐츠 제작·배포) 별도 페이지로 분리했다. /admin 헤더 링크로 연결됨.
export const dynamic = "force-dynamic";

export default async function PromoPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminEmail(user.email)) notFound();

  const admin = createAdminClient();
  const now = Date.now();

  const [clipsRes, postsRes, eventsRes] = await Promise.all([
    admin
      .from("promo_clips")
      .select(
        "id, status, tagline_text, tagline_reply, caption, format, opening, video_url, poster_url, error, created_at",
      )
      .order("created_at", { ascending: false }),
    admin
      .from("promo_posts")
      .select("id, clip_id, channel, status, created_at")
      .order("created_at", { ascending: false }),
    // /admin/page.tsx와 같은 정책: 서버에서 event만 좁히고 나머지(campaign 매칭·
    // 그루핑)는 JS에서 처리한다 — JSON 연산자 필터 문법 실수 위험을 피한다.
    admin
      .from("analytics_events")
      .select("event, props")
      .in("event", [AnalyticsEvent.PromoLinkVisit, AnalyticsEvent.SignupCompleted]),
  ]);

  const clips = clipsRes.data ?? [];
  const posts = postsRes.data ?? [];

  // postId(= utm_campaign의 'promo-' 뒷부분) → 유입/가입 카운트.
  const statsByPostId = new Map<string, { visits: number; signups: number }>();
  for (const ev of eventsRes.data ?? []) {
    const campaign = (ev.props as Record<string, unknown> | null)?.utm_campaign;
    if (typeof campaign !== "string" || !campaign.startsWith("promo-")) continue;
    const postId = campaign.slice("promo-".length);
    const bucket = statsByPostId.get(postId) ?? { visits: 0, signups: 0 };
    if (ev.event === AnalyticsEvent.PromoLinkVisit) bucket.visits++;
    else if (ev.event === AnalyticsEvent.SignupCompleted) bucket.signups++;
    statsByPostId.set(postId, bucket);
  }

  const postsByClipId = new Map<string, ClipPost[]>();
  // 클립 단위 합계 — "어떤 태그라인이 먹혔나"를 보려면 채널이 아니라 클립으로
  // 묶어야 한다(한 클립을 여러 채널에 올리면 포스트가 여러 개로 쪼개진다).
  const clipStats = new Map<string, { visits: number; signups: number }>();
  const channelStats = new Map<string, { visits: number; signups: number }>();
  let totalVisits = 0;
  let totalSignups = 0;
  let postedCount = 0;
  for (const p of posts) {
    const stats = statsByPostId.get(p.id) ?? { visits: 0, signups: 0 };
    totalVisits += stats.visits;
    totalSignups += stats.signups;
    if (p.status === "posted") postedCount++;
    const ch = channelStats.get(p.channel) ?? { visits: 0, signups: 0 };
    ch.visits += stats.visits;
    ch.signups += stats.signups;
    channelStats.set(p.channel, ch);
    const cl = clipStats.get(p.clip_id) ?? { visits: 0, signups: 0 };
    cl.visits += stats.visits;
    cl.signups += stats.signups;
    clipStats.set(p.clip_id, cl);

    const row: ClipPost = {
      id: p.id,
      channel: p.channel,
      trackingUrl: promoTrackingUrl({ channel: p.channel, postId: p.id }),
      visits: stats.visits,
      signups: stats.signups,
    };
    const arr = postsByClipId.get(p.clip_id) ?? [];
    arr.push(row);
    postsByClipId.set(p.clip_id, arr);
  }

  const clipData: ClipData[] = clips.map((c) => ({
    id: c.id,
    taglineText: c.tagline_text,
    taglineReply: c.tagline_reply,
    caption: c.caption,
    status: c.status as ClipData["status"],
    format: c.format as ClipData["format"],
    opening: (c.opening ?? "hook") as ClipData["opening"],
    videoUrl: c.video_url,
    posterUrl: c.poster_url,
    error: c.error,
    posts: postsByClipId.get(c.id) ?? [],
    visits: clipStats.get(c.id)?.visits ?? 0,
    signups: clipStats.get(c.id)?.signups ?? 0,
  }));

  // 같은 문구를 다시 찍으면 클립 행이 하나 더 생기므로, 성적은 **문구 기준**으로
  // 합쳐야 비교가 된다.
  const byTagline = new Map<string, PerfRow>();
  for (const c of clipData) {
    const row = byTagline.get(c.taglineText) ?? {
      label: c.taglineText,
      sub: c.taglineReply,
      visits: 0,
      signups: 0,
    };
    row.visits += c.visits;
    row.signups += c.signups;
    byTagline.set(c.taglineText, row);
  }
  const taglineRank = [...byTagline.values()].sort(
    (a, b) => b.visits - a.visits || b.signups - a.signups || a.label.localeCompare(b.label),
  );

  // 태그라인 풀에서 "이미 찍은 문구"를 표시하려고 문구 텍스트로 묶는다
  // (promo_clips에 문구 원문이 그대로 저장돼 있어 조인이 필요 없다).
  const taglineShots: TaglineShots = {};
  for (const c of clips) {
    const bucket = (taglineShots[c.tagline_text] ??= { done: 0, queued: 0, failed: 0 });
    if (c.status === "done") bucket.done++;
    else if (c.status === "failed") bucket.failed++;
    else bucket.queued++;
  }

  const doneCount = clips.filter((c) => c.status === "done").length;
  const pendingCount = clips.filter((c) => c.status === "pending" || c.status === "recording").length;
  const conv = totalVisits > 0 ? Math.round((totalSignups / totalVisits) * 100) : null;

  const ledger: LedgerEntry[] = [
    { label: "클립", value: clips.length, sub: `완료 ${doneCount} · 대기 ${pendingCount}`, state: "plain" },
    { label: "올린 채널", value: posts.length, sub: `게시완료 ${postedCount}`, state: "plain" },
    { label: "유입", value: totalVisits, sub: "추적 링크 첫 방문 (30일 제한 없음)", state: "plain" },
    {
      label: "가입",
      value: totalSignups,
      sub: conv !== null ? `전환율 ${conv}%` : "아직 유입이 없어요",
      state: totalSignups > 0 ? "ok" : "plain",
    },
  ];

  const channelRank: PerfRow[] = [...channelStats.entries()]
    .map(([label, v]) => ({ label, visits: v.visits, signups: v.signups }))
    .sort((a, b) => b.visits - a.visits || b.signups - a.signups);

  return (
    <main
      className="mx-auto px-5 lg:px-10 py-10"
      style={{ maxWidth: "1680px", fontFamily: "var(--font-nunito)", color: "var(--text-primary)" }}
    >
      {/* 폰에서는 제목과 시각을 세로로 — [[app/admin/page.tsx]] 헤더와 같은 이유. */}
      <div className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-4 mb-6">
        <h1 className="vf-serif-display" style={{ fontSize: "1.9rem" }}>홍보 클립 관리</h1>
        <span className="vf-mono" style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
          {new Date(now).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST · 새로고침하면 갱신
        </span>
      </div>

      <div className="mb-8">
        <Ledger entries={ledger} />
      </div>

      <section className="mb-8">
        <SectionTitle aside={<MonoAside>촬영 대기 {pendingCount}</MonoAside>}>촬영</SectionTitle>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
          <div className="xl:col-span-8">
            <Panel title="태그라인 풀" aside={<MonoAside>문구를 누르면 촬영 큐에 추가</MonoAside>}>
              <TaglinePicker shots={taglineShots} />
            </Panel>
          </div>
          <div className="xl:col-span-4">
            <Panel title="촬영 안내">
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                큐에 추가한 뒤, 터미널에서
              </p>
              <code
                className="vf-mono block mt-2 px-3 py-2 rounded-lg"
                style={{ background: "var(--surface-soft)", fontSize: "0.75rem" }}
              >
                npm run promo:batch
              </code>
              <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
                를 실행하면 큐가 소화되며 촬영이 시작돼요. 화면 없이(헤드리스) 찍기 때문에
                창이 뜨지 않고, 촬영 중에도 맥을 그대로 쓰면 돼요. 편당 40초쯤 걸려요.
              </p>
            </Panel>
          </div>
        </div>
      </section>

      <section className="mb-8">
        <SectionTitle aside={<MonoAside>완료 {doneCount}</MonoAside>}>클립 &amp; 업로드 기록</SectionTitle>
        <ClipGallery clips={clipData} />
      </section>

      <section>
        <SectionTitle>효과</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          <Panel title="문구별 성적" aside={<MonoAside>유입 많은 순</MonoAside>}>
            <PerfRank rows={taglineRank} empty="아직 유입이 없어요. 추적 링크로 올린 뒤에 쌓여요." />
          </Panel>
          <Panel title="채널별 성적" aside={<MonoAside>합계 {totalVisits}</MonoAside>}>
            <PerfRank rows={channelRank} empty="아직 유입이 없어요." />
          </Panel>
        </div>
      </section>
    </main>
  );
}

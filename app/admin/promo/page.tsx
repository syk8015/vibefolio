import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isAdminEmail } from "@/lib/demoQuota";
import { AnalyticsEvent } from "@/lib/analytics-events";
import { promoTrackingUrl } from "@/lib/promo";
import { Panel, SectionTitle, MonoAside, Ledger, type LedgerEntry, RankList } from "../panels";
import TaglinePicker from "./TaglinePicker";
import ClipGallery, { type ClipData } from "./ClipGallery";
import type { PostRowData } from "./PostRow";

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
      .select("id, status, tagline_text, tagline_reply, video_url, poster_url, error, created_at")
      .order("created_at", { ascending: false }),
    admin
      .from("promo_posts")
      .select("id, clip_id, channel, caption, status, post_url, created_at")
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

  const postsByClipId = new Map<string, PostRowData[]>();
  const channelStats = new Map<string, number>();
  let totalVisits = 0;
  let totalSignups = 0;
  let postedCount = 0;
  for (const p of posts) {
    const stats = statsByPostId.get(p.id) ?? { visits: 0, signups: 0 };
    totalVisits += stats.visits;
    totalSignups += stats.signups;
    if (p.status === "posted") postedCount++;
    channelStats.set(p.channel, (channelStats.get(p.channel) ?? 0) + stats.visits);

    const row: PostRowData = {
      id: p.id,
      channel: p.channel,
      caption: p.caption,
      status: p.status as "draft" | "posted",
      postUrl: p.post_url,
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
    status: c.status as ClipData["status"],
    videoUrl: c.video_url,
    posterUrl: c.poster_url,
    error: c.error,
    posts: postsByClipId.get(c.id) ?? [],
  }));

  const doneCount = clips.filter((c) => c.status === "done").length;
  const pendingCount = clips.filter((c) => c.status === "pending" || c.status === "recording").length;
  const conv = totalVisits > 0 ? Math.round((totalSignups / totalVisits) * 100) : null;

  const ledger: LedgerEntry[] = [
    { label: "클립", value: clips.length, sub: `완료 ${doneCount} · 대기 ${pendingCount}`, state: "plain" },
    { label: "포스트", value: posts.length, sub: `게시완료 ${postedCount}`, state: "plain" },
    { label: "유입", value: totalVisits, sub: "추적 링크 첫 방문 (30일 제한 없음)", state: "plain" },
    {
      label: "가입",
      value: totalSignups,
      sub: conv !== null ? `전환율 ${conv}%` : "아직 유입이 없어요",
      state: totalSignups > 0 ? "ok" : "plain",
    },
  ];

  const channelRank = [...channelStats.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <main
      className="mx-auto px-5 lg:px-10 py-10"
      style={{ maxWidth: "1680px", fontFamily: "var(--font-nunito)", color: "var(--text-primary)" }}
    >
      <div className="flex items-baseline gap-4 mb-6">
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
              <TaglinePicker />
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
                를 실행하면 큐가 소화되며 실제 촬영이 시작돼요(Chrome 창이 떠요 — 그동안
                마우스·키보드를 건드리지 마세요). 로그인 세션이 없으면{" "}
                <code className="vf-mono" style={{ fontSize: "0.75rem" }}>--login-only</code>로 먼저
                로그인해 주세요.
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
        <SectionTitle>채널별 효과</SectionTitle>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Panel title="채널별 유입" aside={<MonoAside>합계 {totalVisits}</MonoAside>}>
            <RankList rows={channelRank} empty="아직 유입이 없어요." />
          </Panel>
        </div>
      </section>
    </main>
  );
}

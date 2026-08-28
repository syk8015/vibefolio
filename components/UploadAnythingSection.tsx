import type { Locale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/dictionaries";

// "무엇을 올리든" — 랜딩 두 번째 섹션 (2026-08-29, FAQ 4문답을 대체).
//
// 왼쪽 밴드(입력)만 15초에 여섯 번 바뀌고, 오른쪽 밴드(시연 영상)는 안 바뀐다.
// 그 대비가 이 섹션이 하는 말 전부다 — "무엇을 올리든 영상이 된다". 문장으로
// 설명하지 않고 목록으로 증명하는 쪽을 골랐다(2026-08-28 사용자 확정).
//
// 세 가지가 설계의 뼈대다:
//  1. **영상 파일 0개.** 오른쪽 필름도 전부 CSS 모션이다. 랜딩 두 번째 섹션의
//     무게는 곧 이탈이고, 방금 폰트를 478→307KB로 줄인 판이다([[project_perf]]).
//  2. **밴드 → 화살표 → 밴드.** FAQ가 쓰던 문법 그대로다. 2026-05-22에 카드형
//     1·2·3을 물린 이유가 톤 충돌이었으므로, 새 문법을 만들지 않았다.
//  3. **화면 한 판을 통째로 차지한다.** 아래 라이브 쇼케이스가 스크롤 조금에
//     같이 삐져나오면 재생되는 것이 연달아 두 번이라 둘 다 죽는다.
//
// JS를 한 줄도 안 쓴다(순수 CSS 애니메이션) → 서버 컴포넌트. 클래스·키프레임은
// globals.css의 "무엇을 올리든" 절에 있다.
//
// ⚠️ 필름 안 커서 좌표는 352×166 상자 기준 실측 픽셀이다. 상자 크기나 내부
// 여백을 건드리면 커서가 엉뚱한 데를 누른다 — CSS와 이 파일을 같이 고칠 것.

const DELAY = ["vf-ua-d0", "vf-ua-d1", "vf-ua-d2", "vf-ua-d3", "vf-ua-d4", "vf-ua-d5"];

export default function UploadAnythingSection({ locale }: { locale: Locale }) {
  const t = getDictionary(locale).uploadAnything;

  return (
    <section
      className="vf-ua"
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "clamp(28px, 4vw, 44px)",
        padding: "80px clamp(16px, 4vw, 60px)",
      }}
    >
      <h2
        style={{
          margin: 0,
          fontFamily: "var(--font-serif), 'Noto Serif KR', serif",
          fontWeight: 600,
          fontSize: "clamp(1.7rem, 4.4vw, 2.625rem)",
          lineHeight: 1.3,
          letterSpacing: "-0.02em",
          color: "var(--text-primary)",
          textAlign: "center",
          wordBreak: "keep-all",
        }}
      >
        {t.headline}
      </h2>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, flexWrap: "wrap" }}>
        {t.types.map((label, i) => (
          <span key={label} className={`vf-ua-pill ${DELAY[i]}`}>{label}</span>
        ))}
      </div>

      <div className="vf-ua-pair" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 28 }}>

        {/* 왼쪽: 입력. 여섯 장이 겹쳐 있고 차례로 나타난다. */}
        <div className="vf-ua-band" style={{ position: "relative", width: 400, maxWidth: "100%", borderRadius: 16 }}>

          <div className={`vf-ua-slide ${DELAY[0]}`}>
            <SlideLabel>{t.types[0]}</SlideLabel>
            <div style={fieldRow}>
              <GlobeIcon />
              <span style={mono(13.5)}>{t.urlSample}</span>
            </div>
          </div>

          <div className={`vf-ua-slide ${DELAY[1]}`}>
            <SlideLabel>{t.types[1]}</SlideLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              <div style={rowFlex}><FolderIcon /><span style={mono(13.5)}>{t.folderRoot}</span></div>
              {t.folderFiles.map((f) => (
                <div key={f} style={{ ...rowFlex, paddingLeft: 24 }}><span style={sq} /><span style={mono(12.5)}>{f}</span></div>
              ))}
            </div>
          </div>

          <div className={`vf-ua-slide ${DELAY[2]}`}>
            <SlideLabel>{t.types[2]}</SlideLabel>
            <div style={fieldRow}>
              <BranchIcon />
              <span style={mono(13.5)}>{t.repoSample}</span>
            </div>
          </div>

          <div className={`vf-ua-slide ${DELAY[3]}`}>
            <SlideLabel>{t.types[3]}</SlideLabel>
            <div style={{ ...fieldRow, flexDirection: "column", alignItems: "flex-start", gap: 8 }}>
              <span style={mono(13)}>{t.pyFile}</span>
              {t.pyLines.map((l) => (
                <span key={l} style={{ ...mono(12), color: "var(--text-muted)" }}>{l}</span>
              ))}
            </div>
          </div>

          <div className={`vf-ua-slide ${DELAY[4]}`}>
            <SlideLabel>{t.types[4]}</SlideLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
              {t.phoneFiles.map((f) => (
                <div key={f} style={rowFlex}><span style={sq} /><span style={mono(12.5)}>{f}</span></div>
              ))}
            </div>
          </div>

          <div className={`vf-ua-slide ${DELAY[5]}`}>
            <SlideLabel>{t.types[5]}</SlideLabel>
            <div style={{ ...fieldRow, flexDirection: "column", alignItems: "stretch", gap: 11, padding: 15 }}>
              <span style={{ ...bar, width: "58%", height: 10 }} />
              <span style={{ ...bar, width: "82%", height: 8, background: "var(--blue-tint)" }} />
              <span style={{ ...bar, width: "36%", height: 8, background: "var(--blue-tint)" }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
                <span style={{ width: 60, height: 22, borderRadius: 999, background: "var(--border-bright)" }} />
                <span style={{ ...mono(11), color: "var(--text-muted)" }}>{t.wipNote}</span>
              </div>
            </div>
          </div>
        </div>

        <span
          className="vf-ua-arrow"
          aria-hidden
          style={{ fontFamily: "var(--font-mono), monospace", fontSize: "1.2rem", lineHeight: 1.25, color: "var(--text-muted)", flex: "0 0 auto" }}
        >
          →
        </span>

        {/* 오른쪽: 결과. 무엇을 넣든 이건 안 바뀐다 — 대신 안에서 시연이 돈다. */}
        <div className="vf-ua-band vf-ua-band-film" style={{ width: 400, maxWidth: "100%", borderRadius: 16, padding: "22px 24px", boxSizing: "border-box", display: "flex", flexDirection: "column", gap: 12 }}>
          <p style={{ ...mono(11), margin: 0, letterSpacing: "0.06em", color: "var(--text-muted)" }}>{t.filmLabel}</p>
          <div className="vf-ua-filmbox"><Film t={t} /></div>
        </div>
      </div>

      <div style={{ position: "relative", width: "100%", height: 18 }}>
        {t.captions.map((c, i) => (
          <p key={c} className={`vf-ua-cap ${DELAY[i]}`}>{`/  ${c}  */`.replace("/ ", "/* ")}</p>
        ))}
      </div>
    </section>
  );
}

/* ── 필름 ────────────────────────────────────────────────────────────────
   대본: 입력칸 클릭 → 타이핑 → [추가] → 새 줄 → 1번 줄 체크.
   안쪽은 "남이 만든 앱"이라 우리 테마를 따라가지 않는다(고정색, CSS의 --vf-ua-*). */
function Film({ t }: { t: ReturnType<typeof getDictionary>["uploadAnything"] }) {
  return (
    <div className="vf-ua-film" style={{ borderRadius: 10, overflow: "hidden", background: "var(--vf-ua-paper)", boxShadow: "inset 0 0 0 1px rgba(26,22,18,0.06), 0 2px 10px rgba(26,22,18,0.07)" }}>

      <div style={{ height: 26, background: "var(--vf-ua-head)", borderBottom: "1px solid var(--vf-ua-head-line)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 11px" }}>
        <span style={{ ...ui(10.5), fontWeight: 600, color: "#6a5e4e" }}>{t.demo.title}</span>
        <span style={{ ...ui(9.5), color: "#b4a68d" }}>{t.demo.date}</span>
      </div>

      <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4 }}>

        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div className="vf-ua-anim" style={{ flex: 1, height: 22, borderRadius: 6, display: "flex", alignItems: "center", padding: "0 8px", boxSizing: "border-box", animationName: "vf-ua-field" }}>
            {/* 글자 하나씩 열린다 — 글상자 폭을 steps()로 자르면 한 칸이 글자 폭과
                안 맞아 글자가 반쯤 잘려 보인다(한글·영문 둘 다 겪음). 12글자까지만
                제 차례가 있고, 넘치면 마지막 차례를 같이 쓴다. */}
            <span style={{ ...ui(11.5), color: "var(--vf-ua-ink)" }}>
              {Array.from(t.demo.typed).map((ch, i) => (
                <span key={i} className={`vf-ua-ch vf-ua-ch${Math.min(i + 1, 12)}`}>{ch}</span>
              ))}
            </span>
            <span className="vf-ua-anim vf-ua-caret" style={{ display: "inline-block", width: 1.5, height: 12, background: "var(--vf-ua-ink)", marginLeft: 1.5, animationName: "vf-ua-caret" }} />
          </div>
          <div className="vf-ua-anim" style={{ width: 52, height: 22, borderRadius: 6, background: "var(--vf-ua-ink)", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 auto", animationName: "vf-ua-press" }}>
            <span style={{ ...ui(10.5), fontWeight: 600, color: "#f4ede0" }}>{t.demo.add}</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9, height: 21 }}>
          <div className="vf-ua-anim vf-ua-tickbox" style={{ position: "relative", width: 14, height: 14, borderRadius: 4, flex: "0 0 auto", animationName: "vf-ua-box" }}>
            <svg className="vf-ua-anim vf-ua-tick" width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden style={{ position: "absolute", left: 2, top: 2, animationName: "vf-ua-tick" }}>
              <path d="M1.6 6.2 L4.4 9 L10.2 3" stroke="#f4ede0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <span className="vf-ua-anim vf-ua-row1" style={{ ...ui(11.5), color: "var(--vf-ua-ink)", position: "relative", animationName: "vf-ua-faded" }}>
            {t.demo.row1}
            <span className="vf-ua-anim vf-ua-strike" style={{ position: "absolute", left: 0, top: "50%", height: 1, background: "var(--vf-ua-ink)", width: 0, animationName: "vf-ua-strike" }} />
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 9, height: 21 }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: "var(--vf-ua-box)", flex: "0 0 auto" }} />
          <span style={{ ...ui(11.5), color: "var(--vf-ua-ink)" }}>{t.demo.row2}</span>
        </div>

        <div className="vf-ua-anim vf-ua-added" style={{ display: "flex", alignItems: "center", gap: 9, height: 21, animationName: "vf-ua-added" }}>
          <span style={{ width: 14, height: 14, borderRadius: 4, background: "var(--vf-ua-box)", flex: "0 0 auto" }} />
          <span style={{ ...ui(11.5), color: "var(--vf-ua-ink)" }}>{t.demo.typed}</span>
        </div>
      </div>

      {/* 클릭 물결 — 커서가 닿는 그 지점에 놓았다(입력칸·추가·1번 체크칸 순) */}
      <div className="vf-ua-anim vf-ua-rip" style={{ left: 134, top: 33, animationName: "vf-ua-rip1" }} />
      <div className="vf-ua-anim vf-ua-rip" style={{ left: 301, top: 33, animationName: "vf-ua-rip2" }} />
      <div className="vf-ua-anim vf-ua-rip" style={{ left: 6, top: 58, animationName: "vf-ua-rip3" }} />

      <div className="vf-ua-anim vf-ua-ptr" style={{ position: "absolute", left: 0, top: 0, animationName: "vf-ua-ptr" }}>
        <svg className="vf-ua-anim" width="14" height="18" viewBox="0 0 14 18" fill="none" aria-hidden style={{ display: "block", transformOrigin: "2px 2px", animationName: "vf-ua-dip", filter: "drop-shadow(0 1px 2px rgba(26,22,18,0.28))" }}>
          <path d="M1 1 L1 14.2 L4.4 11.2 L6.6 16 L9 15 L6.8 10.3 L11.4 10.2 Z" fill="#1a1612" stroke="#ffffff" strokeWidth="1" strokeLinejoin="round" />
        </svg>
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 26, background: "linear-gradient(rgba(255,255,255,0), rgba(255,255,255,0.92) 55%)", display: "flex", alignItems: "flex-end", gap: 8, padding: "0 11px 7px" }}>
        <svg width="8" height="9" viewBox="0 0 8 9" fill="none" aria-hidden>
          <rect x="0.6" y="0.6" width="2.2" height="7.8" rx="0.7" fill="rgba(26,22,18,0.45)" />
          <rect x="5.2" y="0.6" width="2.2" height="7.8" rx="0.7" fill="rgba(26,22,18,0.45)" />
        </svg>
        <div style={{ flex: 1, height: 3, borderRadius: 3, background: "rgba(26,22,18,0.14)" }}>
          <div className="vf-ua-anim vf-ua-prog-fill" style={{ height: 3, borderRadius: 3, background: "var(--vf-ua-ink)", animationName: "vf-ua-prog", position: "relative" }}>
            <span style={{ position: "absolute", right: -3, top: -2.5, width: 8, height: 8, borderRadius: "50%", background: "var(--vf-ua-ink)" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── 조각들 ─────────────────────────────────────────────────────────── */

function SlideLabel({ children }: { children: React.ReactNode }) {
  return <p style={{ ...mono(11), margin: "0 0 14px", letterSpacing: "0.06em", color: "var(--text-muted)" }}>{children}</p>;
}

const mono = (size: number): React.CSSProperties => ({
  fontFamily: "var(--font-mono), monospace",
  fontSize: size,
  color: "var(--text-secondary)",
});

const ui = (size: number): React.CSSProperties => ({
  fontFamily: "var(--font-nunito), sans-serif",
  fontSize: size,
  letterSpacing: "-0.01em",
});

const fieldRow: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  background: "var(--bg)",
  borderRadius: 10,
  padding: "13px 15px",
};

const rowFlex: React.CSSProperties = { display: "flex", alignItems: "center", gap: 9 };

const sq: React.CSSProperties = { width: 13, height: 13, borderRadius: 3, background: "var(--border-bright)", flex: "0 0 auto" };

const bar: React.CSSProperties = { display: "block", borderRadius: 3, background: "var(--blue-tint-strong)" };

function GlobeIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden style={{ flex: "0 0 auto" }}>
      <circle cx="8" cy="8" r="6.4" stroke="currentColor" strokeWidth="1.3" style={{ color: "var(--text-muted)" }} />
      <path d="M1.6 8h12.8M8 1.6c1.7 1.8 2.6 4 2.6 6.4S9.7 12.6 8 14.4C6.3 12.6 5.4 10.4 5.4 8S6.3 3.4 8 1.6z" stroke="currentColor" strokeWidth="1.3" style={{ color: "var(--text-muted)" }} />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden style={{ flex: "0 0 auto" }}>
      <path d="M1.6 4.2a1.2 1.2 0 011.2-1.2h3l1.4 1.6h5a1.2 1.2 0 011.2 1.2v6.4a1.2 1.2 0 01-1.2 1.2H2.8a1.2 1.2 0 01-1.2-1.2V4.2z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" style={{ color: "var(--text-secondary)" }} />
    </svg>
  );
}

function BranchIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden style={{ flex: "0 0 auto", color: "var(--text-muted)" }}>
      <circle cx="4" cy="3.6" r="1.7" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="4" cy="12.4" r="1.7" stroke="currentColor" strokeWidth="1.3" />
      <circle cx="12" cy="3.6" r="1.7" stroke="currentColor" strokeWidth="1.3" />
      <path d="M4 5.3v5.4M12 5.3c0 3-2.7 3.4-5.4 3.9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}

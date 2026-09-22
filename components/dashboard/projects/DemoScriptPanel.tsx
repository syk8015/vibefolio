"use client";

import { useId, useState } from "react";
import {
  isStepWired, isStepSubstantial,
  DEMO_SCRIPT_MIN_STEPS, DEMO_SCRIPT_MIN_SUBSTANTIAL,
  type DemoScript, type DemoScriptStep,
} from "@/lib/demoScript";
import { useT } from "@/lib/i18n/client";
import { useMediaQuery } from "@/lib/useMediaQuery";

// "촬영 대본" — 필름 띠(2026-09-15 사용자 선택). 처음 패널은 2026-08-25.
//
// 대본은 곧 필름이다(로봇이 이 스텝만 찍고 멈춘다). 그래서 목록 대신 필름 띠로 보여준다:
// 칸 하나가 장면 하나, 칸 너비는 그 장면에 머무는 시간. 아래 카드는 한 번에 한 장면만
// 크게 보여주고 셀렉터 같은 세부는 작게 둔다(토스의 "하나를 크게").
// 띠는 영상처럼 저절로 넘어간다 — 칸 아래 막대가 차면 다음 장면. 마우스를 올리면 잠깐
// 멈추고(CSS), 장면을 직접 누르거나 옮기면 거기서 멈춘다(읽는 도중에 넘어가지 않게).
//
// "정밀" 판정은 러너의 직배선 게이트와 **같은 함수**(lib/demoScript isStepWired)다 —
// 둘이 갈리면 화면이 거짓말을 한다. 사람이 할 수 있는 건 빼기·순서까지(셀렉터·문구는
// AI 몫, 08-25 결정)이고, 발행 게이트의 바닥(최소 스텝·실속 스텝)을 같은 상수로 지킨다 —
// 화면이 서버가 거절할 대본을 저장하게 두면 안 되니까.

// hold가 없는 장면은 리플레이 기본 페이싱(HOLD_MS 900)을 탄다 — 칸 너비도 그 값으로.
const DEFAULT_HOLD_S = 0.9;
const holdOf = (st: DemoScriptStep) => (typeof st.hold === "number" && st.hold > 0 ? st.hold : DEFAULT_HOLD_S);
// 자동 넘김 속도: 필름의 머무는 시간을 따르되, 한 장면을 읽을 틈(최소 2.2초)은 준다.
const playSeconds = (hold: number) => Math.max(2.2, hold * 1.4);
const fmtSec = (s: number) => String(Math.round(s * 10) / 10);

export function DemoScriptPanel({ script, loading = false, onChange }: {
  script: DemoScript | null;
  // 대본(비공개 칸)을 아직 못 받았다 — "대본 없음"은 거짓이라 빈 자리만 보여 준다.
  loading?: boolean;
  onChange?: (next: DemoScript) => void;
}) {
  const { t } = useT();
  const uid = useId();
  const reduceMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const [selRaw, setSel] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [userPaused, setUserPaused] = useState(false);
  const steps = script?.steps ?? [];

  if (loading && !steps.length) {
    return (
      <div
        aria-busy="true"
        className="rounded-xl animate-pulse"
        style={{ height: 72, background: "var(--surface-sunken)" }}
      />
    );
  }

  // 대본 없음 = 제작자가 시연 영상을 직접 준 경우(발행 게이트의 유일한 면제).
  if (!steps.length) {
    return (
      <p className="text-sm" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", margin: 0 }}>
        {t.projects.scriptNone}
      </p>
    );
  }

  const n = steps.length;
  const sel = Math.min(selRaw, n - 1);
  const st = steps[sel];
  // 움직임 줄이기 설정이면 자동 넘김을 아예 하지 않는다(재생 버튼도 숨김).
  const paused = userPaused || reduceMotion;
  const wiredCount = steps.filter(isStepWired).length;
  const solid = steps.filter(isStepSubstantial).length;
  const total = steps.reduce((sum, s) => sum + holdOf(s), 0);
  const ticks = [0, 5, 10, 15, 20, 25, 30].filter((x) => x < total - 1.5).concat([total]);
  const actionLabels = t.projects.scriptActions as Record<string, string>;
  const tabId = (i: number) => `${uid}-scene-${i}`;
  const panelId = `${uid}-scene-panel`;

  const select = (i: number, d: 1 | -1, byUser: boolean) => {
    setDir(d);
    setSel(((i % n) + n) % n);
    if (byUser) setUserPaused(true);
  };
  const commit = (next: DemoScriptStep[]) => {
    if (script && onChange) onChange({ ...script, steps: next });
  };
  const move = (i: number, d: 1 | -1) => {
    const j = i + d;
    if (j < 0 || j >= n) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
    select(j, d, true);
  };
  const remove = (i: number) => {
    commit(steps.filter((_, k) => k !== i));
    select(Math.max(0, Math.min(i, n - 2)), 1, true);
  };
  // 왜 못 빼는지를 버튼이 말해준다 — 그냥 회색이면 "고장났나"가 된다.
  const removeBlock = (s: DemoScriptStep): string | null => {
    if (n <= DEMO_SCRIPT_MIN_STEPS) return t.projects.scriptFloorTip(DEMO_SCRIPT_MIN_STEPS);
    if (isStepSubstantial(s) && solid <= DEMO_SCRIPT_MIN_SUBSTANTIAL) {
      return t.projects.scriptFloorSolidTip(DEMO_SCRIPT_MIN_SUBSTANTIAL);
    }
    return null;
  };
  const onTabKey = (e: React.KeyboardEvent) => {
    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const next = (((sel + d) % n) + n) % n;
    select(next, d, true);
    document.getElementById(tabId(next))?.focus();
  };

  const block = onChange ? removeBlock(st) : null;
  const wiredNow = isStepWired(st);
  // 셀렉터가 없으면 로봇은 where(눈으로 찾는 법)로 화면을 뒤진다 — 감추지 않고 보여준다.
  const locator = st.selector ?? (st.where ? `${t.projects.scriptByEye}: ${st.where}` : null);
  const actionPart = st.action
    ? `${actionLabels[st.action] ?? st.action}${st.action === "type" && st.text ? ` ‘${st.text}’` : ""}`
    : null;
  const meta = [actionPart, t.projects.sceneHold(fmtSec(holdOf(st))), wiredNow ? null : t.projects.sceneByEye]
    .filter(Boolean)
    .join(" · ");

  const small: React.CSSProperties = {
    margin: 0, fontFamily: "var(--font-nunito)", fontSize: 13, lineHeight: 1.55, color: "var(--text-secondary)",
  };
  const iconBtn: React.CSSProperties = { width: 32, height: 32, color: "var(--text-primary)" };

  return (
    <div className="vf-strip-zone" data-paused={paused ? "true" : "false"}>
      <p style={{ ...small, marginBottom: 10 }}>{t.projects.stripHint(fmtSec(total))}</p>
      {wiredCount < n && (
        <p style={{ ...small, marginBottom: 10, color: "#b34747" }}>{t.projects.scriptPartialHelp}</p>
      )}

      <div role="tablist" aria-label={t.projects.scriptLabel} className="vf-strip" onKeyDown={onTabKey}>
        {steps.map((s, i) => {
          const hold = holdOf(s);
          return (
            <button
              key={`${i}-${s.goal}`}
              type="button"
              role="tab"
              id={tabId(i)}
              aria-selected={i === sel}
              aria-controls={panelId}
              tabIndex={i === sel ? 0 : -1}
              title={s.goal}
              className="vf-strip-cell"
              style={{ flexGrow: hold, ["--vf-dur" as string]: `${playSeconds(hold)}s` } as React.CSSProperties}
              onClick={() => select(i, i >= sel ? 1 : -1, true)}
            >
              <span>{i + 1}</span>
              <ActionGlyph action={s.action} />
              {!isStepWired(s) && <span className="vf-strip-warn" aria-hidden />}
              {/* 막대가 다 차면 다음 장면으로. 멈춤·호버 중엔 CSS가 애니메이션을 세운다. */}
              <span
                className="vf-strip-bar"
                aria-hidden
                onAnimationEnd={() => { if (!paused && i === sel) select(sel + 1, 1, false); }}
              />
            </button>
          );
        })}
      </div>
      <div className="vf-strip-ruler" aria-hidden>
        {ticks.map((x) => (
          <span key={x} style={{ left: `${(x / total) * 100}%` }}>{fmtSec(x)}{t.projects.sceneSecondsUnit}</span>
        ))}
      </div>

      <div id={panelId} role="tabpanel" aria-labelledby={tabId(sel)} className="vf-scene-card">
        <div className="flex items-center justify-between gap-3" style={{ marginBottom: 8 }}>
          <span style={{ ...small, fontVariantNumeric: "tabular-nums" }}>{t.projects.sceneCount(sel + 1, n)}</span>
          <div className="flex items-center gap-1.5">
            {!reduceMotion && (
              <button
                type="button" className="vf-icon-button" style={iconBtn}
                onClick={() => setUserPaused((p) => !p)}
                aria-label={paused ? t.projects.scenePlay : t.projects.scenePause}
                title={paused ? t.projects.scenePlay : t.projects.scenePause}
              >
                {paused ? <PlayGlyph /> : <PauseGlyph />}
              </button>
            )}
            <button
              type="button" className="vf-icon-button" style={iconBtn}
              onClick={() => select(sel - 1, -1, true)}
              aria-label={t.projects.scenePrev} title={t.projects.scenePrev}
            >
              <ArrowGlyph dir="left" />
            </button>
            <button
              type="button" className="vf-icon-button" style={iconBtn}
              onClick={() => select(sel + 1, 1, true)}
              aria-label={t.projects.sceneNext} title={t.projects.sceneNext}
            >
              <ArrowGlyph dir="right" />
            </button>
          </div>
        </div>

        {/* key=sel — 장면이 바뀔 때마다 새로 붙어, 넘어가는 방향에서 살짝 밀려 들어온다 */}
        <div
          key={sel}
          className="vf-scene-body"
          style={{ ["--vf-dx" as string]: `${dir * 12}px` } as React.CSSProperties}
        >
          <p
            style={{
              margin: 0, fontFamily: "var(--font-nunito)", fontSize: "1.15rem", fontWeight: 700,
              lineHeight: 1.4, letterSpacing: "-0.015em", color: "var(--text-primary)",
            }}
          >
            {st.goal}
          </p>
          <p style={{ ...small, marginTop: -4, color: wiredNow ? "var(--text-secondary)" : "#b34747" }}>{meta}</p>
          {(st.expect || locator) && (
            <dl className="vf-scene-kv">
              {st.expect && (
                <div>
                  <dt style={small}>{t.projects.sceneShows}</dt>
                  <dd
                    style={{
                      margin: 0, fontFamily: "var(--font-nunito)", fontSize: 14.5, lineHeight: 1.55,
                      color: "var(--text-primary)",
                    }}
                  >
                    {st.expect}
                  </dd>
                </div>
              )}
              {locator && (
                <div>
                  <dt style={small}>{t.projects.sceneTarget}</dt>
                  <dd
                    className="vf-mono"
                    style={{
                      margin: 0, fontSize: 12, lineHeight: 1.6, overflowWrap: "anywhere",
                      color: wiredNow ? "var(--text-secondary)" : "#b34747",
                    }}
                  >
                    {locator}
                  </dd>
                </div>
              )}
            </dl>
          )}
          {onChange && (
            <div className="flex flex-wrap items-center gap-1.5" style={{ marginTop: 2 }}>
              <button type="button" className="vf-scene-btn" disabled={sel === 0} onClick={() => move(sel, -1)}>
                <ArrowGlyph dir="left" />{t.projects.sceneEarlier}
              </button>
              <button type="button" className="vf-scene-btn" disabled={sel === n - 1} onClick={() => move(sel, 1)}>
                {t.projects.sceneLater}<ArrowGlyph dir="right" />
              </button>
              <button
                type="button" className="vf-scene-btn" data-danger="true" disabled={!!block}
                title={block ?? t.projects.scriptRemove}
                onClick={() => remove(sel)}
              >
                {t.projects.scriptRemove}
              </button>
              {block && <span style={small}>{block}</span>}
            </div>
          )}
        </div>
      </div>

      {script?.prep && <p style={{ ...small, marginTop: 10 }}>{t.projects.scriptPrep}: {script.prep}</p>}
      {script?.skip?.length ? (
        <p style={{ ...small, marginTop: 4 }}>{t.projects.scriptSkip}: {script.skip.join(" · ")}</p>
      ) : null}
    </div>
  );
}

// 칸 안의 동작 아이콘 — 좁은 칸에서는 CSS가 숨긴다(번호만 남음).
function ActionGlyph({ action }: { action?: string }) {
  const stroke = { stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let body: React.ReactNode = null;
  switch (action) {
    case "click":
      body = <path d="M5 2.5v9l2.3-2.1 1.6 3.9 1.8-.8-1.6-3.8h2.9L5 2.5z" fill="currentColor" />;
      break;
    case "type":
      body = (
        <>
          <rect x="1.5" y="4" width="13" height="8" rx="2" fill="none" {...stroke} />
          <path d="M4 7h1M7 7h2M11 7h1M5 9.5h6" fill="none" {...stroke} />
        </>
      );
      break;
    case "focus":
      body = <path d="M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zM10.5 10.5L14 14M5 7h4M7 5v4" fill="none" {...stroke} />;
      break;
    case "scroll":
      body = <path d="M8 2v12M5 5l3-3 3 3M5 11l3 3 3-3" fill="none" {...stroke} />;
      break;
    case "hover":
      body = <path d="M5 2.5v9l2.3-2.1 1.6 3.9 1.8-.8-1.6-3.8h2.9L5 2.5z" fill="none" {...stroke} />;
      break;
    case "drag":
      body = <path d="M8 2v12M2 8h12M6 4l2-2 2 2M6 12l2 2 2-2M4 6L2 8l2 2M12 6l2 2-2 2" fill="none" {...stroke} />;
      break;
    case "draw":
      body = <path d="M3 13l1-3.5L10.5 3 13 5.5 6.5 12 3 13z" fill="none" {...stroke} />;
      break;
    default:
      return null;
  }
  return <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>{body}</svg>;
}

function ArrowGlyph({ dir }: { dir: "left" | "right" }) {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d={dir === "left" ? "M13 8H3M7 4L3 8l4 4" : "M3 8h10M9 4l4 4-4 4"}
        stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

function PauseGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M5.5 3.5v9M10.5 3.5v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden>
      <path d="M5 3.2v9.6L12.5 8 5 3.2z" fill="currentColor" />
    </svg>
  );
}

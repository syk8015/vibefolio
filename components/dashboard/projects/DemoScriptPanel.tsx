"use client";

import {
  isStepWired, isStepSubstantial,
  DEMO_SCRIPT_MIN_STEPS, DEMO_SCRIPT_MIN_SUBSTANTIAL,
  type DemoScript, type DemoScriptStep,
} from "@/lib/demoScript";
import { useT } from "@/lib/i18n/client";

// 초안 검토 화면의 "촬영 대본" 패널 (2026-08-25).
//
// 수동 업로드를 폐기하면서 대본이 자동 시연 품질의 유일한 손잡이가 됐는데, 정작
// 사람이 그걸 볼 화면이 없었다 — AI가 이상한 대본을 줘도 잡아낼 지점이 0이었다.
// 여기서 보여주는 것은 "이 영상이 어떻게 찍힐지"의 전부다: 스텝 순서·무엇을
// 증명하는 비트인지·어떤 조작인지·로봇이 그 컨트롤을 확실히 아는지(셀렉터).
//
// 배지의 "정밀 촬영" 판정은 러너의 직배선 게이트와 **같은 함수**(lib/demoScript의
// isStepWired)를 쓴다. 둘이 갈리면 배지가 거짓말을 한다.
//
// 살짝 고치기(2026-09-04, 인터뷰 ⑥): onChange를 주면 스텝을 빼거나 순서를 바꿀 수
// 있다. 셀렉터·문구를 손으로 만지는 건 여전히 AI 몫(08-25 결정) — 사람이 할 수
// 있는 건 "이 비트는 필요 없다 / 이게 먼저다"까지다. 발행 게이트가 지키는 바닥
// (최소 스텝·실속 스텝)은 여기서도 같은 상수로 지킨다 — 화면이 서버가 거절할
// 대본을 저장하게 두면 안 되니까.
export function DemoScriptPanel({ script, onChange }: {
  script: DemoScript | null;
  onChange?: (next: DemoScript) => void;
}) {
  const { t } = useT();
  const steps = script?.steps ?? [];
  const wired = steps.filter(isStepWired).length;
  const solid = steps.filter(isStepSubstantial).length;
  const fully = steps.length > 0 && wired === steps.length;

  const labelStyle: React.CSSProperties = {
    color: "var(--text-muted)", fontFamily: "var(--font-nunito)",
    fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase",
  };

  // 대본 없음 = 제작자가 시연 영상을 직접 준 경우(발행 게이트의 유일한 면제).
  if (!steps.length) {
    return (
      <div>
        <p style={labelStyle}>{t.projects.scriptLabel}</p>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", margin: 0 }}>
          {t.projects.scriptNone}
        </p>
      </div>
    );
  }

  const actionLabels = t.projects.scriptActions as Record<string, string>;

  const commit = (nextSteps: DemoScriptStep[]) => {
    if (!script || !onChange) return;
    onChange({ ...script, steps: nextSteps });
  };
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= steps.length) return;
    const next = [...steps];
    [next[i], next[j]] = [next[j], next[i]];
    commit(next);
  };
  const remove = (i: number) => commit(steps.filter((_, k) => k !== i));
  // 왜 못 빼는지를 버튼이 말해준다 — 그냥 회색이면 "고장났나"가 된다.
  const removeBlock = (st: DemoScriptStep): string | null => {
    if (steps.length <= DEMO_SCRIPT_MIN_STEPS) return t.projects.scriptFloorTip(DEMO_SCRIPT_MIN_STEPS);
    if (isStepSubstantial(st) && solid <= DEMO_SCRIPT_MIN_SUBSTANTIAL) {
      return t.projects.scriptFloorSolidTip(DEMO_SCRIPT_MIN_SUBSTANTIAL);
    }
    return null;
  };

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <p style={labelStyle}>{t.projects.scriptLabel}</p>
        <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
          {t.projects.scriptSteps(steps.length)}
        </span>
        {/* 정밀도 배지 — 전 스텝에 셀렉터가 있으면 로봇이 화면을 추측하지 않는다 */}
        <span
          className="px-2 py-0.5 rounded-full text-xs"
          style={{
            fontFamily: "var(--font-nunito)", fontWeight: 600,
            background: fully ? "var(--surface-soft)" : "rgba(179,71,71,0.10)",
            color: fully ? "var(--text-secondary)" : "#b34747",
          }}
        >
          {fully ? t.projects.scriptPrecise : t.projects.scriptPartial(wired, steps.length)}
        </span>
      </div>

      {!fully && (
        <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", margin: "6px 0 0" }}>
          {t.projects.scriptPartialHelp}
        </p>
      )}

      {script?.prep && (
        <p className="text-xs mt-2" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", margin: "8px 0 0" }}>
          {t.projects.scriptPrep}: {script.prep}
        </p>
      )}

      <ol className="flex flex-col gap-1.5 mt-2.5" style={{ listStyle: "none", padding: 0, margin: "10px 0 0" }}>
        {steps.map((st, i) => (
          <StepRow
            key={`${i}-${st.goal}`}
            step={st}
            index={i}
            actionLabels={actionLabels}
            controls={onChange ? {
              up: i > 0 ? () => move(i, -1) : null,
              down: i < steps.length - 1 ? () => move(i, 1) : null,
              remove: () => remove(i),
              removeBlock: removeBlock(st),
            } : null}
          />
        ))}
      </ol>

      {script?.skip?.length ? (
        <p className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)", margin: "10px 0 0" }}>
          {t.projects.scriptSkip}: {script.skip.join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

type StepControls = {
  up: (() => void) | null;
  down: (() => void) | null;
  remove: () => void;
  removeBlock: string | null;
};

function StepRow({ step, index, actionLabels, controls }: {
  step: DemoScriptStep;
  index: number;
  actionLabels: Record<string, string>;
  controls: StepControls | null;
}) {
  const { t } = useT();
  const wired = isStepWired(step);
  // 셀렉터가 없으면 로봇은 where(눈으로 찾는 법)로 화면을 뒤진다 — 그 사실을
  // 감추지 않고 그대로 보여준다. 여기가 사람이 "아 이건 못 찾겠는데"를 아는 지점.
  const locator = step.selector ?? step.where ?? null;

  const iconBtn: React.CSSProperties = {
    width: 24, height: 24, borderRadius: 8, border: "none", background: "transparent",
    color: "var(--text-muted)", cursor: "pointer", display: "inline-flex",
    alignItems: "center", justifyContent: "center", padding: 0,
  };

  return (
    <li
      className="flex items-start gap-2.5 px-3 py-2 rounded-xl"
      style={{ background: "var(--surface-soft)" }}
    >
      <span
        className="vf-mono shrink-0"
        style={{ fontSize: "0.72rem", color: "var(--text-muted)", lineHeight: 1.8 }}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span style={{ fontFamily: "var(--font-nunito)", fontSize: "0.85rem", color: "var(--text-primary)" }}>
            {step.goal}
          </span>
          {step.action && (
            <span className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)" }}>
              {actionLabels[step.action] ?? step.action}
              {step.action === "type" && step.text ? ` “${step.text}”` : ""}
            </span>
          )}
          {step.hold ? (
            <span className="text-xs" style={{ color: "var(--text-muted)", fontFamily: "var(--font-nunito)" }}>
              {t.projects.scriptHold(step.hold)}
            </span>
          ) : null}
        </div>
        {locator && (
          <p
            className="vf-mono"
            style={{
              fontSize: "0.7rem", margin: "2px 0 0",
              color: wired ? "var(--text-muted)" : "#b34747",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}
            title={locator}
          >
            {step.selector ? locator : `${t.projects.scriptByEye}: ${locator}`}
          </p>
        )}
        {step.expect && (
          <p className="text-xs" style={{ color: "var(--text-secondary)", fontFamily: "var(--font-nunito)", margin: "2px 0 0" }}>
            → {step.expect}
          </p>
        )}
      </div>
      {controls && (
        <div className="flex items-center shrink-0" style={{ gap: 2, marginTop: 2 }}>
          <button type="button" style={{ ...iconBtn, opacity: controls.up ? 1 : 0.25, cursor: controls.up ? "pointer" : "default" }}
            onClick={controls.up ?? undefined} disabled={!controls.up} title={t.projects.scriptMoveUp} aria-label={t.projects.scriptMoveUp}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 10V2M2.5 5.5L6 2l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button type="button" style={{ ...iconBtn, opacity: controls.down ? 1 : 0.25, cursor: controls.down ? "pointer" : "default" }}
            onClick={controls.down ?? undefined} disabled={!controls.down} title={t.projects.scriptMoveDown} aria-label={t.projects.scriptMoveDown}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 2v8M2.5 6.5L6 10l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </button>
          <button type="button"
            style={{ ...iconBtn, opacity: controls.removeBlock ? 0.25 : 1, cursor: controls.removeBlock ? "not-allowed" : "pointer" }}
            onClick={controls.removeBlock ? undefined : controls.remove}
            disabled={!!controls.removeBlock}
            title={controls.removeBlock ?? t.projects.scriptRemove}
            aria-label={t.projects.scriptRemove}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></svg>
          </button>
        </div>
      )}
    </li>
  );
}

"use client";

import { isStepWired, type DemoScript, type DemoScriptStep } from "@/lib/demoScript";
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
export function DemoScriptPanel({ script }: { script: DemoScript | null }) {
  const { t } = useT();
  const steps = script?.steps ?? [];
  const wired = steps.filter(isStepWired).length;
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
          <StepRow key={i} step={st} index={i} actionLabels={actionLabels} />
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

function StepRow({ step, index, actionLabels }: {
  step: DemoScriptStep;
  index: number;
  actionLabels: Record<string, string>;
}) {
  const { t } = useT();
  const wired = isStepWired(step);
  // 셀렉터가 없으면 로봇은 where(눈으로 찾는 법)로 화면을 뒤진다 — 그 사실을
  // 감추지 않고 그대로 보여준다. 여기가 사람이 "아 이건 못 찾겠는데"를 아는 지점.
  const locator = step.selector ?? step.where ?? null;

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
    </li>
  );
}

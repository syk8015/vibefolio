// 소개 영상 예시 대본 2개 — 프로브·미리보기·AI 안내 예시에 쓴다(숫자는 모두 예시 자료).
import type { IntroFilm } from "./schema";

const l = (en: string, ko: string) => ({ en, ko });

export const SAMPLE_HOME_CLIMATE: IntroFilm = {
  style: { text: "bignum", mood: "cinematic" },
  scenes: [
    { kind: "hook", label: l("MY BATHROOM", "우리 집 욕실"), value: "68%", alarm: true, line: l("Always too damp.", "늘 너무 습해요."), data: "sample" },
    {
      kind: "items", data: "sample",
      items: [
        { value: "68%", label: l("Bathroom", "욕실"), alarm: true },
        { value: "54%", label: l("Bedroom 1", "침실 1") },
        { value: "49%", label: l("Bedroom 2", "침실 2") },
        { value: "51%", label: l("Living room", "거실") },
        { value: "62%", label: l("Outside", "바깥") },
      ],
      line: l("So I put a sensor in every room.", "그래서 방마다 센서를 달았어요."),
    },
    { kind: "flow", nodes: [l("Sensors", "센서"), l("ESP32", "ESP32 보드"), l("Cloud", "클라우드"), l("Phone", "폰")], line: l("Five sensors → one tiny board → my phone.", "센서 다섯 → 작은 보드 → 내 폰.") },
    {
      kind: "alert", data: "sample",
      title: l("Condensation likely", "오늘 밤 결로 주의"), body: l("on the window tonight.", "창문에 물방울이 맺힐 수 있어요."),
      line: l("It warns me", "먼저 알려줘요"), line2: l("before the glass fogs up.", "유리에 김이 서리기 전에."),
    },
    {
      kind: "stats", data: "measured", source: "web/lib/alerts.ts",
      stats: [
        { value: "22", unit: l("types", "종"), label: l("Push alerts", "푸시 알림") },
        { value: "1", unit: l("min", "분"), label: l("Between readings", "측정 간격") },
        { value: "$0", unit: l("/mo", "/월"), label: l("Hosting", "서버비") },
      ],
      line: l("Running day and night.", "밤낮없이 돌아가요."),
    },
    { kind: "ending", line: l("Built solo,", "혼자 만들었어요,"), line2: l("for my own home.", "우리 집을 위해."), name: l("HOME CLIMATE MONITOR", "온습도계") },
  ],
};

export const SAMPLE_CLI: IntroFilm = {
  style: { text: "cinematic", mood: "cinematic" },
  scenes: [
    { kind: "hook", label: l("CLAUDE WROTE THIS WEEK", "이번 주 Claude가 쓴 코드"), value: "12,480", line: l("lines. How many survived?", "줄. 몇 줄이나 살아남았을까?"), data: "sample" },
    {
      kind: "terminal", data: "sample", command: "claudeusage value --all --waste",
      output: ["Reading local logs … 38 sessions", "written     12,480 lines", "survived     7,610 lines   61%", "mistakes        4%   wasted", "long chats     12%   wasted"],
      line: l("Reads local logs. No upload. No Git.", "내 컴퓨터 기록만 읽어요. 올리지도 않아요."),
    },
    {
      kind: "stats", data: "sample",
      stats: [
        { value: "61", unit: l("%", "%"), label: l("Survived", "살아남음") },
        { value: "4", unit: l("%", "%"), label: l("Mistakes", "실수") },
        { value: "12", unit: l("%", "%"), label: l("Long chats", "긴 대화") },
      ],
      line: l("Long chats waste 3× more than mistakes.", "긴 대화가 실수보다 3배 더 낭비돼요."),
    },
    { kind: "story", line: l("Start fresh conversations", "새 대화를"), line2: l("more often.", "더 자주 시작하세요.") },
    { kind: "flow", nodes: [l("Local logs", "내 기록"), l("claudeusage", "claudeusage"), l("Your answer", "내 답")], line: l("Measured by the code that survived.", "살아남은 코드로 재요.") },
    { kind: "ending", line: l("Measure yourself,", "팀 말고,"), line2: l("not your team.", "나를 재요."), name: l("CLAUDEUSAGE · NOT AFFILIATED WITH ANTHROPIC", "CLAUDEUSAGE · ANTHROPIC과 무관") },
  ],
};

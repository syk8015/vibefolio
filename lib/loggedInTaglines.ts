/**
 * 로그인 후 메인 페이지에서 회전하는 헤드라인 풀.
 * `reply`가 있으면 질문→잠깐 멈춤→↳ 답글 순으로 타이핑된다.
 */
export interface LoggedInTagline {
  text: string;
  reply?: string;
}

export const loggedInTaglines: LoggedInTagline[] = [
  // A. 사용자 주신 밈
  { text: "코드는 제가 안 보는데 과연 퀄리티를 신경 써야 할까요?", reply: "물론 저는 개잘짭니다" },
  { text: "그거 그렇게 하는 거 아닌데. 감사합니다" },
  { text: "이거 별로 안 중요한 코드 같은데 지워도 되는 거죠?", reply: "메인 DB 날아감" },
  { text: "영역전개 — if문 예순 개 넣어두기" },
  { text: "유연한 남탓, 사고하지 않기" },
  { text: "오늘 할 일은 Opus 4.6이, 내일 할 일은 Opus 4.7이" },
  { text: "Sonnet은 썸녀, Opus는 여자친구" },
  { text: "테스트 코드를 굳이 짜야 할까요?", reply: "물론 저는 기도 메타로 배포합니다" },
  { text: "오늘 업무: Sonnet 3.5에게 화내기 / 내일 업무: GPT-4o에게 사과하기" },
  { text: "영역전개 — 모든 변수 타입 any로 선언하기" },
  { text: "영역전개 — try/catch로 모든 에러 삼켜버리기" },
  { text: "완전 럭키비키잖아? 서버 터졌는데 마침 오늘 연차야" },
  { text: "코드 짰습니다 (Cursor가 짰음). 리뷰 부탁드립니다 (Claude가 리뷰함)" },
  { text: "이 기능은 안 되는 게 아니라, AI 모델이 아직 학습하지 못한 영역입니다" },

  // B. 바이브코딩 응원 / 자랑 톤
  { text: "결국 만들어낸 사람, 그게 당신입니다" },
  { text: "코드 한 줄 안 짜고 제품 하나 만든 사람" },
  { text: "AI가 짰어도 결재는 당신이 했잖아요" },
  { text: "\"기획-디자인-개발\" 1인분 다 하셨네요" },
  { text: "프롬프트 한 줄로 시작해서 여기까지 온 사람" },
  { text: "README보다 결과물이 빠른 사람" },
  { text: "잠 안 자고 만든 그거, 지금 보여줄 차례" },
  { text: "새벽 3시의 커밋이 가장 진심입니다" },
  { text: "만든 건 만든 거예요. 누가 짰든" },
  { text: "깃 몰라도 푸시는 한 사람" },
  { text: "\"이거 내가 만들었어요\" 그 한마디를 위해" },
  { text: "Vercel 배포 성공 화면, 인생 최고의 순간 TOP 3" },
  { text: "localhost:3000을 떠나보낼 시간입니다" },
  { text: "어제까지의 당신과는 다른 빌더입니다" },

  // C. AI 페어프로그래밍 / 협업 밈
  { text: "오늘도 Claude한테 \"왜 안 돼요\" 물어본 사람" },
  { text: "ChatGPT한테 사과해 본 적 있는 사람" },
  { text: "Cursor 탭 키 누르면서 인생을 살아온 사람" },
  { text: "AI가 짠 코드 리뷰해주는 또 다른 AI를 모셔온 사람" },
  { text: "에러 메시지 통째로 복붙해본 사람" },
  { text: "\"여기까지 잘 작동했는데요\"의 진짜 의미를 아는 사람" },
  { text: "스택오버플로우보다 GPT를 먼저 여는 사람" },
  { text: "\"다시 짜드릴까요?\" \"네\" 무한 루프 경험자" },
  { text: "Opus는 비싸서 큰일 날 때만 부르는 사람" },
  { text: "AI한테 \"고마워\" 말하고 다시 짜라고 시키는 사람" },
  { text: "사과는 사람한테, 디버깅은 AI한테" },
  { text: "빨간 줄 없으면 일단 안심하는 사람" },

  // D. 자조 / 영역전개 + 흠.. 시리즈
  { text: "영역전개 — 콘솔에 console.log(\"여기\") 백 개 찍기" },
  { text: "영역전개 — 모든 변수명을 a, b, c로 통일" },
  { text: "영역전개 — 주석 0줄, 함수 800줄" },
  { text: "영역전개 — TODO 주석 영구 박제" },
  { text: "영역전개 — 의존성 한 줄 추가로 빌드 깨뜨리기" },
  { text: "영역전개 — \"로컬에선 됐는데\"" },
  { text: "흠.. 버그가 났는데 제 로컬에선 잘 되니까 그냥 넘어가도 될까요?", reply: "물론 사용자 환경이 잘못된 겁니다" },
  { text: "흠.. 주석을 굳이 달아야 할까요?", reply: "미래의 저도 어차피 모릅니다" },
  { text: "흠.. 변수명을 굳이 영어로 써야 할까요?", reply: "bbongbbong도 엄연한 변수입니다" },
  { text: "흠.. 타입을 굳이 정의해야 할까요?", reply: "any도 엄연한 타입입니다" },

  // E. 일상 / 상황극
  { text: "럭키비키 — 빌드 깨졌는데 마침 PR 마감 지남" },
  { text: "럭키비키 — 메인 브랜치에 푸시했는데 다행히 아무도 안 봄" },
  { text: "럭키비키 — DB 날렸는데 마침 백업이 어제 거였음" },
  { text: "코드 한 줄 고쳤더니 무관해 보이는 곳이 터지는 마법" },
  { text: "\"이거 한 줄만 고치면 돼요\"가 데려온 3시간" },
  { text: "git push --force로 마무리되는 금요일" },
  { text: "배포 직전 발견한 오타 = 오늘의 가장 큰 위기" },
  { text: "회의에선 \"거의 다 됐어요\", 코드에선 \"거의 시작 안 했어요\"" },
  { text: "일단 배포부터 하고, 사과는 슬랙으로" },
  { text: "키보드 하나로 회사 하나를 굴리는 사람" },
];

/**
 * 영어 풀 — 재창작(2026-08-14 사용자 1차 번역 검수 반영).
 * 한국 특화 밈은 현지 밈으로 치환: 럭키비키→Task failed successfully,
 * 영역전개→Domain Expansion(주술회전 밈, 영미권도 통용), 기도 메타→Thoughts & Prayers™.
 */
export const loggedInTaglinesEn: LoggedInTagline[] = [
  // A. 밈 (질문→답글)
  { text: "Do I really need to care about code quality if I never read it?", reply: "Relax, I write flawless spaghetti" },
  { text: "\"That's not how you do that\" — thanks anyway" },
  { text: "This code doesn't look important, safe to delete?", reply: "Production DB has left the chat" },
  { text: "Domain Expansion — sixty nested if statements" },
  { text: "Blame the cache. Never elaborate" },
  { text: "Let Opus 4.6 handle today. Opus 4.7 can handle tomorrow" },
  { text: "Sonnet is a situationship. Opus is the one you commit to" },
  { text: "Do we really need tests?", reply: "I ship with Thoughts & Prayers™" },
  { text: "Today's task: yelling at Sonnet 3.5 / Tomorrow's task: apologizing to GPT-4o" },
  { text: "Domain Expansion — declaring every type as any" },
  { text: "Domain Expansion — one try/catch to swallow them all" },
  { text: "Task failed successfully: the server is down but I'm on PTO" },
  { text: "\"I wrote this\" (Cursor did). \"Please review\" (Claude will)" },
  { text: "It's not broken — the model just hasn't been trained on that yet" },

  // B. 응원 / 자랑 톤
  { text: "In the end, you're the one who shipped it" },
  { text: "Zero lines of code written, one product launched" },
  { text: "The AI wrote it. You signed off on it" },
  { text: "PM, designer, developer — you did all three jobs" },
  { text: "It all started with \"can you build me a quick app…\"" },
  { text: "Shipping faster than the README gets written" },
  { text: "That sleepless-night build — time to show it off" },
  { text: "The 3 AM commits are the most honest ones" },
  { text: "Shipped is shipped, no matter who typed it" },
  { text: "Can't explain git, pushed to prod anyway" },
  { text: "All for that one line: \"I built this\"" },
  { text: "The Vercel deploy-success screen: top 3 moments of a lifetime" },
  { text: "Time to say goodbye to localhost:3000" },
  { text: "Not the same builder you were yesterday" },

  // C. AI 페어프로그래밍 / 협업 밈
  { text: "Another day of asking Claude \"why isn't this working??\"" },
  { text: "Has genuinely apologized to ChatGPT" },
  { text: "Living life one Tab press at a time" },
  { text: "Hired a second AI to review the first AI's code" },
  { text: "Fluent in copy-pasting stack traces" },
  { text: "Knows the true meaning of \"it was working a minute ago\"" },
  { text: "Opens ChatGPT before Stack Overflow" },
  { text: "Stuck in the \"want me to rewrite that?\" \"yes\" infinite loop" },
  { text: "Saves Opus for when things are really on fire" },
  { text: "Thanks the AI politely, then makes it rewrite everything" },
  { text: "Apologies go to humans, debugging goes to AI" },
  { text: "No red squiggles? We're good" },

  // D. 자조 / Domain Expansion + 질문 시리즈
  { text: "Domain Expansion — a hundred console.log(\"here\")" },
  { text: "Domain Expansion — every variable named a, b, or c" },
  { text: "Domain Expansion — zero comments, one 800-line function" },
  { text: "Domain Expansion — a TODO from 2021" },
  { text: "Domain Expansion — breaking the build with one dependency bump" },
  { text: "Domain Expansion — \"works on my machine\"" },
  { text: "There's a bug in prod but it works on my machine — can I let it slide?", reply: "Obviously the users' environment is wrong" },
  { text: "Do I really need comments?", reply: "Future me won't understand them anyway" },
  { text: "Do variable names need to make sense?", reply: "bbongbbong is a perfectly valid variable" },
  { text: "Do I really need to define types?", reply: "any is technically a type" },

  // E. 일상 / 상황극
  { text: "Task failed successfully: build broke, but the PR deadline already passed" },
  { text: "Task failed successfully: pushed straight to main, nobody noticed" },
  { text: "Task failed successfully: dropped the DB, but yesterday's backup actually works" },
  { text: "The magic of fixing one line and breaking something unrelated" },
  { text: "\"It's just a one-line fix\" — three hours later" },
  { text: "A Friday wrapped up with git push --force" },
  { text: "A typo found right before deploy = today's biggest crisis" },
  { text: "In the meeting: \"almost done\" / In the code: \"barely started\"" },
  { text: "Deploy first, apologize on Slack later" },
  { text: "Running a whole company from one keyboard" },
];

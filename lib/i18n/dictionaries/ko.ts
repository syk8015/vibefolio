// 한국어 사전 — 키 구조의 원본. en.ts는 이 타입을 강제받아
// 키가 빠지면 컴파일 에러가 난다. 값에 변수가 필요하면 함수로 쓴다.
// 예: greeting: (name: string) => `${name}님 안녕하세요`
//
// ⚠️ 키를 추가/수정하면 docs/i18n-review.md(번역 검수 대장)에도 기록할 것.

export const ko = {
  common: {
    switchLanguage: "영어로 보기",
    terms: "이용약관",
    privacy: "개인정보처리방침",
    contact: "문의",
    ok: "확인",
    switchToDark: "다크 모드로 전환",
    switchToLight: "라이트 모드로 전환",
  },
  // 랜딩(/) — 회전 카피 풀은 lib/taglines.ts·lib/loggedInTaglines.ts에 ko/en 별도
  landing: {
    login: "로그인",
    getStarted: "시작하기",
    greetingBefore: "안녕하세요, ",
    greetingAfter: "님!",
    viewMyFrame: "내 프레임 보기",
    editFrame: "프레임 수정",
    settings: "설정",
  },
  // 인증 화면들(로그인·회원가입·비밀번호 찾기/재설정)이 공유하는 문구
  auth: {
    googleContinue: "Google로 계속하기",
    githubContinue: "GitHub로 계속하기",
    lastUsed: "지난번에 사용",
    // 메일 6자리 코드로 들어가기(components/EmailCodeForm) — 처음 보는 주소면 계정이 생긴다
    codeInstead: "비밀번호 없이 메일 코드로 로그인",
    codeInsteadSignup: "비밀번호 없이 메일 코드로 가입",
    passwordInstead: "비밀번호로 하기",
    codeNewAccountHint: "처음이면 이 주소로 계정이 새로 만들어져요.",
    codeSend: "코드 받기",
    codeSentTo: "6자리 코드를 보냈어요. 스팸함도 확인해 주세요.",
    codeLabel: "코드",
    codeVerify: "확인",
    codeVerifying: "확인 중...",
    codeResend: "코드 다시 받기",
    codeResent: "새 코드를 보냈어요. 먼저 받은 코드는 이제 안 돼요.",
    codeChangeEmail: "다른 이메일 쓰기",
    or: "또는",
    emailLabel: "이메일",
    passwordLabel: "비밀번호",
    showPassword: "비밀번호 표시",
    hidePassword: "비밀번호 숨기기",
    toLogin: "로그인 페이지로 →",
    resendPrompt: "이메일을 잘못 입력했나요?",
    reenter: "다시 입력하기",
    resendButton: "인증 메일 다시 보내기",
    resending: "보내는 중...",
    resendSent: "인증 메일을 다시 보냈어요. 스팸함도 확인해 주세요.",
    resendFailed: "지금은 보낼 수 없어요. 1분 뒤에 다시 눌러 주세요.",
    usernamePattern: "영문 소문자, 숫자, _-만 쓸 수 있어요",
    // 인스타·스레드 등 앱 안 브라우저 안내 — 구글이 웹뷰 로그인을 막을 "때가 있다"(앱·기기마다 다름,
    // 09-24 사용자 실기기 인스타에선 됐다). 그래서 단정하지 않고 "안 되면"으로 안내한다.
    inAppTitle: "구글 로그인이 안 되면",
    inAppBody: "오른쪽 위 ⋯ 메뉴에서 '외부 브라우저로 열기'를 눌러 주세요. 앱 안 브라우저에 따라 구글이 막힐 때가 있어요. GitHub·이메일은 여기서도 돼요.",
    inAppCopy: "주소 복사",
    inAppCopied: "복사했어요 — 사파리·크롬에 붙여 넣어 주세요",
    inAppCopyFailed: "복사하지 못했어요 — ⋯ 메뉴를 써 주세요",
    // Turnstile 위젯 로드 실패 문구 — "…끄거나 [다시 시도]해 주세요." 순서로 조립
    turnstileFailed: "보안 확인을 불러오지 못했어요.",
    turnstileFixPrefix: "광고 차단을 끄거나",
    turnstileRetry: "다시 시도",
    turnstileFixSuffix: "해 주세요.",
    errors: {
      captcha: "보안 확인에 실패했어요. 다시 확인 후 시도해주세요.",
      generic: "오류가 발생했어요. 잠시 후 다시 시도해주세요.",
      tooMany: "잠시 후 다시 시도해주세요.",
      invalidEmail: "올바른 이메일 형식을 입력해주세요.",
      passwordTooShort: "비밀번호는 8자 이상이어야 해요.",
      codeInvalid: "코드가 맞지 않거나 만료됐어요. 새 코드를 받아 주세요.",
      codeWait: "코드는 1분에 한 번만 보낼 수 있어요. 잠시 뒤에 다시 눌러 주세요.",
    },
  },
  login: {
    noAccount: "계정이 없나요?",
    signupLink: "회원가입",
    welcomeBack: "다시 돌아왔군요",
    welcome: "환영합니다",
    welcomeBackSub: "프레임이 기다리고 있어요.",
    welcomeSub: "새로운 프레임을 만들 차례입니다.",
    forgotPassword: "비밀번호 찾기",
    submitting: "로그인 중...",
    submit: "로그인",
    errors: {
      invalid: "이메일 또는 비밀번호가 올바르지 않아요.",
      unconfirmed: "이메일 인증을 먼저 완료해주세요.",
    },
    // 인증 링크 교환 실패(/login?error=auth). 가입 인증은 메일을 여는 순간 이미 끝났다.
    callbackConfirmFailed: "이 브라우저에서는 링크를 이어서 열 수 없었어요. 메일 인증은 끝났으니 아래에서 로그인해 주세요.",
    callbackResetFailed: "재설정 링크가 만료됐거나 다른 브라우저에서 열렸어요.",
    callbackResetAgain: "재설정 메일 다시 받기 →",
    callbackOauthFailed: "로그인이 취소됐거나 끝나지 못했어요. 다시 해 보거나 다른 방법으로 들어와 주세요.",
  },
  signup: {
    haveAccount: "이미 계정이 있나요?",
    loginLink: "로그인",
    title: "시작하기",
    subtitle: "무료로 나만의 프레임을 만들어보세요.",
    // 폰 → 컴퓨터 넘기기 메일 링크로 왔을 때(09-24). 소셜 버튼은 접히고 아래 링크로 펼친다.
    handoffSubtitle: "폰에서 이어서 왔어요. 메일로 코드를 받아 들어가세요.",
    otherWays: "Google·GitHub로 가입하기",
    nameLabel: "이름",
    namePlaceholder: "홍길동",
    usernameLabel: "사용자 이름",
    passwordPlaceholder: "8자 이상",
    submitting: "가입 중...",
    submit: "무료로 시작하기",
    agreePrefix: "가입하면 ",
    termsLink: "이용약관",
    agreeAnd: " 및 ",
    privacyLink: "개인정보처리방침",
    agreeSuffix: "에 동의하게 됩니다.",
    checkEmailTitle: "이메일을 확인해주세요",
    checkEmailBody: "위 주소로 인증 링크를 보냈어요. 메일함을 확인해주세요.",
    orEnterCode: "메일에 적힌 6자리 코드를 여기 넣어도 돼요. 다른 기기에서 메일을 열었을 때 편해요.",
    errors: {
      emailTaken: "이미 가입된 이메일이에요. 로그인하거나, 구글·GitHub로 가입했다면 그 버튼을 눌러 주세요.",
    },
  },
  forgotPassword: {
    rememberPrompt: "비밀번호가 기억났나요?",
    loginLink: "로그인",
    title: "비밀번호 찾기",
    subtitle: "가입한 이메일로 재설정 링크를 보내드릴게요.",
    submitting: "보내는 중...",
    submit: "재설정 링크 보내기",
    sentTitle: "메일을 확인해주세요",
    sentBody: "위 주소로 비밀번호 재설정 링크를 보냈어요.",
  },
  resetPassword: {
    checking: "확인 중...",
    invalidTitle: "링크가 만료되었어요",
    invalidBody1: "재설정 링크가 유효하지 않거나 만료되었어요.",
    invalidBody2: "다시 요청해주세요.",
    requestAgain: "재설정 링크 다시 받기 →",
    doneTitle: "비밀번호가 변경됐어요",
    doneBody: "잠시 후 대시보드로 이동합니다.",
    title: "새 비밀번호 설정",
    subtitle: "앞으로 사용할 비밀번호를 입력해주세요.",
    newPasswordLabel: "새 비밀번호",
    confirmLabel: "비밀번호 확인",
    confirmPlaceholder: "다시 입력해주세요",
    submitting: "변경 중...",
    submit: "비밀번호 변경",
    errors: {
      mismatch: "비밀번호가 일치하지 않아요.",
      samePassword: "기존 비밀번호와 달라야 해요.",
      sessionExpired: "세션이 만료됐어요. 링크를 다시 요청해주세요.",
    },
  },
  onboarding: {
    stepSignup: "가입",
    stepProfile: "프로필",
    stepStart: "시작",
    title: "프레임을 만들어볼게요",
    subtitle: "기본 정보를 입력해주세요. 나중에 언제든 바꿀 수 있어요.",
    nameLabel: "이름",
    usernameLabel: "사용자 이름 (URL)",
    bioLabel: "한 줄 소개 (선택)",
    bioPlaceholder: "바이브코딩으로 아이디어를 현실로 만들고 있어요.",
    usernameAvailable: "✓ 사용 가능한 username이에요",
    usernameTaken: "✗ 이미 사용 중이에요",
    usernameInvalid: "✗ 영문 소문자, 숫자, _, -만 쓸 수 있어요 (2~30자)",
    usernameReserved: "✗ 사용할 수 없는 이름이에요",
    submitting: "저장 중...",
    submit: "시작하기 →",
    otherAccount: "다른 계정으로 로그인",
    ageConfirm: "만 14세 이상이에요",
    errors: {
      usernameTaken: "이미 사용 중인 username이에요. 다른 걸 입력해주세요.",
      usernameInvalid: "username은 영문 소문자, 숫자, _, -로 2~30자여야 해요.",
      usernameReserved: "사용할 수 없는 username이에요. 다른 걸 입력해주세요.",
      nameBlocked: "이 이름은 쓸 수 없어요. 다른 이름을 입력해 주세요.",
      saveAuth: "저장 중 오류가 발생했어요. 다시 시도해주세요.",
      saveProfile: "프로필 저장 중 오류가 발생했어요. 다시 시도해주세요.",
    },
  },
  // 콘텐츠 유형 표시 라벨 — id는 lib/projectTaxonomy.ts의 CONTENT_TYPES와 1:1
  contentTypes: {
    "web-app": "웹 앱",
    saas: "SaaS",
    mobile: "모바일 앱",
    game: "게임",
    extension: "크롬 익스텐션",
    "ai-service": "AI 서비스",
    media: "미디어 콘텐츠",
    other: "기타",
  },
  dashboard: {
    logout: "로그아웃",
    welcomeTitle: "프레임이 준비됐어요",
    welcomeBody: "이제 작품을 추가해서 프레임을 채워볼게요.",
    welcomeCta: "첫 작품 추가하기 →",
    welcomeClose: "환영 배너 닫기",
    copyAddress: "프레임 주소 복사",
    copied: "복사됨 ✓",
    viewFrame: "내 프레임 보기",
    tabProjects: "작품",
    tabCard: "명함",
    tabVisits: "방문",
    errorTitle: "대시보드를 불러오지 못했어요",
    errorBody: "대시보드를 표시하는 중 문제가 생겼어요. 다시 시도하거나 홈으로 돌아가 주세요.",
  },
  projects: {
    // AI가 올린 초안이 실시간으로 도착했을 때 뜨는 토스트(2026-09-05).
    draftArrived: (title: string) => `"${title}" 초안이 도착했어요`,
    pendingScriptBadge: "새 대본 도착",
    reviewPendingScript: "새 대본 확인하고 재촬영",
    scriptLabel: "촬영 대본",
    scriptSteps: (n: number) => `${n}스텝`,
    scriptPrecise: "정밀 촬영",
    scriptPartial: (a: number, b: number) => `셀렉터 ${a}/${b}`,
    scriptPartialHelp:
      "셀렉터가 없는 스텝은 로봇이 화면을 눈으로 뒤져 찾아요 — 못 찾으면 건너뛰고, 확대 프레이밍도 덜 정확해요.",
    scriptNone: "대본 없음 — 제작자가 시연 영상을 직접 준 작품이에요(자동 촬영 안 함).",
    scriptSkip: "건너뛸 것",
    scriptPrep: "사전 준비",
    scriptByEye: "눈으로 찾기",
    scriptHold: (s: number) => `${s}초 머무름`,
    scriptActions: {
      click: "클릭", type: "입력", drag: "드래그", scroll: "스크롤",
      hover: "가리키기", draw: "그리기", focus: "확대 강조",
    },
    pendingReview: (n: number) => `검토 대기 ${n}`,
    projectsCount: (n: number) => `작품 ${n}개`,
    addProject: "프로젝트 추가",
    emptyTitle: "아직 프로젝트가 없어요",
    // 올리는 길은 AI 하나뿐이다(08-25 수동 위저드 폐기) — 빈 화면이 그 길을 말해야 한다.
    emptyBody: "작품을 만든 AI에게 한 줄만 붙여넣으면, 소개글과 시연 대본까지 써서 여기에 초안으로 올려줘요",
    emptyCta: "AI 연결하고 첫 작품 올리기",
    connectTitle: "AI로 한 줄에 올리기",
    connectSubtitle: "초안으로 올라와요. 공개는 내가 확인한 뒤에만 돼요.",
    editTitle: "프로젝트 수정",
    submitSave: "저장하기",
    deleteConfirm: "이 작품을 삭제할까요?",
    deleteBody: "영상과 올린 파일까지 모두 지워지고, 되돌릴 수 없어요.",
    deleteCta: "삭제하기",
    deleteCancel: "취소",
    featuredFailed: "대표 작품 지정에 실패했어요. 잠시 후 다시 시도해 주세요.",
    orderSaveFailed: "순서 저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
    deleteFailed: "프로젝트 삭제에 실패했어요. 잠시 후 다시 시도해 주세요.",
    demoStartFailed: "자동 시연 생성을 시작하지 못했어요. 프로젝트는 저장됐어요 — 카드에서 다시 시도할 수 있어요.",
    heldNotice: "관리자 승인 대기로 전환했어요.",
    rerecordFailed: "재촬영 요청 실패",
    publishFailed: "공개에 실패했어요. 잠시 후 다시 시도해 주세요.",
    publishedDemoStartFailed: "공개됐지만 자동 시연 생성을 시작하지 못했어요 — 카드에서 다시 시도할 수 있어요.",
    publishedDemoRequestFailed: "공개됐지만 자동 시연 요청이 전송되지 않았어요 — 카드에서 다시 시도할 수 있어요.",
    rerecordSent: "재촬영 요청을 보냈어요. 관리자 승인 후 다시 촬영돼요.",
    phasePending: "촬영 대기",
    phaseBuilding: "앱 준비 중",
    phaseRecording: "촬영 중",
    phaseEditing: "편집 중",
    usualTime: "보통 1–3분",
    demoFailed: "촬영 실패",
    // 시안 1(조용한 한 줄, 2026-09-05 확정): 상태는 알약이 아니라 오른쪽 텍스트다.
    statusDone: "영상 완료",
    retryBtn: "다시 시도",
    techInfo: "기술 정보",
    heldModerationTip: "게시 전에 확인이 필요하다고 표시돼 잠시 보류 중이에요. 검토가 끝나면 자동으로 게시되고, 보통 하루 안에 처리돼요.",
    heldQuotaTip: "하루 자동 시연 한도를 넘어 승인 대기 중이에요. 보통 24시간 안에 처리되고, 그동안은 이미지로 표시돼요.",
    heldModerationLabel: "게시 전 확인 중",
    heldQuotaLabel: "승인 대기 · 이미지 표시",
    pausedTip: "촬영 요청이 접수됐어요. 순서대로 촬영되고 보통 24시간 안에 찍혀요. 끝나면 메일로 알려드릴게요.",
    pausedLabel: "촬영 대기 중",
    slowTip: "창을 닫으셔도 돼요 — 촬영이 끝나면 메일로 알려드릴게요.",
    slowLabel: "예상보다 오래 걸려요",
    more: "더 보기",
    draftBadge: "공개 전 · 나만 보여요",
    reviewIntro: "AI가 작성해 올린 초안이에요. 내용과 화면을 확인한 뒤 공개해 주세요.",
    reviewPreviewLabel: "미리보기",
    reviewNoPreview: "미리볼 화면이 없어요",
    reviewEmbedTip: "화면이 비어 보이면 이 사이트가 임베드를 막은 거예요 — [작품 열기 ↗]로 새 탭에서 확인해 주세요.",
    // 임베드 가능 여부를 서버가 미리 확인한다(2026-09-05) — 브라우저의
    // "연결을 거부했습니다" 화면 대신 이유를 우리 말로 알려주기 위해.
    reviewEmbedChecking: "미리보기를 확인하는 중…",
    reviewEmbedBlocked: "이 사이트는 다른 화면 안에 넣는 걸 막아 뒀어요 — 여기선 못 보여줘요. 위 [작품 열기]로 새 탭에서 확인하세요. 시연 영상은 진짜 브라우저로 찍으니 촬영에는 아무 영향 없어요.",
    reviewEmbedUnreachable: "지금 이 주소에 연결하지 못했어요. 주소가 맞는지, 사이트가 살아 있는지 확인해 주세요.",
    reviewFileUpload: "파일 업로드 (내부 미리보기)",
    // 초안 검토 화면 재편(2026-09-04, 인터뷰 ④⑤⑥): 명함 렌더+판정 칩·인라인 편집·
    // AI에게 고쳐달라기·공개 뒤 진행 상황.
    reviewCardLabel: "명함에 이렇게 보여요",
    reviewEditHint: "글자를 누르면 바로 고칠 수 있어요",
    reviewEditSave: "저장",
    reviewEditCancel: "취소",
    reviewTitleEmpty: "제목은 비울 수 없어요",
    reviewDescMeter: (lines: number, cols: number, max: number) => `${lines}줄 · 가장 긴 줄 ${cols}/${max}칸`,
    reviewDescEmpty: "소개글이 비어 있어요 — 2~3줄로 써 주세요",
    reviewDescLines: (n: number) => `${n}줄이에요 — 명함에는 2~3줄이 맞아요`,
    reviewDescLongLine: (line: number) => `${line}번째 줄이 너무 길어요 — 폰에서 접혀 잘려요`,
    reviewSaveFailed: "저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
    reviewNotePlaceholder: "한마디 (명함 말풍선, 비워도 돼요)",
    reviewVerdictScript: "촬영 대본",
    reviewVerdictAccess: "로그인",
    reviewVerdictOpens: "여는 곳",
    reviewAccessNoLogin: "로그인 없이 시연",
    reviewAccessUrl: "데모 경로로 들어가요",
    reviewAccessImpossible: "랜딩만 촬영 — 게스트 진입 불가",
    reviewAccessMissing: "답 없음 — 로그인 화면만 찍힐 수 있어요",
    reviewAccessVideo: "직접 준 영상 사용 — 자동 촬영 없음",
    reviewOpensFile: "업로드한 파일",
    reviewOpensRepo: "저장소를 받아 실행",
    reviewMore: "그 밖에",
    reviewFixWithAi: "AI에게 고쳐달라기",
    reviewFixLead: "무엇을 어떻게 고칠까요? 이 말이 AI에게 그대로 전달돼요.",
    reviewFixPlaceholder: "예: 소개글 톤이 딱딱해. 대본 2번은 빼고 검색 기능을 넣어줘",
    reviewFixCopy: "프롬프트 복사",
    reviewFixCopied: "복사했어요 — AI에게 붙여넣으세요. AI가 다시 올리면 이 초안이 갱신돼요.",
    reviewFixFailed: "프롬프트를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
    scriptRemove: "이 스텝 빼기",
    scriptMoveUp: "위로",
    scriptMoveDown: "아래로",
    scriptFloorTip: (min: number) => `최소 ${min}스텝은 있어야 촬영돼요`,
    scriptFloorSolidTip: (min: number) => `조작·위치가 있는 스텝이 최소 ${min}개 필요해요`,
    publishedNotice: "공개됐어요 · 촬영을 시작했어요 — 보통 1–3분, 끝나면 메일로 알려드려요",
    publishedNoticePaused: "공개됐어요 · 촬영 요청이 접수됐어요 — 보통 24시간 안에 찍히고, 끝나면 메일로 알려드려요",
    publishedNoticeNoDemo: "공개됐어요 · 직접 준 영상이 그대로 쓰여요",
    progressTitle: "촬영 진행",
    progressRequestedAt: (when: string) => `요청 ${when}`,
    progressPhases: ["촬영 대기", "앱 준비", "촬영", "편집"],
    progressPausedBody: "지금은 촬영이 순서대로 몰아서 진행돼요. 보통 24시간 안에 차례가 와서 자동으로 시작되고, 끝나면 메일로 알려드려요.",
    progressRunningBody: "끝나면 메일로 알려드려요 — 창을 닫아도 돼요.",
    untitled: "제목 없음",
    publishing: "공개 중…",
    confirmPublish: "확인하고 공개",
    // 초안 검토 창 재편(2026-09-15, 시안 2판): 두 칸·질문 제목·촬영 계획·필름 띠.
    reviewAsk: (title: string, particle: string) => `${title}${particle} 공개할까요?`,
    reviewIntroShort: "AI가 올린 초안이에요. 명함과 촬영 계획만 확인하면 돼요",
    reviewShootTitle: "이렇게 찍어요",
    reviewShootAllWired: (n: number) => `${n}장면 모두 정확한 위치를 알아요`,
    reviewShootPartWired: (wired: number, n: number) => `${n}장면 중 ${wired}장면만 위치를 정확히 알아요`,
    reviewStartsAtPrefix: "",
    reviewStartsAtSuffix: "에서 시작해요",
    reviewStartFile: "업로드한 파일에서 시작해요",
    reviewVideoOwn: "직접 준 영상을 그대로 써요",
    reviewVideoOwnSub: "자동 촬영은 하지 않아요",
    reviewDeviceMobile: "모바일 화면",
    reviewDeviceDesktop: "PC 화면",
    reviewDeviceAnswered: "AI가 답한 대로",
    reviewDeviceGuessed: "AI 답이 없어 분류로 짐작했어요",
    reviewOpenWork: "작품 열어 보기 ↗",
    reviewMoreRow: "작품 유형, 연도, 촬영 힌트 더 보기",
    reviewPublishCta: "공개하기",
    reviewPublishNote: "공개하면 바로 촬영을 요청해요",
    reviewPublishNoteVideo: "공개하면 직접 준 영상이 그대로 쓰여요",
    reviewNoLiveNote: "배포 주소 없이 파일로 올린 작품이라, 공개하면 라이브 체험 없이 영상만 보여요. 배포한 주소로 올리면 체험도 켜져요.",
    reviewMenuEdit: "직접 고치기",
    reviewMenuDelete: "삭제하기",
    stripHint: (total: string) => `칸 너비는 장면마다 머무는 시간이에요 · 합계 약 ${total}초`,
    sceneCount: (i: number, n: number) => `장면 ${i} / ${n}`,
    sceneHold: (s: string) => `${s}초 머물러요`,
    sceneSecondsUnit: "초",
    sceneShows: "보여줄 화면",
    sceneTarget: "찾는 위치",
    sceneByEye: "화면을 보고 찾아요",
    sceneEarlier: "먼저 보여주기",
    sceneLater: "나중에 보여주기",
    scenePlay: "자동으로 넘기기",
    scenePause: "자동 넘김 멈추기",
    scenePrev: "이전 장면",
    sceneNext: "다음 장면",
    menuOpen: "작품 열기 ↗",
    menuEdit: "수정",
    menuDelete: "삭제",
    featuredSet: "대표로 설정",
    featuredUnset: "대표 해제",
    featuredBadge: "★ 대표",
    moveUp: "위로 이동",
    moveDown: "아래로 이동",
    rerecordRequest: "재촬영 요청",
    retryShoot: "촬영 다시 시도",
    makeDemo: "시연 영상 만들기",
  },
  projectForm: {
    hintLabel: "핵심 기능 소개",
    hintPlaceholder: "예: 캔버스에 마우스로 자유롭게 그림을 그릴 수 있어요. 상단에서 브러시 색과 굵기를 바꿔보세요.",
    hintHelp: "자동 시연 영상이 이 설명을 보고 핵심 기능부터 보여드려요.",
    videoTooLarge: (mb: string) => `영상은 20MB 이하만 업로드할 수 있어요. (현재 ${mb}MB)`,
    videoUnreadable: "영상 파일을 읽을 수 없어요.",
    videoTooLong: (s: string) => `영상은 30초 이하만 업로드할 수 있어요. (현재 ${s}초)`,
    uploadFailed: (msg: string) => `업로드 실패: ${msg}`,
    zipFailed: (msg: string) => `zip 압축해제 실패: ${msg}`,
    zipUnreadable: "zip 파일을 읽을 수 없어요.",
    tooLarge: (mb: string) => `총 파일 크기가 25MB를 초과해요. (현재 ${mb}MB)`,
    uploadPartialFailed: (failed: number, total: number) => `파일 ${total}개 중 ${failed}개를 올리지 못했어요. 네트워크를 확인하고 다시 골라 주세요.`,
    // 비밀 파일 폐기 안내(2026-09-01) — 왜 뺐는지까지 말한다. 앱이 .env 없이는
    // 안 도는 경우가 있어, 이유를 모르면 "왜 내 앱이 흰 화면이지"로 끝난다.
    secretFilesSkipped: "안전을 위해 아래 파일은 올리지 않았어요.",
    secretFilesWhy: "올린 파일은 웹에 공개되기 때문에, API 키가 든 .env나 git 기록(.git)은 그대로 두면 누구나 받아갈 수 있어요.",
    onlySecretFiles: "올릴 수 있는 파일이 없어요 — 고른 게 전부 안전상 제외되는 파일이었어요.",
    noHtml: "웹페이지(HTML) 파일이 없어요. 자동 시연은 브라우저에 뜨는 화면을 촬영해요 — index.html이 포함됐는지 확인해 주세요.",
    saveFailed: "저장 중 오류가 발생했어요.",
    urlOptionTitle: "URL 링크",
    filesOptionTitle: "파일 업로드",
    cancel: "취소",
    pickFiles: "파일 선택",
    pickFolder: "폴더 선택",
    uploading: "업로드 중…",
    uploadDone: "업로드 완료",
    descPlaceholder: "어떤 프로젝트인지 소개해주세요.",
    contentTypeLabel: "콘텐츠 유형",
    aiToolsLabel: "사용한 AI 도구",
    multiSelect: "(복수 선택)",
    collapse: "접기 ↑",
    showMore: (n: number) => `더보기 +${n}`,
    videoConnected: "영상 연결됨",
    remove: "제거",
    modeFile: "파일 업로드",
    modeUrl: "URL",
    videoUrlPlaceholder: "https://youtube.com/watch?v=... 또는 https://vimeo.com/...",
    dropOrClick: "클릭하거나 이미지를 드래그해서 업로드",
    prev: "← 이전",
    skip: "건너뛰기",
    next: "다음 →",
    saving: "저장 중…",
    closeAria: "닫기",
    existingUpload: "업로드된 사이트가 연결돼 있어요 — 새로 올리면 교체돼요.",
    editGuideTitle: "React / Vue / Vite 프로젝트라면",
    editGuide1: " 소스 폴더 대신 ",
    editGuide2: " 후 생성된 ",
    editGuide3: " 폴더를 올려주세요. 순수 HTML/CSS/JS 파일은 그대로 올려도 돼요.",
    dropHelpEdit: "HTML, CSS, JS, 이미지 파일 지원 · 최대 25MB · 드래그해서 올려도 돼요",
    uploadDoneEdit: "업로드 완료. 아래 정보를 입력하고 저장하세요.",
    demoUrlLabel: "데모 URL",
    hintLabelEdit: "핵심 기능 소개 (자동 시연용 · 선택)",
    videoLabelOptional: "구동 영상 (선택)",
    videoAutoplayHelp: "대표 작품으로 설정하면 프레임 상단에서 자동 재생돼요.",
    videoPickInline: "+ 영상 파일 선택 (20MB · 30초 이하)",
    nameLabel: "프로젝트 이름",
    yearLabel: "제작 연도",
    descLabel: "설명",
    thumbLabel: "썸네일",
    thumbAutoNote: "(없으면 저장 시 자동 생성)",
    thumbTypeLabel: "썸네일 유형",
    typeImage: "🖼️ 이미지",
    typeVideo: "🎬 영상",
    commentLabel: "한 마디 (말풍선에 표시)",
    commentPlaceholder: "제가 제일 아끼는 작업물이에요! ⭐",
  },
  card: {
    imageTooLarge: "이미지는 5MB 이하만 업로드할 수 있어요.",
    avatarUploadFailed: "이미지 업로드에 실패했어요. 잠시 후 다시 시도해주세요.",
    deleteFailed: "탈퇴 처리에 실패했어요.",
    avatarLabel: "프로필 이미지",
    avatarNote: "(모바일 명함·공유 카드에 쓰여요)",
    changeImage: "이미지 변경",
    uploadImage: "이미지 업로드",
    avatarFormats: "JPG · PNG · GIF · 최대 5MB",
    avatarPendingNote: "저장하기를 누르면 반영돼요",
    nameLabel: "표시 이름",
    usernameLabel: "사용자 이름",
    bioLabel: "한 줄 소개",
    socialLabel: "소셜 링크",
    removeLink: "링크 삭제",
    unrecognizedLink: "아직 인식되지 않는 주소예요 — 명함에는 Instagram · X · GitHub · LinkedIn · YouTube · TikTok · Facebook · Threads 링크만 표시돼요.",
    addLink: "링크 추가",
    save: "저장하기",
    saving: "저장 중…",
    savedMsg: "저장됐어요",
    accountLabel: "계정",
    deleteTitle: "회원 탈퇴",
    deleteBody1: "프로필과 모든 작품·업로드한 파일이 ",
    deleteBodyStrong: "즉시·영구 삭제",
    deleteBody2: "되며, 되돌릴 수 없어요.",
    deleteBtn: "회원 탈퇴",
    deleteModalTitle: "정말 탈퇴하시겠어요?",
    deleteModalBody: "의 프로필과 모든 프로젝트·업로드 파일이 즉시·영구 삭제돼요. 이 작업은 되돌릴 수 없어요.",
    confirmPrefix: "확인을 위해 ",
    confirmSuffix: " 를 입력해주세요",
    cancel: "취소",
    deleting: "탈퇴 중…",
    deleteForever: "영구 삭제",
    usernameChangeWarning: (old: string) => `저장하면 옛 주소 nookframe.com/${old}는 바로 열리지 않아요. 이미 공유한 링크가 끊겨요.`,
  },
  // 명함 탭 "로그인 방법" — 구글·깃허브 연결/해제(components/dashboard/LoginMethods, 09-25).
  // p = 공급자 이름(Google·GitHub). 조사는 받침이 갈리는 "은/는·이에요"를 피해 "계정은"·"로" 앞에만 붙인다.
  loginMethods: {
    label: "로그인 방법",
    intro: "여기 연결한 방법이면 어느 것으로 로그인해도 이 계정이에요.",
    email: "이메일",
    notLinked: "연결 안 됨",
    link: "연결",
    linking: "이동 중…",
    unlink: "해제",
    unlinkConfirm: (p: string) => `해제하면 이 ${p} 계정으로는 여기 들어올 수 없어요.`,
    unlinkYes: "해제하기",
    unlinking: "해제 중…",
    cancel: "취소",
    loadFailed: "로그인 방법을 불러오지 못했어요.",
    retry: "다시 시도",
    linked: (p: string) => `${p} 계정을 연결했어요. 이제 ${p}로도 들어올 수 있어요.`,
    unlinked: (p: string) => `${p} 계정 연결을 해제했어요.`,
    // 그 깃허브가 이미 다른 계정에 붙어 있다(identity_already_exists) — 합치기는 운영자가 손으로 한다.
    takenTitle: (p: string) => `이 ${p} 계정은 이미 다른 Nookframe 계정에 연결돼 있어요.`,
    takenBody: "그 Nookframe 계정을 지우거나 두 계정을 합치려면 문의해 주세요.",
    contact: "메일 보내기",
    failed: "연결이 취소됐거나 끝나지 못했어요. 다시 눌러 주세요.",
    startFailed: "연결을 시작하지 못했어요. 잠시 뒤에 다시 눌러 주세요.",
    unlinkFailed: "해제하지 못했어요. 잠시 뒤에 다시 눌러 주세요.",
  },
  visits: {
    justNow: "방금 전",
    minsAgo: (n: number) => `${n}분 전`,
    hoursAgo: (n: number) => `${n}시간 전`,
    daysAgo: (n: number) => `${n}일 전`,
    today: "오늘",
    last7: "최근 7일",
    last30: "최근 30일",
    total: "전체 조회",
    chartTitle: "최근 14일 방문 추이",
    cappedPrefix: "최근 500회 기준 · ",
    dailyMax: (n: string) => `일 최고 ${n}회`,
    noData: "아직 방문 데이터가 없어요",
    referrers: "유입 경로",
    countries: "방문 국가",
    history: "방문 기록",
    capped: "최근 500회 기준",
    noHistory: "아직 방문 기록이 없어요",
    groupWeek: "어제 ~ 7일 전",
    groupMonth: "8 ~ 30일 전",
    groupOlder: "30일 이전",
    barTooltip: (md: string, n: number) => `${md} — ${n}회`,
    // 국가 코드 → 표시 이름 (VisitsTab의 20개 코드와 1:1)
    countryNames: {
      KR: "한국", US: "미국", JP: "일본", CN: "중국", GB: "영국",
      DE: "독일", FR: "프랑스", CA: "캐나다", AU: "호주", SG: "싱가포르",
      IN: "인도", BR: "브라질", TW: "대만", HK: "홍콩", TH: "태국",
      VN: "베트남", PH: "필리핀", ID: "인도네시아", MY: "말레이시아", NL: "네덜란드",
    },
    // lib/traffic-source.ts가 뱉는 한국어 채널 라벨의 표시 번역.
    // 분류기 자체는 admin(한국어 유지)과 공유라 건드리지 않고 표시만 바꾼다.
    sourceLabels: {
      "카카오톡": "카카오톡",
      "인스타그램": "인스타그램",
      "페이스북": "페이스북",
      "라인": "라인",
      "네이버 앱": "네이버 앱",
      "다음 앱": "다음 앱",
      "X 앱": "X 앱",
      "카카오": "카카오",
      "네이버": "네이버",
      "유튜브": "유튜브",
      "(구글 로그인 리턴)": "(구글 로그인 리턴)",
      "구글 검색": "구글 검색",
      "공유 링크(앱 미상)": "공유 링크(앱 미상)",
      "Nookframe 안에서": "Nookframe 안에서",
      "로컬 테스트(localhost)": "로컬 테스트(localhost)",
      "직접/알 수 없음": "직접/알 수 없음",
    },
  },
  // "무엇을 올리든" 섹션 (2026-08-29, 랜딩 FAQ 자리 대체)
  uploadAnything: {
    headline: "무엇을 올리든",
    // 알약 라벨과 슬라이드 제목이 같은 순서로 물린다(둘 다 6개, 인덱스로 맞춤)
    types: ["배포한 URL", "배포 안 한 폴더", "깃허브 저장소", "파이썬 · CLI", "Flutter · Expo", "만들다 만 것"],
    urlSample: "my-app.vercel.app",
    folderRoot: "my-app/",
    folderFiles: ["index.html", "style.css", "app.js"],
    repoSample: "github.com/you/my-app",
    pyFile: "app.py",
    pyLines: ["import streamlit as st", "st.title(\"내 앱\")"],
    phoneFiles: ["pubspec.yaml", "lib/main.dart", "web/index.html"],
    wipNote: "(여기까지 만듦)",
    filmLabel: "자동 시연 영상",
    // 필름 안 예시 앱 — 누구나 아는 할 일 목록. 특정 제품이 아니라 견본이다.
    demo: {
      title: "오늘 할 일",
      date: "3월 14일",
      add: "추가",
      // 한 글자씩 타이핑된다 — 최대 12글자(그 뒤는 마지막 차례를 같이 쓴다)
      typed: "저녁 장보기",
      row1: "우유 사기",
      row2: "가스비 내기",
    },
  },
  connect: {
    // 첫 질문(2026-09-22, 첫인상 점검 #2) — 한 창에 네 갈래(프롬프트·챗봇·MCP·토큰)가
    // 한꺼번에 있어서 비개발자는 자기가 어느 갈래인지부터 막혔다. "어떤 AI"를 먼저 묻고
    // 그 길 하나만 보여준다. 말도 쉬운 말로(셸·JSON·토큰 → 채팅 AI·AI 답·연결).
    ask: "어떤 AI로 만들었나요?",
    // 두 줄은 "쓰는 곳"이 아니라 "할 수 있는 일"로 나눈다(2026-09-22 사용자 확정). 쓰는 곳
    // (터미널·앱·웹)으로 나누면 Claude Code·Codex가 두 줄에 겹치고, Claude 데스크탑 앱은
    // 대화와 Code 탭이 한 앱이라 또 갈라야 했다. 줄 = 누른 뒤 나오는 길.
    groupAgent: "명령을 직접 실행하는 AI",
    groupAgentNote: "터미널·데스크탑 앱·코드 편집기 어디서 쓰든 같아요. Claude 앱의 Code 탭도 여기예요.",
    groupChat: "채팅만 하는 AI",
    groupChatNote: "Claude 채팅은 claude.ai와 Claude 앱의 일반 대화예요.",
    toolOtherCli: "그 밖의 CLI",
    toolClaudeChat: "Claude 채팅",
    toolOtherChat: "그 밖의 채팅 AI",
    // 원할 때만 보여준다(2026-09-23): 두 줄 설명은 이 접힌 줄 뒤에 두고, 고른 뒤엔 칩이 한 줄로 접힌다.
    whichToggle: "어느 쪽인지 헷갈려요",
    changeTool: "바꾸기",
    // 단계는 번호 목록으로 끊어 보여준다 — 화살표 한 줄은 폰에서 가운데 정렬로 쪼개져 읽기 어려웠다.
    // "확인하고 공개하면 끝"은 창 부제가 늘 말하고 있어 단계에서 뺐다(2026-09-23).
    stepsTerminal: (tool: string | null) => ["[프롬프트 복사]를 눌러요.", tool ? `${tool}에 그대로 붙여넣어요.` : "작품을 만든 AI에게 그대로 붙여넣어요."],
    // 채팅 AI는 두 단계 — 단계마다 버튼이 붙어 있고 지금 차례인 버튼만 진하게 그린다.
    chatStep1: "프롬프트를 복사해서 작품을 만든 대화에 붙여넣어요.",
    chatStep2: "AI 답을 통째로 복사해 온 뒤 눌러요.",
    // Claude 연결 단계는 Claude 앱 자체의 화면이라 줄일 수 없다 — 대신 딱 한 번이다.
    stepsClaude: [
      "주소를 복사해요.",
      "Claude 설정 → 커넥터 → [커스텀 커넥터 추가]에 붙여넣어요.",
      "작품을 만든 대화에서 \"Nookframe에 올려줘\"라고 말해요.",
    ],
    claudeOnceTag: "처음 한 번만",
    // 막힐 때만 필요한 이야기(연결 방식·요금제·계정 제한·프롬프트로 하기)는 이 접힌 줄 뒤로.
    claudeHelpToggle: "잘 안 되나요?",
    claudeAllowHint: "연결 방식을 물으면 추천된 쪽을 그대로 두세요.",
    copyPrompt: "프롬프트 복사",
    copying: "준비 중…",
    // 복사 성공을 버튼 자체가 말하게 한다(2026-09-05) — 아래 작은 문구만으로는
    // 눌렸는지 티가 안 난다는 지적.
    copiedButton: "복사했어요 ✓",
    // 복사 후 한 줄 — AI가 초안을 올리는 순간 자동으로 확인 화면이 열린다.
    waitingAi: "AI가 올리기를 기다리는 중이에요. 도착하면 확인 화면이 저절로 열려요.",
    waitingClaude: "Claude가 올리기를 기다리는 중이에요. 도착하면 확인 화면이 저절로 열려요.",
    // 터미널 AI가 예상과 달리 답만 주고 끝난 경우의 출구(2026-09-18).
    pasteJsonLead: "AI가 답만 주고 끝났나요?",
    // 자동 복사가 막힌 브라우저(사파리 등)의 출구 — 받은 글을 읽기 전용 칸에 펼친다(A2).
    manualCopyLead: "자동 복사가 막혔어요. 아래 칸을 누르면 전체가 선택돼요 — 그대로 복사해 주세요.",
    issueFailed: "준비하지 못했어요. 잠시 후 다시 시도해 주세요.",
    networkFailed: "네트워크 오류로 준비하지 못했어요.",
    previewToggle: "프롬프트 내용 보기",
    // 터미널 AI: 프롬프트 전문과 MCP 연결을 한 접힌 줄에 모았다(2026-09-23).
    moreToggle: "프롬프트 내용 보기 · MCP로 연결",
    revokeConfirm: "이 연결을 끊을까요? 이 연결로 올리던 AI는 바로 못 올리게 돼요.",
    revokeFailed: "끊지 못했어요. 잠시 후 다시 시도해 주세요.",
    tokensToggle: (n: number) => `연결 관리 · 연결된 AI ${n}개`,
    unnamed: "이름 없음",
    autoTokenName: "프롬프트로 연결",
    lastUsed: (d: string) => `최근 사용 ${d}`,
    neverUsed: "사용 전",
    // MCP 연결(2026-09-04, 인터뷰 ⑦): 터미널 AI는 붙여넣기 자체가 없어지는 길.
    mcpLead: "클로드코드·클로드 데스크탑·커서에 한 번 연결해 두면 \"이거 Nookframe에 올려줘\" 한마디로 끝나요. 프롬프트도, AI 답도 옮길 필요가 없어요.",
    // 원격 커넥터(2026-09-17) — 설치도 열쇠 이동도 없는 유일한 길. "클로드" 답의 첫 화면.
    mcpRemoteCaveat: "무료 요금제는 커스텀 커넥터를 1개만 둘 수 있어요. 회사·학교 계정이면 관리자만 추가할 수 있어요.",
    claudeFallback: "커넥터를 추가할 수 없는 계정이라면 ",
    claudeFallbackLink: "프롬프트로 하기",
    mcpRemoteCopy: "주소 복사",
    mcpClaudeCode: "클로드코드 — 터미널에서 한 번",
    mcpJson: "클로드 데스크탑·커서 — MCP 설정 파일에 추가",
    mcpCopy: "내 열쇠 채워서 복사",
    mcpCopying: "준비 중…",
    mcpCopied: "복사했어요 — 내 열쇠가 채워져 있으니 그대로 붙여넣으세요. 다시 복사하면 이전 MCP 열쇠는 끊겨요.",
    // 미리보기 속 자리표시 — 사람이 읽는 화면이라 사전 문구다(명령 자체는 영어 그대로).
    mcpKeyPlaceholder: "<복사를 누르면 여기에 내 열쇠가 채워져요>",
    mcpTokenName: "MCP 연결",
    revoke: "끊기",
  },
  // 원격 MCP 커넥터 동의 화면(2026-09-17). 채팅창 AI가 우리 서버를 직접 부르려면
  // 사람이 여기서 한 번 허용해야 한다. **이름이 아니라 주소를 크게 보여 준다** —
  // 클라이언트 이름은 그쪽이 스스로 적어 올린 값이라 사칭이 공짜다.
  oauth: {
    title: "Nookframe에 연결할까요?",
    hostLead: "이 주소의 프로그램이 연결을 요청했어요",
    selfName: (name: string) => `스스로 밝힌 이름: ${name}`,
    canTitle: "허용하면 할 수 있는 일",
    can1: "내 계정에 작품을 초안으로 올리기",
    can2: "내가 올린 초안을 보고 고치거나 지우기",
    cannotTitle: "할 수 없는 일",
    cannot1: "이미 공개된 작품을 바꾸거나 지우기",
    cannot2: "작품을 공개하기 — 공개는 언제나 내가 대시보드에서 직접 누른다",
    cannot3: "계정 정보·비밀번호 보기",
    returnTo: (host: string) => `허용하면 ${host} 로 돌아갑니다.`,
    loopbackWarn: "이 연결은 내 컴퓨터에서 도는 프로그램이에요. 내가 직접 설치한 게 맞는지 확인하세요.",
    allow: "허용",
    deny: "취소",
    revokeNote: "연결은 대시보드 연결 패널의 토큰 목록에서 언제든 끊을 수 있어요.",
    errorTitle: "연결할 수 없어요",
    errorHint: "커넥터를 만든 쪽에 이 문구를 그대로 알려 주세요.",
    backToDashboard: "대시보드로",
    // 비로그인 상태. 로그인 뒤 원래 자리로 돌려보내려면 인증 경로를 건드려야 해서,
    // 대신 "다시 한 번 눌러 주세요"로 잇는다(인증은 민감해 손대지 않는다).
    loginTitle: "먼저 로그인이 필요해요",
    loginBody: "로그인한 다음, 연결을 요청한 프로그램에서 [연결]을 한 번 더 눌러 주세요. 그때는 바로 이 화면이 열려요.",
    loginCta: "로그인하기",
  },
  share: {
    share: "공유",
    copiedFlash: "복사됨!",
    copyWatch: "작품 링크 복사",
    copyFailed: "복사가 막혔어요. 아래 글을 길게 눌러 직접 복사해 주세요.",
    copyX: "X 공유문구 복사",
    downloadMp4: "mp4 다운로드",
  },
  rerecord: {
    // 재촬영 루프(2026-08-25): 사람은 말로 불만을 적고, 대본은 AI가 다시 쓴다.
    bodyV2: "영상에서 마음에 안 드는 점을 그대로 적어 주세요. 시간대까지 적으면 더 좋아요 — 이 내용과 지금 대본을 통째로 담은 재촬영 프롬프트를 만들어 드려요. 그걸 작품을 만든 AI에게 주면 AI가 대본을 다시 씁니다.",
    placeholderV2: "예: 16초에서 설정 버튼 누르는 건 빼주세요. 대신 검색 기능을 보여줬으면 좋겠어요. 그리고 결과 화면이 너무 빨리 지나가요.",
    // 지금 걸려 있는 대본을 요청 화면에서 같이 보여준다(2026-09-05 요청 7) —
    // 어느 스텝이 문제였는지 짚어야 AI가 정확히 고친다.
    currentScriptHint: "지금 영상은 아래 대본대로 찍혔어요. 몇 번째 스텝이 마음에 안 드는지 같이 적어 주면 훨씬 정확해져요.",
    copyPrompt: "재촬영 프롬프트 복사",
    copying: "만드는 중…",
    copied: "복사했어요 — AI에게 붙여넣으세요",
    afterCopy: "AI가 새 대본을 제출하면 이 화면으로 돌아와 확인하고 재촬영을 누르시면 돼요.",
    pendingTitle: "새 대본이 도착했어요",
    pendingBody: "AI가 다시 쓴 대본이에요. 확인하고 마음에 들면 재촬영을 시작하세요.",
    aiNote: "AI 메모",
    apply: "이 대본으로 재촬영",
    applying: "시작하는 중…",
    queued: "재촬영을 시작했어요. 촬영이 끝나면 알려드릴게요.",
    awaitingApproval: "재촬영 요청을 접수했어요. 이 작품의 셀프 재촬영 1회는 이미 써서, 관리자 승인 후 촬영돼요.",
    askAgain: "수정사항 다시 적기",
    selfFreeHint: "이 작품은 재촬영 1회를 바로 시작할 수 있어요.",
    approvalHint: "셀프 재촬영 1회를 이미 썼어요 — 이번엔 관리자 승인 후 촬영돼요.",
    title: "재촬영 요청",
    body: "시연 영상은 프로젝트당 한 편이에요. 무엇을 어떻게 바꾸고 싶은지 적어주시면 관리자가 확인한 뒤 다시 촬영해 드려요.",
    emptyReason: "바꾸고 싶은 점을 적어주세요.",
    requestFailed: "요청에 실패했어요.",
    placeholder: "예: 첫 화면 로딩이 길게 잡혔어요. 로그인 후 대시보드 화면 위주로 보여주세요.",
    cancel: "취소",
    sending: "보내는 중…",
    send: "요청 보내기",
  },
  // /publish — 셸 없는 AI(챗봇)가 준 JSON을 붙여넣는 페이지
  // 폰 → 컴퓨터 넘기기 화면 /send (2026-09-23, docs/desktop-handoff.md).
  handoff: {
    pageTitle: "컴퓨터로 보내기 | Nookframe",
    title: "컴퓨터에서 이어서 하세요",
    body: "Nookframe은 컴퓨터의 AI 도구로 작품을 올려요. 이메일을 넣으면 컴퓨터에서 바로 열 링크를 보내 드려요.",
    emailLabel: "이메일",
    remindLabel: "내일 한 번 더 알려주기 (선택)",
    submit: "내 컴퓨터로 보내기",
    sending: "보내는 중…",
    sentTitle: "보냈어요!",
    sentBody: "컴퓨터에서 메일을 열고 버튼을 누르세요. 안 보이면 스팸함도 확인해 주세요.",
    sendAgain: "다른 주소로 보내기",
    signupHere: "지금 여기서 가입할래요 →",
    privacyNote: "링크 메일은 1통만 보내요. 알림을 고르면 내일 1통 더. 주소는 30일 뒤 지워요.",
    // 폰에서 막 가입한 사람(로그인 상태)에게 보이는 얼굴(09-25). 이메일 입력 없이 버튼 하나.
    accountTitle: "가입 완료! 이제 컴퓨터에서 이어서 해요",
    accountBody: "작품은 컴퓨터의 AI 도구로 올려요. 버튼을 누르면 아래 주소로 컴퓨터에서 열 링크를 보내 드려요.",
    browseFirst: "폰으로 먼저 둘러볼게요 →",
  },
  publish: {
    backToDashboard: "← 대시보드",
    title: "AI가 준 걸 붙여넣기",
    intro:
      "ChatGPT·제미나이처럼 채팅창에서 쓰는 AI라면, AI가 준 답을 여기에 붙여넣으세요. 초안으로 올라가요.",
    // 옛 문구는 없는 "연결 탭"을 가리켰다(출시 점검 브라우저 #3) — 프롬프트는 [프로젝트 추가] 창에 있다.
    promptHintBefore: "AI에게 줄 프롬프트는 ",
    promptHintLink: "대시보드 → [프로젝트 추가]",
    promptHintAfter: " 창에 있어요.",
    submitting: "올리는 중…",
    submit: "초안으로 올리기",
    reviewNote: "공개 전에 대시보드에서 확인할 수 있어요",
    clipboardButton: "클립보드에서 가져와 올리기",
    clipboardHint: "AI 답을 통째로 복사해 두셨다면 이 버튼 하나면 돼요 — 설명이 섞여 있어도 JSON만 골라내서 바로 올려요.",
    pasteHint: "아래 칸에 붙여넣어도 바로 올라가요.",
    // 입력칸 예시(첫인상 #9) — 코드 모양 예시는 "내가 채워야 하는 양식"으로 읽혔다.
    pastePlaceholder: "여기에 AI 답을 통째로 붙여넣으세요 (설명이 섞여 있어도 괜찮아요)",
    clipboardEmpty: "클립보드에서 JSON을 찾지 못했어요. AI 답을 복사한 뒤 다시 눌러 주세요.",
    clipboardDenied: "브라우저가 클립보드 읽기를 막았어요 — 아래 칸에 직접 붙여넣어 주세요.",
    // 파일 첨부(2026-09-17): 채팅창 AI는 파일을 못 내지만 **사람 손엔 파일이 있다**
    // (Claude 화면의 "HTML로 내려받기" 등). 인터넷에 올리지 못해 포기하는 경우가
    // 가장 많다는 조사 결과에 맞춘 칸이다.
    // 붙여넣는 순간 올라가므로 파일은 **먼저** 골라야 같이 간다(B4) — 그래서 칸도 맨 위다.
    filesTitle: "작품 파일이 있으면 먼저 골라 주세요 (없으면 건너뛰어요)",
    // 연결 창 안(compact)에서는 파일 칸을 접어 둔다 — 누르면 붙여넣기 칸 위에 펼쳐진다.
    filesToggle: "작품 파일도 있어요 (.html·.zip·스크린샷·영상)",
    // 연결 창(compact)에서는 글상자도 접어 둔다 — 클립보드 읽기가 막히면 저절로 펼친다(2026-09-23).
    typeToggle: "직접 붙여넣을래요",
    filesHint: "인터넷에 안 올린 작품이라면 파일을 주세요. AI가 만들어준 화면은 보통 “HTML로 내려받기”가 돼요 — 그 파일 하나면 됩니다.",
    pickHtml: "작품 파일 (.html 또는 .zip, 25MB까지)",
    pickShot: "스크린샷 (5MB까지)",
    pickVideo: "직접 만든 시연 영상 (20MB까지)",
    // 브라우저 기본 파일 칸 대신 쓰는 버튼(2026-09-24) — 기본 칸은 글자로만 보여 누르는 곳인 줄 몰랐다.
    pickFile: "파일 고르기",
    fileChosen: (name: string) => `${name} 선택됨`,
    fileClear: "빼기",
    fileTooLarge: (name: string, mb: number) => `${name}이(가) 너무 커요 — ${mb}MB까지만 올릴 수 있어요.`,
    zipping: "파일 준비 중…",
    uploadingFiles: "파일 올리는 중…",
    errors: {
      uploadFailed: "파일을 올리지 못했어요. 크기를 확인하고 다시 시도해 주세요.",
      empty: "AI가 준 JSON을 붙여넣어 주세요.",
      urlOnly: "URL만으로는 부족해요 — 제목·설명이 담긴 JSON을 붙여넣어 주세요.",
      invalidJson: "JSON을 읽을 수 없어요. AI가 준 { ... } 형식 그대로 붙여넣어 주세요.",
      submitFailed: "올리지 못했어요. 잠시 후 다시 시도해 주세요.",
      network: "네트워크 오류로 올리지 못했어요.",
      noJson: "붙여넣은 글에서 { … } 모양의 JSON을 찾지 못했어요. AI 답을 통째로 붙여넣어도 돼요.",
      copyFailed: "복사에 실패했어요. 한 번 더 눌러주세요.",
    },
    // 되돌려보내기 루프(2026-08-28): JSON을 쓴 건 AI인데 고치라는 말은 사람이
    // 받는다 — 사람은 버튼 하나, 고치는 건 AI(재촬영 루프와 같은 설계).
    fixWithAi: "이 사유를 AI에게 전달하기",
    fixCopied: "복사했어요 — AI에게 붙여넣으세요",
    fixHint: "AI가 고친 JSON을 주면 위에 다시 붙여넣고 올리면 돼요.",
  },
  // /[username] 명함(Theater) 퍼블릭 페이지
  theater: {
    editFrame: "프레임 수정",
    myFrame: "내 프레임",
    menu: "메뉴",
    mobilePreview: "모바일 미리보기",
    login: "로그인",
    emptyTitle: "아직 공개된 프로젝트가 없어요",
    emptyBody: "곧 새로운 작업물이 올라올 예정이에요.",
    screenings: (total: number) => `상영 목록 · ${total} works`,
    aboutLabel: "명함 · About",
    upNextLabel: "상영 목록 · Up Next",
    prevWork: "이전 작품",
    nextWork: "다음 작품",
    makerNote: "만든이 메모",
    ctaFullscreen: "전체화면으로 체험",
    ctaFullscreenShort: "전체화면 체험",
    ctaVisit: "체험하러 가기",
    viewDetail: "자세히 보기",
    errorTitle: "프레임을 불러오지 못했어요",
    errorBody: "이 페이지를 표시하는 중 문제가 생겼어요. 다시 시도하거나 홈으로 돌아가 주세요.",
    copyLink: "링크 복사",
    viewMobile: "모바일 화면으로 보기",
    viewDesktop: "PC 화면으로 보기",
    embedLoginAria: "로그인 안내",
    embedLoginTitle: "로그인은 모바일에서 진행해주세요",
    embedLoginBody: "모바일 미리보기에서는 로그인을 할 수 없어요. 실제 모바일 기기에서 로그인해 주세요.",
  },
  // 공용 에러 화면(components/ErrorState) + 루트 에러 바운더리(app/error.tsx)
  errorState: {
    eyebrow: "문제가 발생했어요",
    retry: "다시 시도",
    home: "홈으로",
    errorCode: "오류 코드",
    rootTitle: "페이지를 불러오지 못했어요",
    rootBody: "잠시 문제가 생겼어요. 다시 시도하거나 홈으로 돌아가 주세요.",
    notFoundEyebrow: "404 · 페이지 없음",
    notFoundTitle: "페이지를 찾을 수 없어요",
    notFoundBody: "주소가 바뀌었거나 사라진 페이지일 수 있어요. 홈으로 돌아가 시작해 주세요.",
  },
  // 서버 API 에러 응답(apiError message) — 클라이언트가 그대로 표시한다.
  // admin 전용 라우트는 한국어 유지라 여기 없다. 라우트는 getT()로 쿠키 언어를 읽고,
  // PAT(Bearer) 인제스트는 기계/AI 호출자라 en 고정.
  api: {
    loginRequired: "로그인이 필요해요.",
    retryLater: "잠시 후 다시 시도해 주세요.",
    projectNotFound: "프로젝트를 찾을 수 없어요.",
    projectForbidden: "이 프로젝트에 대한 권한이 없어요.",
    demoStatusFailed: "시연 상태를 불러오지 못했어요.",
    // 재촬영 요청 (request-rerecord)
    rerecordReasonRequired: "무엇을 어떻게 바꾸고 싶은지 적어주세요.",
    rerecordInFlight: "지금 시연 영상을 만드는 중이에요. 끝난 뒤에 요청해 주세요.",
    rerecordSaveFailed: "요청을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
    // 자동 시연 소스 검증 (trigger-demo · ingest 공유)
    unsupportedSource: "자동 시연을 만들 수 없는 소스예요.",
    contentHost: (host: string) =>
      `${host}는 자동 시연으로 촬영하는 '내 작품' 주소가 아니에요. 영상 링크라면 '구동 영상' 칸에 넣어주세요.`,
    contentHostShort: (host: string) =>
      `${host}는 자동 시연으로 촬영하는 '내 작품' 주소가 아니에요.`,
    privateHost: "localhost나 내부 주소는 촬영할 수 없어요. 공개로 접속되는 배포 URL로 올려주세요.",
    privateHostShort: "localhost·내부 주소는 안 돼요. 공개로 접속되는 배포 URL로 올려주세요.",
    notPublicUrl: "공개 인터넷에서 접속되는 주소가 아니에요. 배포된 공개 URL로 올려주세요.",
    demoUpdateFailed: "데모 상태를 업데이트하지 못했어요. 잠시 후 다시 시도해 주세요.",
    alreadyHasDemo: "이미 시연 영상이 있어요. 다시 만들려면 '재촬영 요청'으로 바꾸고 싶은 점을 알려주세요.",
    attemptLimit: "자동 생성 재시도 한도를 다 썼어요. '재촬영 요청'으로 관리자 승인을 받아주세요.",
    demoStartFailed: "자동 시연을 시작할 수 없어요.",
    heldGlobal: "오늘 자동 시연 생성이 많아 잠시 대기열에 넣었어요. 관리자 확인 후 생성돼요.",
    heldUser: "하루 자동 시연 한도를 넘어 관리자 승인 대기로 전환했어요. 승인 전까지는 이미지로 표시돼요.",
    // 인제스트 (Nookframe Connect)
    tokenInvalid: "토큰이 유효하지 않거나 폐기됐어요.",
    loginOrTokenRequired: "로그인이 필요해요. (토큰 또는 세션)",
    tooManyRequests: "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.",
    uploadTooLarge: "업로드가 너무 커요 (최대 25MB).",
    payloadPartRequired: "payload(JSON) 파트가 필요해요.",
    payloadJsonInvalid: "payload JSON을 읽을 수 없어요.",
    jsonBodyInvalid: "JSON 본문을 읽을 수 없어요.",
    titleRequired: "title이 필요해요.",
    descriptionTooLong: (max: number) =>
      `description이 너무 길어요(최대 ${max}자). 명함 화면에는 2~3문장만 보이니 짧게 줄여주세요.`,
    draftLimit: (max: number) =>
      `검토 대기 중인 초안이 너무 많아요 (최대 ${max}개). 대시보드에서 먼저 공개하거나 정리해 주세요.`,
    artifactRequired: "deployUrl(또는 appUrl), 파일 번들(bundle), 또는 htmlBody(파일 하나짜리 작품의 HTML 전문) 중 하나가 필요해요.",
    // 글자로 온 HTML(2026-09-17). 셸 없는 채팅창 AI가 파일 대신 본문을 넘기는 길이라,
    // 되돌려보내는 문장이 곧 그 AI의 지시문이다 — 무엇을 어떻게 다시 보낼지까지 적는다.
    htmlBodyIssue: (kind: "empty" | "too-large" | "not-html" | "truncated", maxMb: number) =>
      kind === "empty"
        ? "htmlBody가 비어 있어요."
        : kind === "too-large"
          ? `htmlBody가 너무 커요 (최대 ${maxMb}MB). 이 길은 파일 하나짜리 작품용이에요 — 더 크거나 CSS·JS가 따로 있는 작품은 주인이 zip으로 올려야 해요.`
          : kind === "not-html"
            ? "htmlBody가 완전한 HTML 문서가 아니에요. <!doctype html>부터 </html>까지 통째로, CSS·JS를 문서 안에 넣어 보내세요 — 조각(<div>…</div>)이나 설명문은 페이지로 뜨지 않아요."
            : "htmlBody가 중간에 잘린 것 같아요 — 닫는 </html>도 </body>도 없어요. 답변이 끊겼다면 이어서 받은 뒤 **전체를 한 번에** 보내세요. 반쪽짜리 작품이 그대로 발행되지 않게 여기서 막는 거예요.",
    badUrl: "임베드·시연할 수 있는 URL이 아니에요.",
    demoAccessBadUrl: "demoAccess.url은 http(s) 주소이거나 /로 시작하는 경로여야 해요.",
    demoAccessSecretParam: (name: string): string =>
      `demoAccess에 비밀값처럼 보이는 이름("${name}")이 있어요 — 토큰·비밀번호·키는 받지 않아요. 공개된 작품의 이 칸은 누구나 읽을 수 있어서 넣는 순간 새어 나갑니다. 비밀 없이 들어가는 게스트/데모 경로({ "url": "/demo", "params": {"guest":"1"} })를 주세요.`,
    demoAccessRequired:
      "demoAccess가 필요해요 — 로그인 질문에 반드시 답해야 발행됩니다. 시연 로봇은 절대 로그인하지 않아요. 그래서 로그인해야 화면이 보이거나, **로그인한 뒤에야 기능이 도는** 앱을 그냥 올리면 로그인 화면이나 텅 빈 화면만 찍힙니다. 아래 셋 중 하나를 반드시 주세요. ①로그인 없이 들어갈 길이 있으면: { \"url\": \"/demo\", \"params\": {\"guest\":\"1\"}, \"note\": \"거기서 데모 모드를 보는 법\" } — 데모/게스트 모드가 없다면 가짜 데이터로 작게 하나 만드는 게 이 영상에 가장 좋은 투자예요. 다만 주인의 앱을 고치는 일이니 코드를 쓰거나 배포하기 전에 주인에게 먼저 물어보세요. ②로그인이 정말 아예 필요 없고 첫 화면부터 전 기능이 눌리면: { \"noLogin\": true }. ③게스트 경로가 원천 불가능하면(E2E 암호화·기기 페어링 등): { \"impossible\": true, \"note\": \"이유\" } — 이 경우 랜딩만 찍히니 직접 만든 영상(video) 첨부를 강하게 권해요. 계정 아이디·비밀번호는 절대 넣지 마세요 — 받지 않습니다.",
    demoAccessEvidence: (which: "noLogin" | "impossible"): string =>
      which === "noLogin"
        ? 'demoAccess를 { "noLogin": true } 한 줄로만 주면 받지 않아요 — 무엇을 확인했는지 note에 적어 주세요(12자 이상). 예: { "noLogin": true, "note": "middleware·app/page.tsx에 인증 가드 없음, 목록은 시드 데이터로 채워짐" }. 랜딩이 멀쩡해 보이는 것과 **로그인 전에 기능이 실제로 도는 것**은 다릅니다. 라우트와 가드를 직접 열어 확인하고, 확인이 안 되면 noLogin 대신 데모 경로({ "url": "/demo" })를 주세요 — 없다면 가짜 데이터로 작게 하나 만드는 게 이 영상을 위한 가장 값진 투자예요(코드를 고치거나 배포하기 전에 주인에게 먼저 물어보세요).'
        : 'demoAccess를 { "impossible": true } 한 줄로만 주면 받지 않아요 — 게스트 경로가 왜 원천 불가능한지 note에 적어 주세요(12자 이상). 예: { "impossible": true, "note": "E2E 암호화라 키 없이는 화면이 빈 채로 뜬다" }. 이 경우 랜딩만 촬영되니 직접 만든 시연 영상(video) 첨부를 강하게 권해요.',
    targetDeviceRequired:
      'targetDevice가 필요해요 — 이 앱을 주로 어떤 화면에 맞춰 만들었는지 답해 주세요. 폰 화면용(좁은 한 줄 레이아웃·아래 탭바·터치 위주)이면 "mobile", 컴퓨터 브라우저용(넓은 레이아웃·사이드바·마우스 위주)이면 "desktop"이에요. 둘 다 되면 처음에 맞춰 만든 쪽을 고르세요. contentType의 "mobile"(폰 앱 분류)과는 다른 질문이에요. 이 답으로 초안 미리보기를 폰 화면으로 보여줄지 PC 화면으로 보여줄지 정해요.',
    // 값은 왔는데 목록 밖일 때 — "필요해요"라고 하면 AI는 "넣었는데?" 하고 같은 값을 또 보낸다.
    targetDeviceInvalid: (got: string) =>
      `targetDevice는 "mobile" 또는 "desktop"만 돼요 — 받은 값: ${got}. 폰 화면에 맞춰 만든 앱이면 "mobile", 컴퓨터 브라우저에 맞춰 만든 앱이면 "desktop"으로 바꿔 다시 보내 주세요.`,
    rerecordPendingNext: "새 대본을 접수했어요. 작품 주인이 대시보드에서 확인하고 [이 대본으로 재촬영]을 눌러야 촬영이 시작돼요.",
    rerecordNoPendingScript: "대기 중인 새 대본이 없어요. 재촬영 프롬프트를 AI에게 주고, AI가 새 대본을 제출한 뒤에 눌러 주세요.",
    rerecordAlreadyUsed: "이 작품의 셀프 재촬영 1회는 이미 썼어요. 다음부터는 관리자 승인이 필요해요.",
    rerecordDefaultReason: "영상이 마음에 들지 않아 새 대본으로 재촬영을 요청했어요.",
    scriptRequired:
      "demoScript(촬영 대본)가 필요해요 — 이 대본이 곧 시연 영상입니다. 없으면 로봇이 화면을 픽셀로 더듬어 추측 촬영하게 되고, 느리고 비싸고 품질도 낮아요. { \"steps\": [ { \"goal\": …, \"selector\": …, \"where\": …, \"action\": \"click|type|drag|scroll|hover|draw|focus\", \"text\": …, \"expect\": …, \"hold\": … } ] } 형태로 5~8스텝(최소 4, 최대 10)을 중요한 순서대로 주세요. 이 앱을 만든 당신은 각 컨트롤의 정확한 CSS 셀렉터를 알고 있습니다(화면만 아는 경우엔 `where`에 눈으로 찾는 법을 적으면 폴백으로 씁니다). 유일한 예외: 직접 만든 시연 영상을 `video`로 첨부하면 자동 촬영을 건너뛰므로 대본이 필요 없어요.",
    scriptTooThin: (n: number) =>
      `demoScript가 ${n}스텝뿐이라 영상이 되기엔 부실해요. 최소 4스텝(권장 5~8, 최대 10)을 중요한 순서대로 주세요 — 1번은 이 작품에서 절대 빠지면 안 되는 기능이어야 합니다.`,
    scriptStepsVague: (solid: number, total: number) =>
      `demoScript의 스텝 ${total}개 중 실제로 찍을 수 있는 건 ${solid}개뿐이에요. 스텝마다 **무엇을 하는지**(action: click|type|drag|scroll|hover|draw|focus)와 **어디서 하는지**(selector — 이 앱을 만든 당신은 정확한 CSS 셀렉터를 알고 있습니다. 화면만 안다면 where에 눈으로 찾는 법)를 둘 다 넣어 주세요. goal만 적힌 줄은 대본이 아니라 목차라서, 로봇이 결국 화면을 픽셀로 더듬어 추측하게 됩니다 — 영상이 망가지는 가장 흔한 경로예요. 최소 3개 스텝이 이 조건을 채워야 저장합니다.`,
    // 대본 점검표(2026-09-04) — 저장은 됐지만 더 좋아질 수 있는 곳. 거절이 아니라
    // "같은 URL(또는 draftId)로 다시 publish하면 이 초안이 갱신된다"는 전제의 고쳐-다시-올리기 안내.
    scriptReview: {
      fewSteps: (n: number) =>
        `대본이 ${n}스텝이에요 — 영상 30초를 채우려면 6~8스텝이 알맞아요. 이 앱의 핵심 기능을 중요한 순서대로 더 넣고 다시 publish하면(같은 URL, 또는 draftId에 이 초안 id) 이 초안이 갱신돼요.`,
      filmTooLong: (seconds: number, cut: number, budget: number) =>
        `이 대본은 촬영에 약 ${seconds}초가 걸리는데 필름은 약 ${budget}초에서 끊겨요 — ${cut}번째 스텝부터는 영상에 못 들어가요. 덜 중요한 비트를 빼거나(5~8스텝이 알맞아요) hold를 줄이세요. 이 계산은 커서 이동·조작·hold만 더한 값이라, 페이지가 느리면 더 길어질 수는 있어도 짧아지지는 않아요.`,
      lowInteraction: (n: number, total: number) =>
        `${total}스텝 중 실제 조작(click·type·drag)은 ${n}개뿐이에요 — 나머지가 focus·hover·scroll이면 영상이 슬라이드쇼처럼 보일 수 있어요. 누를 만한 기능이 이미 있다면, 핵심 기능을 눌러 결과가 바뀌는 스텝을 2개 이상 넣으세요. 다만 원래 넘겨 보거나 바라보는 작품이라면(읽는 글, 포스터, 생성 화면, 누를 게 없다는 것 자체가 핵심인 작품) 대본을 그대로 두세요 — 이 안내를 맞추려고 작품에 없던 버튼을 만들지는 마세요.`,
      unwired: (n: number, total: number) =>
        `${total}스텝 중 ${n}개에 selector가 없어요 — 그 스텝은 로봇이 화면을 보고 추측해요(느리고 비쌈). 이 앱의 코드를 열어 정확한 CSS 셀렉터를 넣으세요.`,
      noExpect: (n: number, total: number) =>
        `${total}스텝 중 ${n}개에 expect가 없어요 — "하고 나면 무엇이 보여야 하는지"가 없으면 로봇이 먹었는지 판정을 못 해요. 화면에 실제로 나타나는 글자·숫자로 적으세요.`,
      noSkip:
        "skip 목록이 없어요 — 다크모드 토글·언어 전환처럼 찍으면 안 되는 것을 적어두면 영상이 엉뚱한 데로 새지 않아요.",
      selectorsMissing: (missing: string[], url: string) =>
        `첫 화면에서 쓰는 셀렉터가 ${url} 이 처음 보내는 HTML에 없어요: ${missing.join(", ")}. 페이지가 뜬 뒤 자바스크립트가 그리는 요소(API로 받아 오는 목록 등)라면 정상이에요 — 로봇이 기다렸다가 찾아요. 처음부터 HTML에 있어야 하는 요소라면 코드와 철자를 대조하거나, where에 눈으로 찾는 법을 적으세요.`,
      selectorsUnverifiable: (url: string) =>
        `${url} 이 처음 보내는 HTML에는 로봇이 찍을 화면이 없어요(자바스크립트가 그리거나, 다른 화면으로 넘어가는 페이지). 그래서 셀렉터를 확인하지 못했을 뿐 오류가 아니에요. 브라우저 도구가 있으면 페이지를 열어 확인하고, 이 결과만 보고 셀렉터를 바꾸지는 마세요.`,
      selectorsFetchFailed: (url: string, detail: string) => {
        const botWall = detail === "http-403" || detail === "http-429" || detail === "http-503";
        const why = botWall
          ? `${detail.replace("http-", "HTTP ")} 를 돌려줬어요 — 로그인 문제가 아니라 봇 차단(Cloudflare 같은 것)일 가능성이 아주 높아요`
          : detail === "timeout" ? "시간 안에 응답이 없었어요"
            : detail === "unreachable" ? "주소에 닿지도 못했어요(없거나 죽은 도메인)"
              : detail.startsWith("http-4") ? `${detail.replace("http-", "HTTP ")} 를 돌려줬어요 — 주소가 틀렸거나, 비공개거나, 로그인이 필요해요`
                : detail.startsWith("http-5") ? `${detail.replace("http-", "HTTP ")} 를 돌려줬어요 — 그 사이트가 오류를 내고 있어요`
                  : "요청이 실패했어요";
        const fix = botWall
          ? "촬영 로봇도 같은 벽에 막혀요. 공유 설정을 바꿔도 안 되니 그쪽을 손대게 하지 마세요 — 보통 방식으로 배포한 주소를 주거나, 작품을 파일로 올리는 쪽으로 가세요."
          : detail === "timeout"
            ? "이것만으로 무언가를 바꿀 이유는 없어요 — 다만 늘 이렇게 느리면 촬영이 빈 화면을 찍을 수 있어요."
            : "그 주소가 처음 온 사람에게도, 로그인 없이 열리는지 확인하세요.";
        return `셀렉터 확인용으로 ${url} 을 열지 못했어요: ${why}. ${fix}`;
      },
    },
    descriptionShape: (kind: "empty" | "lines" | "long-line", n: number, maxCols: number) => {
      const example =
        '예: "AI로 창작하는 사람들을 위한\\n자동으로 시연 영상까지 만들어주는\\n직접 보고 느끼는 라이브 포트폴리오" — 앞 줄들이 수식하고 마지막 줄이 정체를 밝히는 구조로, 각 줄은 한글 20자·영문 40자 안팎으로 짧게.';
      const head =
        kind === "empty"
          ? "description(소개글)이 필요해요."
          : kind === "lines"
            ? `description이 ${n}줄이에요. 명함에는 3줄까지만 보입니다.`
            : `description의 ${n}번째 줄이 너무 길어요(최대 ${maxCols}칸 — 한글 한 글자가 2칸). 폰에서 그 줄이 접히면서 마지막 줄이 잘려요.`;
      return `${head} 소개글은 명함에서 작품 위에 겹쳐 뜨는 첫인상 글이라, 한 문단이 아니라 줄바꿈(\\n)으로 끊은 2~3줄로 써야 합니다. ${example}`;
    },
    mediaImageTooLarge: (maxMb: number) => `스크린샷 이미지가 너무 커요 (최대 ${maxMb}MB).`,
    mediaVideoTooLarge: (maxMb: number) => `시연 영상이 너무 커요 (최대 ${maxMb}MB).`,
    mediaImageBadType: "screenshot은 png/jpg/webp/gif 이미지 파일이어야 해요.",
    mediaVideoBadType: "video는 mp4/webm 영상 파일이어야 해요.",
    mediaUploadFailed: "미디어 업로드에 실패했어요. 잠시 후 다시 시도해 주세요.",
    finalizeNothing: "업로드된 파일이 없어요. 발급받은 URL로 파일을 먼저 올린 뒤 finalize를 호출해 주세요.",
    finalizeNoScriptNoVideo: "영상도 촬영 대본도 없어요. 선언한 영상을 올리거나, demoScript를 넣어 다시 발행해 주세요. 둘 중 하나가 있어야 시연을 만들 수 있어요.",
    finalizeNotDraft: "이미 공개된 프로젝트는 이 경로로 수정할 수 없어요.",
    draftIdNotDraft: "이미 공개된 프로젝트예요 — draftId로는 초안만 갱신할 수 있어요. 공개된 작품의 영상을 바꾸려면 rerecord로 새 대본을 내세요.",
    newDraftConflict: "newDraft와 draftId는 서로 반대예요 — newDraft는 늘 새 초안을 만들고, draftId는 그 초안을 갱신해요. 둘 중 하나만 보내세요.",
    draftNoFields: "수정할 항목이 없어요.",
    draftUrlImmutable: "URL이나 파일 교체는 payload에 \"draftId\": \"<이 초안 id>\"를 넣고 publish를 다시 실행하세요 — 그 초안이 그대로 갱신돼요(같은 URL로 다시 올려도 갱신돼요).",
    projectCreateFailed: "프로젝트를 만들지 못했어요.",
    indexHtmlMissing: "이 파일 묶음에는 웹페이지(index.html)도 실행 가능한 코드(package.json·*.py)도 없어요. 정적 사이트라면 index.html을, 파이썬·CLI 프로젝트라면 소스 파일을 포함해 주세요.",
    nativePlatforms: {
      ios: "iOS(Swift·Xcode)",
      android: "안드로이드(Kotlin·Gradle)",
      unity: "Unity",
      electron: "Electron 데스크톱",
      tauri: "Tauri 데스크톱",
      extension: "브라우저 확장 프로그램",
    } as Record<string, string>,
    // 폰 앱만 Flutter·Expo·RN 우회로가 있다. 데스크톱·확장은 바로 영상 안내로 간다.
    nativeAppUnsupported: (platform: string, mobile = true) =>
      `${platform} 앱은 브라우저에서 열 수 없어서 자동 촬영을 못 해요. ` +
      (mobile
        ? "Flutter·Expo·React Native로 만든 앱이라면 소스를 그대로 올려 주세요(웹 버전을 대신 빌드해 촬영해요). 그 외에는 "
        : "") +
      "화면 녹화 영상을 video로 첨부해 주세요 — 영상이 있으면 자동 촬영 없이 그 영상으로 바로 보여줘요.",
    badFilePath: "잘못된 파일 경로가 감지됐어요.",
    fileUploadFailed: (detail: string) => `파일 업로드 실패: ${detail}`,
    demoUrlSaveFailed: "데모 URL 저장에 실패했어요.",
    uploadProcessingError: "업로드 처리 중 오류가 났어요.",
    zipBomb: "압축 해제 크기가 한도를 초과했어요 (zip bomb 의심).",
    zipReadError: "zip 해제 중 오류가 났어요.",
    zipEmpty: "빈 zip이에요.",
    zipTooManyFiles: (max: number) => `파일이 너무 많아요 (최대 ${max}개).`,
    zipNoValidFiles: "업로드할 유효한 파일이 없어요.",
    zipOnlySecrets: "안전상 제외되는 파일(.env·.git 등)뿐이라 올릴 게 없어요. 실제 앱 파일을 담아 다시 보내주세요.",
    // 저장하지 않은 비밀 파일의 종류 이름(lib/upload-safety.ts의 SecretKind).
    secretFileKinds: {
      env: "환경변수 파일", envrc: "direnv 설정", git: "git 기록",
      sshDir: "SSH 폴더", sshKey: "SSH 개인키", cert: "인증서·키스토어",
      npmrc: "npm 인증 설정", pypirc: "PyPI 인증 설정", netrc: "netrc 인증 정보",
      aws: "AWS 자격증명", htpasswd: "htpasswd 비밀번호", serviceAccount: "서비스 계정 키",
    },
    // 신고 (report)
    badReport: "잘못된 신고 요청이에요.",
    reportRateLimited: "신고가 너무 잦아요. 잠시 후 다시 시도해 주세요.",
    handoffBadEmail: "이메일 주소를 확인해 주세요.",
    handoffCaptcha: "보안 확인을 다시 해 주세요.",
    handoffRateLimited: "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.",
    handoffSendFailed: "메일을 보내지 못했어요. 잠시 후 다시 시도해 주세요.",
    targetNotFound: "대상을 찾을 수 없어요.",
    reportSaveFailed: "신고를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
    // 계정 (account)
    accountDeleteFailed: "탈퇴 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
    // 토큰 (tokens)
    tokenLimit: (max: number) => `토큰은 최대 ${max}개까지 만들 수 있어요. 안 쓰는 토큰을 폐기해 주세요.`,
    tokenCreateFailed: "토큰을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
    // 페어링 코드(2026-09-16) — 프롬프트에 박히던 raw 토큰을 1회용 코드로 대체.
    pairingCodeFailed: "연결 코드를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
    pairingCodeInvalid:
      "이 연결 코드는 이미 썼거나 시간이 지났어요(코드는 30분 동안, 한 번만 써요). 대시보드의 [프로젝트 추가] 창에서 프롬프트를 다시 복사하면 새 코드가 같이 들어가요.",
    pairingCodeAsToken:
      "이건 액세스 토큰이 아니라 연결 코드예요. 먼저 `npx nookframe@latest login <코드>`를 실행해 주세요 — 코드를 토큰으로 바꿔 저장해요(nookframe 0.1.15 이상. 옛 버전은 코드를 그대로 저장해서 이 호출이 거절됐어요).",
    tokenNotFound: "토큰을 찾을 수 없어요.",
    tokenForbidden: "이 토큰에 대한 권한이 없어요.",
    tokenRevokeFailed: "토큰을 폐기하지 못했어요. 잠시 후 다시 시도해 주세요.",
  },
  // 시연 실패 코드별 카피 — 대시보드 실패 배지 팝오버와 실패 알림 이메일이 같은
  // 표를 읽는다(lib/demo-failure.ts 프로토콜, 이전 DEMO_FAILURE_COPY에서 이관).
  demoFailure: {
    "login-gated": {
      title: "로그인이 필요한 사이트예요",
      body: "지금은 로그인 없이 볼 수 있는 화면만 촬영할 수 있어요. 공개로 접속되는 URL로 바꾼 뒤 다시 시도해 주세요.",
    },
    timeout: {
      title: "촬영이 너무 오래 걸렸어요",
      body: "사이트 로딩이 느리거나 중간에 멈춘 것 같아요. 잠시 후 한 번 더 시도해 주세요.",
    },
    interrupted: {
      title: "촬영이 중간에 끊겼어요",
      body: "녹화 장비가 재시작되면서 작업이 중단됐어요. 다시 시도하면 처음부터 새로 촬영해요.",
    },
    stuck: {
      title: "생성이 오래 걸려 중단됐어요",
      body: "예상보다 오래 걸려 자동으로 멈췄어요. 한 번 더 시도해 주시고, 반복되면 사이트가 정상 접속되는지 확인해 주세요.",
    },
    "build-failed": {
      title: "프로젝트를 빌드하지 못했어요",
      body: "코드를 설치하거나 실행하는 중에 멈췄어요. 로컬에서 npm install · npm run dev가 잘 되는지 확인하거나, 빌드된 결과물(dist 폴더)이나 배포된 URL로 올려주세요.",
    },
    "not-a-webapp": {
      title: "보여줄 웹 화면을 찾지 못했어요",
      body: "웹페이지(HTML)가 없는 것 같아요. 자동 시연은 브라우저에 뜨는 화면을 촬영해요. 웹앱이라면 index.html이 포함됐는지 확인해 주세요. 폰 앱·데스크톱 앱·브라우저 확장이라면 작품을 수정해 화면 녹화 영상을 직접 올려 주세요 — 그 영상으로 바로 보여줘요.",
    },
    blank: {
      title: "화면에 아무것도 나오지 않았어요",
      body: "페이지는 열렸는데 아직 아무것도 그려지지 않았어요. 만들다 만 빈 화면이거나 로딩이 끝나지 않은 것 같아요. 화면에 뭔가 보이는 상태로 다시 올려주세요.",
    },
    policy: {
      title: "콘텐츠 정책에 맞지 않아 게시하지 못했어요",
      body: "검토 결과 이 시연은 Nookframe에 공개하기 어려운 내용이 담겨 있었어요. 내용을 수정한 뒤 다시 시도해 주시고, 잘못된 판단이라고 생각되면 회신으로 알려주세요.",
    },
    declined: {
      title: "촬영 요청이 승인되지 않았어요",
      body: "운영자가 검토한 뒤 이번 촬영은 진행하지 않기로 했어요. 이유는 메일로 보냈어요. 내용을 고친 뒤 다시 요청할 수 있어요.",
    },
    error: {
      title: "촬영 중 문제가 생겼어요",
      body: "일시적인 문제일 수 있어요. 한 번 더 시도해 보고, 반복되면 URL이 브라우저에서 정상 접속되는지 확인해 주세요.",
    },
  },
  // 유저 수신 알림 이메일(완성·실패) — lib/email-templates.ts가 읽는다.
  // 관리자 경보 메일(adminAlertEmail)은 한국어 유지라 여기 없다.
  email: {
    footer: "Nookframe 자동 알림이에요. 궁금한 점은 이 메일에 회신해 주세요.",
    untitledProject: "내 프로젝트",
    readySubject: (title: string) => `시연 영상이 완성됐어요 — ${title}`,
    readyPreheader: (title: string) => `${title} 자동 시연 영상이 방금 완성됐어요.`,
    readyHeading: "시연 영상이 완성됐어요",
    // titleHtml은 이미 escape된 <strong> 조각 — 어순이 언어마다 달라 함수로 받는다.
    readyBody: (titleHtml: string) =>
      `${titleHtml}의 자동 시연 영상이 방금 완성됐어요. 사람 손 없이, 배포된 화면 그대로 촬영됐어요.`,
    readyPosterAlt: (title: string) => `${title} 시연 영상 첫 장면`,
    readyCta: "영상 보러 가기",
    // 공유 안내줄: intro + <a>readyShareLink</a> + outro 로 조립된다.
    readyShareIntro: "링크를 그대로 공유하면 Discord·Slack에서 영상이 바로 재생돼요. mp4 다운로드와 공유 문구는 ",
    readyShareLink: "대시보드의 공유 버튼",
    readyShareOutro: "에 있어요.",
    failedSubject: (title: string) => `시연 영상을 만들지 못했어요 — ${title}`,
    failedBody: (titleHtml: string) => `${titleHtml}의 자동 시연 촬영이 완료되지 못했어요.`,
    failedCta: "대시보드에서 다시 시도",
    failedTechLine: "자세한 기술 정보는 대시보드의 실패 배지를 누르면 볼 수 있어요.",
    // 신고 처리로 작품을 비공개로 내렸을 때 소유자에게 (2026-09-01).
    // 조용히 사라지면 "내 작품이 왜 없어졌지"가 된다 — 이유와 다음 수단을 같이 준다.
    takedownSubject: (title: string) => `작품을 비공개로 전환했어요 — ${title}`,
    takedownBody: (titleHtml: string) => `신고가 접수되어 검토한 결과, ${titleHtml}을(를) 비공개(초안)로 되돌렸어요. 작품과 파일은 그대로 남아 있고 대시보드에서 볼 수 있어요.`,
    takedownReason: (reason: string) => `신고 사유: ${reason}`,
    takedownAppeal: "판단에 이의가 있으면 이 메일에 답장하거나 vivestarter@gmail.com 으로 알려주세요. 다시 검토할게요.",
    takedownCta: "대시보드에서 보기",
    // 관리자가 촬영·재촬영 요청을 거절했을 때 (2026-09-22 R4). 예전엔 아무 소식이 없어
    // 사용자가 같은 요청을 계속 다시 넣었다.
    declinedSubject: (title: string) => `촬영 요청이 승인되지 않았어요 — ${title}`,
    declinedBody: (titleHtml: string) => `${titleHtml}의 촬영 요청을 검토했는데, 이번에는 진행하지 않기로 했어요.`,
    declinedRerecordBody: (titleHtml: string) =>
      `${titleHtml}의 재촬영 요청을 검토했는데, 이번에는 진행하지 않기로 했어요. 지금 공개된 영상은 그대로 남아 있어요.`,
    declinedNote: (note: string) => `운영자 메모: ${note}`,
    declinedNext: "내용을 고친 뒤 대시보드에서 다시 요청할 수 있어요. 궁금한 점은 이 메일에 회신해 주세요.",
    declinedCta: "대시보드에서 보기",
    // 폰 → 컴퓨터 넘기기(2026-09-23). 본인이 폰에서 요청한 메일이라 광고 문구를 섞지 않는다
    // (섞으면 광고 메일로 분류돼 규제가 달라진다). 알림은 동의한 사람에게만 딱 1번.
    handoffSubject: "폰에서 보낸 Nookframe 링크",
    handoffPreheader: "컴퓨터에서 이 메일을 열고 버튼을 누르세요.",
    handoffHeading: "컴퓨터에서 이어서 하세요",
    handoffBody: "Nookframe은 컴퓨터의 AI 도구(Claude Code·Cursor·ChatGPT 같은 것)로 작품을 올려요. 아래 버튼을 누르면 이메일이 채워진 화면이 열리고, 메일로 받은 코드로 들어가면 3분이면 첫 작품까지 올릴 수 있어요.",
    handoffCta: "Nookframe 열기",
    handoffTypeHint: "버튼이 안 되면 브라우저에 nookframe.com 을 직접 쳐도 돼요.",
    handoffNotYou: "요청한 적이 없다면 이 메일은 무시하세요. 더 보내지 않아요.",
    handoffRemindSubject: "어제 폰에서 보낸 Nookframe 링크예요",
    handoffRemindPreheader: "컴퓨터 앞이라면 지금 이어서 할 수 있어요.",
    handoffRemindHeading: "컴퓨터 앞이세요?",
    handoffRemindBody: "어제 폰에서 알림을 요청하셔서 한 번 더 보내요. 버튼을 누르면 이메일이 채워진 화면이 열리고, AI에 한 줄만 붙여넣으면 첫 작품이 올라가요.",
    handoffRemindLast: "알림은 이번이 마지막이에요.",
  },
};

export type Dictionary = typeof ko;

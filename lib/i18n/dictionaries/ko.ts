// 한국어 사전 — 키 구조의 원본. en.ts는 이 타입을 강제받아
// 키가 빠지면 컴파일 에러가 난다. 값에 변수가 필요하면 함수로 쓴다.
// 예: greeting: (name: string) => `${name}님 안녕하세요`

export const ko = {
  common: {
    switchLanguage: "영어로 보기",
  },
  login: {
    noAccount: "계정이 없나요?",
    signupLink: "회원가입",
    welcomeBack: "다시 돌아왔군요",
    welcome: "환영합니다",
    welcomeBackSub: "프레임이 기다리고 있어요.",
    welcomeSub: "새로운 프레임을 만들 차례입니다.",
    googleContinue: "Google로 계속하기",
    or: "또는",
    emailLabel: "이메일",
    passwordLabel: "비밀번호",
    forgotPassword: "비밀번호 찾기",
    showPassword: "비밀번호 표시",
    hidePassword: "비밀번호 숨기기",
    submitting: "로그인 중...",
    submit: "로그인",
    errors: {
      invalid: "이메일 또는 비밀번호가 올바르지 않아요.",
      unconfirmed: "이메일 인증을 먼저 완료해주세요.",
      tooMany: "잠시 후 다시 시도해주세요.",
      captcha: "보안 확인에 실패했어요. 다시 확인 후 시도해주세요.",
      generic: "오류가 발생했어요. 잠시 후 다시 시도해주세요.",
    },
  },
};

export type Dictionary = typeof ko;

# i18n 번역 검수 대장

영문화 작업에서 번역한 **모든 문장·단어의 한↔영 대조표**. 사용자가 번역 앱에서 2차 검수하기 위한 문서다.

- 원본 코드: `lib/i18n/dictionaries/ko.ts`(한국어) · `en.ts`(영어). **사전에 키를 추가/수정하면 이 문서도 같이 갱신할 것.**
- `비고`에 ⚠️가 있으면 단순 직역이 아니라 문장 구조나 표현을 바꾼 것 — 검수 시 특히 볼 것.
- 검수 후 수정할 땐 `en.ts`의 해당 키 값만 고치면 된다 (이 문서도 같이).

## common (공통)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| switchLanguage | 영어로 보기 | 한국어로 보기 | ⚠️ 언어 토글 버튼 라벨. 서로 반대 언어를 가리킴(ko 화면엔 "영어로 보기", en 화면엔 "한국어로 보기") |

## auth (인증 화면 공통)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| googleContinue | Google로 계속하기 | Continue with Google | |
| or | 또는 | or | |
| emailLabel | 이메일 | Email | |
| passwordLabel | 비밀번호 | Password | |
| showPassword | 비밀번호 표시 | Show password | 스크린리더용 |
| hidePassword | 비밀번호 숨기기 | Hide password | 스크린리더용 |
| toLogin | 로그인 페이지로 → | Go to login → | |
| resendPrompt | 메일이 오지 않았거나 이메일을 잘못 입력했나요? | Didn't get the email, or typed it wrong? | |
| reenter | 다시 입력하기 | Try again | ⚠️ 직역(Re-enter) 대신 자연스러운 표현 선택 |
| usernamePattern | 영문, 숫자, _-만 사용 가능해요 | Letters, numbers, _ and - only | |
| errors.captcha | 보안 확인에 실패했어요. 다시 확인 후 시도해주세요. | Security check failed. Please try again. | |
| errors.generic | 오류가 발생했어요. 잠시 후 다시 시도해주세요. | Something went wrong. Please try again shortly. | |
| errors.tooMany | 잠시 후 다시 시도해주세요. | Too many attempts — please try again shortly. | ⚠️ 영어엔 원인(시도 과다)을 덧붙임 |
| errors.invalidEmail | 올바른 이메일 형식을 입력해주세요. | Please enter a valid email address. | |
| errors.passwordTooShort | 비밀번호는 8자 이상이어야 해요. | Password must be at least 8 characters. | |

## login (로그인)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| noAccount | 계정이 없나요? | No account yet? | |
| signupLink | 회원가입 | Sign up | |
| welcomeBack | 다시 돌아왔군요 | Welcome back | |
| welcome | 환영합니다 | Welcome | |
| welcomeBackSub | 프레임이 기다리고 있어요. | Your frame has been waiting. | '프레임'=frame (제품 용어) |
| welcomeSub | 새로운 프레임을 만들 차례입니다. | Time to build your new frame. | |
| forgotPassword | 비밀번호 찾기 | Forgot password? | |
| submitting | 로그인 중... | Signing in... | |
| submit | 로그인 | Sign in | |
| errors.invalid | 이메일 또는 비밀번호가 올바르지 않아요. | Incorrect email or password. | |
| errors.unconfirmed | 이메일 인증을 먼저 완료해주세요. | Please verify your email first. | |

## signup (회원가입)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| haveAccount | 이미 계정이 있나요? | Already have an account? | |
| loginLink | 로그인 | Log in | |
| title | 시작하기 | Get started | |
| subtitle | 무료로 나만의 프레임을 만들어보세요. | Create your own frame for free. | |
| nameLabel | 이름 | Name | |
| namePlaceholder | 홍길동 | Alex Kim | ⚠️ 예시 이름 현지화 |
| usernameLabel | 사용자 이름 | Username | |
| passwordPlaceholder | 8자 이상 | 8+ characters | |
| submitting | 가입 중... | Signing up... | |
| submit | 무료로 시작하기 | Start for free | |
| agreePrefix + termsLink + agreeAnd + privacyLink + agreeSuffix | 가입하면 [이용약관] 및 [개인정보처리방침]에 동의하게 됩니다. | By signing up, you agree to our [Terms of Service] and [Privacy Policy]. | ⚠️ 링크 2개가 끼어서 5조각으로 쪼갠 문장. 조각: "가입하면 "/"이용약관"/" 및 "/"개인정보처리방침"/"에 동의하게 됩니다." ↔ "By signing up, you agree to our "/"Terms of Service"/" and "/"Privacy Policy"/"." |
| checkEmailTitle | 이메일을 확인해주세요 | Check your email | |
| checkEmailBody | 위 주소로 인증 링크를 보냈어요. 메일함을 확인해주세요. | We sent a verification link to this address. Check your inbox. | ⚠️ 원래 한국어("{이메일} 로 인증 링크를 보냈어요")는 주소가 문장 안에 끼는 구조라, 언어별 어순 문제를 피하려고 "주소 표시 → 위 주소로 ~" 구조로 한국어 원문도 바꿈 |
| errors.emailTaken | 이미 사용 중인 이메일이에요. | This email is already in use. | |

## forgotPassword (비밀번호 찾기)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| rememberPrompt | 비밀번호가 기억났나요? | Remembered your password? | |
| loginLink | 로그인 | Log in | |
| title | 비밀번호 찾기 | Forgot password | |
| subtitle | 가입한 이메일로 재설정 링크를 보내드릴게요. | We'll send a reset link to your signup email. | |
| submitting | 보내는 중... | Sending... | |
| submit | 재설정 링크 보내기 | Send reset link | |
| sentTitle | 메일을 확인해주세요 | Check your email | |
| sentBody | 위 주소로 비밀번호 재설정 링크를 보냈어요. | We sent a password reset link to this address. | ⚠️ signup.checkEmailBody와 같은 구조 변경 |

## resetPassword (새 비밀번호 설정)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| checking | 확인 중... | Checking... | |
| invalidTitle | 링크가 만료되었어요 | Link expired | |
| invalidBody1 | 재설정 링크가 유효하지 않거나 만료되었어요. | This reset link is invalid or has expired. | |
| invalidBody2 | 다시 요청해주세요. | Please request a new one. | |
| requestAgain | 재설정 링크 다시 받기 → | Get a new reset link → | |
| doneTitle | 비밀번호가 변경됐어요 | Password updated | |
| doneBody | 잠시 후 홈으로 이동합니다. | Taking you home in a moment. | |
| title | 새 비밀번호 설정 | Set a new password | |
| subtitle | 앞으로 사용할 비밀번호를 입력해주세요. | Enter the password you'll use from now on. | |
| newPasswordLabel | 새 비밀번호 | New password | |
| confirmLabel | 비밀번호 확인 | Confirm password | |
| confirmPlaceholder | 다시 입력해주세요 | Enter it again | |
| submitting | 변경 중... | Updating... | |
| submit | 비밀번호 변경 | Update password | |
| errors.mismatch | 비밀번호가 일치하지 않아요. | Passwords don't match. | |
| errors.samePassword | 기존 비밀번호와 달라야 해요. | New password must be different from the old one. | |
| errors.sessionExpired | 세션이 만료됐어요. 링크를 다시 요청해주세요. | Session expired. Please request a new link. | |

## onboarding (온보딩)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| stepSignup | 가입 | Sign up | 단계 표시 점 라벨 |
| stepProfile | 프로필 | Profile | |
| stepStart | 시작 | Start | |
| title | 프레임을 만들어볼게요 | Let's build your frame | |
| subtitle | 기본 정보를 입력해주세요. 나중에 언제든 바꿀 수 있어요. | Fill in the basics. You can change everything later. | |
| nameLabel | 이름 | Name | |
| usernameLabel | 사용자 이름 (URL) | Username (URL) | |
| bioLabel | 한 줄 소개 (선택) | One-line bio (optional) | |
| bioPlaceholder | 바이브코딩으로 아이디어를 현실로 만들고 있어요. | Turning ideas into reality with vibe coding. | '바이브코딩'=vibe coding |
| usernameAvailable | ✓ 사용 가능한 username이에요 | ✓ This username is available | |
| usernameTaken | ✗ 이미 사용 중이에요 | ✗ Already taken | |
| usernameInvalid | ✗ 영문, 숫자, _, -만 사용 가능해요 (2자 이상) | ✗ Letters, numbers, _ and - only (2+ characters) | |
| usernameReserved | ✗ 사용할 수 없는 이름이에요 | ✗ This name can't be used | |
| submitting | 저장 중... | Saving... | |
| submit | 시작하기 → | Get started → | |
| otherAccount | 다른 계정으로 로그인 | Sign in with a different account | |
| errors.usernameTaken | 이미 사용 중인 username이에요. 다른 걸 입력해주세요. | This username is already taken. Please pick another. | |
| errors.usernameInvalid | username은 영문, 숫자, _, -만 사용 가능하고 2자 이상이어야 해요. | Usernames can only use letters, numbers, _ and -, and must be at least 2 characters long. | |
| errors.usernameReserved | 사용할 수 없는 username이에요. 다른 걸 입력해주세요. | This username can't be used. Please pick another. | |
| errors.saveAuth | 저장 중 오류가 발생했어요. 다시 시도해주세요. | Something went wrong while saving. Please try again. | |
| errors.saveProfile | 프로필 저장 중 오류가 발생했어요. 다시 시도해주세요. | Something went wrong while saving your profile. Please try again. | |

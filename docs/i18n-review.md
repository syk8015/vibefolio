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

## contentTypes (콘텐츠 유형 라벨)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| web-app | 웹 앱 | Web app | |
| saas | SaaS | SaaS | |
| mobile | 모바일 앱 | Mobile app | |
| game | 게임 | Game | |
| extension | 크롬 익스텐션 | Chrome extension | |
| ai-service | AI 서비스 | AI service | |
| media | 미디어 콘텐츠 | Media content | |
| other | 기타 | Other | |

## dashboard (대시보드 뼈대)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| logout | 로그아웃 | Log out | |
| welcomeTitle | 프레임이 준비됐어요 | Your frame is ready | |
| welcomeBody | 이제 작품을 추가해서 프레임을 채워볼게요. | Now let's add your work and fill the frame. | |
| welcomeCta | 첫 작품 추가하기 → | Add your first project → | |
| welcomeClose | 환영 배너 닫기 | Dismiss welcome banner | 스크린리더용 |
| copyAddress | 프레임 주소 복사 | Copy frame address | 툴팁 |
| copied | 복사됨 ✓ | Copied ✓ | |
| viewFrame | 내 프레임 보기 | View my frame | |
| tabProjects | 작품 | Works | 탭 라벨. 검수 반영: 가산명사 Works로 수정(theater의 "{N} works"와 일관) |
| tabCard | 명함 | Card | |
| tabVisits | 방문 | Visits | |
| errorTitle | 대시보드를 불러오지 못했어요 | Couldn't load the dashboard | |
| errorBody | 대시보드를 표시하는 중 문제가 생겼어요. 다시 시도하거나 홈으로 돌아가 주세요. | Something went wrong while displaying the dashboard. Please retry or go back home. | |

## projects (작품 탭 + 행/배지/메뉴)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| pendingReview | 검토 대기 {n} | {n} awaiting review | ⚠️ 숫자 위치가 언어별로 다름(함수) |
| addProject | 프로젝트 추가 | Add project | |
| emptyTitle | 아직 프로젝트가 없어요 | No projects yet | |
| emptyBody | 위 버튼으로 첫 프로젝트를 추가해보세요 | Use the button above to add your first one | |
| connectTitle | AI로 한 줄에 올리기 | Publish in one line with AI | |
| connectSubtitle | 클로드코드·커서·챗봇을 연결하면, 그 작업을 만든 AI가 여기에 초안으로 올려줘요 | Connect Claude Code, Cursor, or a chatbot — the AI that built the work will post it here as a draft | 검수 반영: 미래 동작이라 will post로 수정 |
| addTitle | 새 프로젝트 추가 | Add a new project | |
| editTitle | 프로젝트 수정 | Edit project | |
| submitAdd | 추가하기 | Add | |
| submitSave | 저장하기 | Save | |
| deleteConfirm | 이 프로젝트를 삭제할까요? | Delete this project? | |
| orderSaveFailed | 순서 저장에 실패했어요. 잠시 후 다시 시도해 주세요. | Couldn't save the new order. Please try again shortly. | |
| deleteFailed | 프로젝트 삭제에 실패했어요. 잠시 후 다시 시도해 주세요. | Couldn't delete the project. Please try again shortly. | |
| demoStartFailed | 자동 시연 생성을 시작하지 못했어요. 프로젝트는 저장됐어요 — 카드에서 다시 시도할 수 있어요. | Couldn't start the auto demo. Your project is saved — you can retry from its card. | |
| demoRequestFailed | 자동 시연 요청이 전송되지 않았어요. 프로젝트는 저장됐어요 — 카드에서 다시 시도할 수 있어요. | The auto demo request didn't go through. Your project is saved — you can retry from its card. | |
| heldNotice | 관리자 승인 대기로 전환했어요. | Moved to the admin approval queue. | |
| rerecordFailed | 재촬영 요청 실패 | Re-record request failed | |
| publishFailed | 공개에 실패했어요. 잠시 후 다시 시도해 주세요. | Couldn't publish. Please try again shortly. | |
| publishedDemoStartFailed | 공개됐지만 자동 시연 생성을 시작하지 못했어요 — 카드에서 다시 시도할 수 있어요. | Published, but couldn't start the auto demo — you can retry from its card. | |
| publishedDemoRequestFailed | 공개됐지만 자동 시연 요청이 전송되지 않았어요 — 카드에서 다시 시도할 수 있어요. | Published, but the auto demo request didn't go through — you can retry from its card. | |
| rerecordSent | 재촬영 요청을 보냈어요. 관리자 승인 후 다시 촬영돼요. | Re-record request sent. It'll be re-shot after admin approval. | |
| phasePending | 촬영 대기 | Queued to film | |
| phaseBuilding | 앱 준비 중 | Preparing app | |
| phaseRecording | 촬영 중 | Filming | |
| phaseEditing | 편집 중 | Editing | |
| usualTime | 보통 1–3분 | usually 1–3 min | "촬영 중 · 보통 1–3분" 꼴로 붙음 |
| demoFailed | 시연 영상 실패 | Demo video failed | |
| retryBtn | 다시 시도 | Try again | |
| techInfo | 기술 정보 | Technical details | |
| heldModerationTip | 게시 전에 확인이 필요하다고 표시돼 잠시 보류 중이에요. 검토가 끝나면 자동으로 게시되고, 보통 하루 안에 처리돼요. | Flagged for a quick check before going live. It publishes automatically once cleared — usually within a day. | 툴팁 |
| heldQuotaTip | 하루 자동 시연 한도를 넘어 승인 대기 중이에요. 보통 24시간 안에 처리되고, 그동안은 이미지로 표시돼요. | Past the daily auto-demo limit, so it's waiting for approval. Usually done within 24 hours; an image shows meanwhile. | 툴팁 |
| heldModerationLabel | 게시 전 확인 중 | In pre-publish review | |
| heldQuotaLabel | 승인 대기 · 이미지 표시 | Awaiting approval · image shown | |
| pausedTip | 촬영 요청이 접수됐어요. 순서대로 촬영되고, 끝나면 메일로 알려드릴게요. | Your filming request is in. We film in order and email you when it's done. | 툴팁 |
| pausedLabel | 촬영 대기 중 | Waiting to film | |
| slowTip | 창을 닫으셔도 돼요 — 촬영이 끝나면 메일로 알려드릴게요. | Feel free to close this window — we'll email you when filming is done. | 툴팁 |
| slowLabel | 예상보다 오래 걸려요 | Taking longer than expected | |
| more | 더 보기 | More | ⋯ 메뉴 툴팁 |
| draftBadge | AI 초안 | AI draft | |
| untitled | 제목 없음 | Untitled | |
| publishing | 공개 중… | Publishing… | |
| confirmPublish | 확인하고 공개 | Review & publish | |
| menuOpen | 작품 열기 ↗ | Open work ↗ | |
| menuEdit | 수정 | Edit | |
| menuDelete | 삭제 | Delete | |
| featuredSet | 대표로 설정 | Set as featured | |
| featuredUnset | 대표 해제 | Remove featured | |
| featuredBadge | ★ 대표 | ★ Featured | |
| moveUp | 위로 이동 | Move up | |
| moveDown | 아래로 이동 | Move down | |
| rerecordRequest | 재촬영 요청 | Request re-record | |
| retryShoot | 촬영 다시 시도 | Retry filming | |
| makeDemo | 시연 영상 만들기 | Create demo video | |

## projectForm (프로젝트 추가/수정 폼)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| hintLabel | 핵심 기능 소개 | Key features | |
| optionalSuffix | (선택) | (optional) | |
| hintPlaceholder | 예: 캔버스에 마우스로 자유롭게 그림을 그릴 수 있어요. 상단에서 브러시 색과 굵기를 바꿔보세요. | e.g. You can draw freely on the canvas with your mouse. Try changing the brush color and size at the top. | |
| hintHelp | 자동 시연 영상이 이 설명을 보고 핵심 기능부터 보여드려요. | The auto demo video reads this and shows your key features first. | |
| videoTooLarge | 영상은 20MB 이하만 업로드할 수 있어요. (현재 {mb}MB) | Videos must be 20MB or less. (Currently {mb}MB) | 함수 |
| videoUnreadable | 영상 파일을 읽을 수 없어요. | Couldn't read the video file. | |
| videoTooLong | 영상은 30초 이하만 업로드할 수 있어요. (현재 {s}초) | Videos must be 30 seconds or less. (Currently {s}s) | 함수 |
| uploadFailed | 업로드 실패: {msg} | Upload failed: {msg} | 함수 |
| zipFailed | zip 압축해제 실패: {msg} | Couldn't extract the zip: {msg} | 함수 |
| zipUnreadable | zip 파일을 읽을 수 없어요. | Couldn't read the zip file. | |
| tooLarge | 총 파일 크기가 25MB를 초과해요. (현재 {mb}MB) | Total file size exceeds 25MB. (Currently {mb}MB) | 함수 |
| noHtml | 웹페이지(HTML) 파일이 없어요. 자동 시연은 브라우저에 뜨는 화면을 촬영해요 — index.html이 포함됐는지 확인해 주세요. | No web page (HTML) file found. The auto demo films what shows up in a browser — make sure index.html is included. | |
| saveFailed | 저장 중 오류가 발생했어요. | Something went wrong while saving. | |
| urlOptionTitle | URL 링크 | URL link | |
| urlOptionDesc | 이미 어딘가에 배포된 사이트가 있어요 | My site is already deployed somewhere | |
| filesOptionTitle | 파일 업로드 | File upload | |
| filesOptionDesc | 직접 만든 HTML·CSS·JS 파일을 올릴게요 | I'll upload my HTML·CSS·JS files | |
| cancel | 취소 | Cancel | |
| pickFiles | 파일 선택 | Choose files | |
| pickFolder | 폴더 선택 | Choose folder | |
| wizardGuide1~4 | React/Vue/Vite는 [npm run build] 후 생성된 [dist/] 폴더를 올려주세요. 순수 HTML/CSS/JS는 그대로, [.zip]도 가능. 최대 25MB | For React/Vue/Vite, run [npm run build] and upload the generated [dist/] folder. Plain HTML/CSS/JS files work as-is; [.zip] is fine too. Max 25MB | ⚠️ 코드 조각 3개가 끼어 4조각으로 분할된 문장. 검수 반영: files work로 수일치 수정 |
| uploading | 업로드 중… | Uploading… | |
| uploadDone | 업로드 완료 | Upload complete | |
| titlePlaceholder | 프로젝트 이름 | Project name | |
| descPlaceholder | 어떤 프로젝트인지 소개해주세요. | Tell us what this project is about. | |
| contentTypeLabel | 콘텐츠 유형 | Content type | |
| aiToolsLabel | 사용한 AI 도구 | AI tools used | |
| multiSelect | (복수 선택) | (multi-select) | |
| collapse | 접기 ↑ | Collapse ↑ | |
| showMore | 더보기 +{n} | More +{n} | 함수 |
| videoLabel | 구동 영상 | Video clip | ⚠️ '시연 영상'(auto demo)과 구분하려고 clip 사용 |
| videoConnected | 영상 연결됨 | Video attached | |
| remove | 제거 | Remove | |
| modeFile | 파일 업로드 | Upload file | |
| modeUrl | URL | URL | |
| videoPick | 영상 파일 선택 | Choose a video file | |
| videoLimits | 20MB · 30초 이하 | Max 20MB · 30s | |
| videoUrlPlaceholderWizard | https://youtube.com/... 또는 https://vimeo.com/... | https://youtube.com/... or https://vimeo.com/... | |
| videoUrlPlaceholder | https://youtube.com/watch?v=... 또는 https://vimeo.com/... | https://youtube.com/watch?v=... or https://vimeo.com/... | |
| thumbAutoTitle | 자동 | Automatic | |
| thumbAutoDesc | OG 이미지나 업로드한 파일에서 자동으로 만들어드려요 | We'll generate one from your OG image or uploaded files | |
| thumbManualTitle | 수동 업로드 | Manual upload | |
| thumbManualDesc | 이미지 파일을 직접 올릴게요 | I'll upload an image myself | |
| dropOrClick | 클릭하거나 이미지를 드래그해서 업로드 | Click or drag an image to upload | |
| removeReupload | 제거하고 다시 올리기 | Remove and re-upload | |
| prev | ← 이전 | ← Back | |
| skip | 건너뛰기 | Skip | |
| next | 다음 → | Next → | |
| saving | 저장 중… | Saving… | |
| closeAria | 닫기 | Close | 스크린리더용 |
| existingUpload | 업로드된 사이트가 연결돼 있어요 — 새로 올리면 교체돼요. | An uploaded site is attached — uploading again replaces it. | |
| editGuideTitle + editGuide1~3 | React / Vue / Vite 프로젝트라면 소스 폴더 대신 [npm run build] 후 생성된 [dist/] 폴더를 올려주세요. 순수 HTML/CSS/JS 파일은 그대로 올려도 돼요. | For React / Vue / Vite projects, skip the source folder — run [npm run build] and upload the generated [dist/] folder. Plain HTML/CSS/JS files can go up as-is. | ⚠️ 코드 조각 분할 문장 |
| dropHelpEdit | HTML, CSS, JS, 이미지 파일 지원 · 최대 25MB · 드래그해서 올려도 돼요 | HTML, CSS, JS, and image files · max 25MB · drag & drop works too | |
| uploadDoneEdit | 업로드 완료. 아래 정보를 입력하고 저장하세요. | Upload complete. Fill in the details below and save. | |
| demoUrlLabel | 데모 URL | Demo URL | |
| hintLabelEdit | 핵심 기능 소개 (자동 시연용 · 선택) | Key features (for the auto demo · optional) | |
| videoLabelOptional | 구동 영상 (선택) | Video clip (optional) | |
| videoAutoplayHelp | 대표 작품으로 설정하면 프레임 상단에서 자동 재생돼요. | If this is your featured work, it autoplays at the top of your frame. | |
| videoPickInline | + 영상 파일 선택 (20MB · 30초 이하) | + Choose a video file (max 20MB · 30s) | |
| nameLabel | 프로젝트 이름 | Project name | |
| yearLabel | 제작 연도 | Year | |
| descLabel | 설명 | Description | |
| thumbLabel | 썸네일 | Thumbnail | |
| thumbAutoNote | (없으면 저장 시 자동 생성) | (auto-generated on save if empty) | |
| thumbTypeLabel | 썸네일 유형 | Thumbnail type | |
| typeImage | 🖼️ 이미지 | 🖼️ Image | |
| typeVideo | 🎬 영상 | 🎬 Video | |
| commentLabel | 한 마디 (말풍선에 표시) | One-liner (shown in a speech bubble) | |
| commentPlaceholder | 제가 제일 아끼는 작업물이에요! ⭐ | This one's my favorite piece! ⭐ | |

## card (명함 탭)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| imageTooLarge | 이미지는 5MB 이하만 업로드할 수 있어요. | Images must be 5MB or less. | |
| avatarUploadFailed | 이미지 업로드에 실패했어요. 잠시 후 다시 시도해주세요. | Image upload failed. Please try again shortly. | |
| deleteFailed | 탈퇴 처리에 실패했어요. | Couldn't delete your account. | |
| avatarLabel | 프로필 이미지 | Profile image | |
| avatarNote | (모바일 명함·공유 카드에 쓰여요) | (used on the mobile card & share cards) | |
| changeImage | 이미지 변경 | Change image | |
| uploadImage | 이미지 업로드 | Upload image | |
| avatarFormats | JPG · PNG · GIF · 최대 5MB | JPG · PNG · GIF · max 5MB | |
| avatarPendingNote | 저장하기를 누르면 반영돼요 | Applies when you hit Save | |
| nameLabel | 표시 이름 | Display name | |
| usernameLabel | 사용자 이름 | Username | |
| bioLabel | 한 줄 소개 | One-line bio | |
| socialLabel | 소셜 링크 | Social links | |
| removeLink | 링크 삭제 | Remove link | 스크린리더용 |
| unrecognizedLink | 아직 인식되지 않는 주소예요 — 명함에는 Instagram · X · GitHub · LinkedIn · YouTube · TikTok · Facebook · Threads 링크만 표시돼요. | This address isn't recognized yet — only Instagram · X · GitHub · LinkedIn · YouTube · TikTok · Facebook · Threads links show on the card. | |
| addLink | 링크 추가 | Add link | |
| save | 저장하기 | Save | |
| saving | 저장 중… | Saving… | |
| savedMsg | 저장됐어요 | Saved | |
| accountLabel | 계정 | Account | |
| deleteTitle / deleteBtn | 회원 탈퇴 | Delete account | |
| deleteBody1 + Strong + 2 | 프로필과 모든 작품·업로드한 파일이 [즉시·영구 삭제]되며, 되돌릴 수 없어요. | Your profile and all work & uploaded files are [deleted immediately and permanently] — this cannot be undone. | ⚠️ 굵은 글씨가 끼어 3조각 분할 |
| deleteModalTitle | 정말 탈퇴하시겠어요? | Really delete your account? | |
| deleteModalBody | {@유저명}의 프로필과 모든 프로젝트·업로드 파일이 즉시·영구 삭제돼요. 이 작업은 되돌릴 수 없어요. | {@username}'s profile and every project & uploaded file will be deleted immediately and permanently. This cannot be undone. | ⚠️ 유저명 뒤에 붙는 조각 |
| confirmPrefix + Suffix | 확인을 위해 {유저명} 를 입력해주세요 | To confirm, type {username} below | ⚠️ 어순 재배치 |
| cancel | 취소 | Cancel | |
| deleting | 탈퇴 중… | Deleting… | |
| deleteForever | 영구 삭제 | Delete forever | |

## visits (방문 탭)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| justNow | 방금 전 | just now | |
| minsAgo | {n}분 전 | {n}m ago | 함수 |
| hoursAgo | {n}시간 전 | {n}h ago | 함수 |
| daysAgo | {n}일 전 | {n}d ago | 함수 |
| today | 오늘 | Today | |
| last7 | 최근 7일 | Last 7 days | |
| last30 | 최근 30일 | Last 30 days | |
| total | 전체 조회 | All-time views | |
| chartTitle | 최근 14일 방문 추이 | Visits, last 14 days | |
| cappedPrefix | 최근 500회 기준 · | Latest 500 visits · | |
| dailyMax | 일 최고 {n}회 | daily peak {n} | 함수 |
| noData | 아직 방문 데이터가 없어요 | No visit data yet | |
| referrers | 유입 경로 | Traffic sources | |
| countries | 방문 국가 | Visitor countries | |
| history | 방문 기록 | Visit log | |
| capped | 최근 500회 기준 | Latest 500 visits | |
| noHistory | 아직 방문 기록이 없어요 | No visits yet | |
| groupWeek | 어제 ~ 7일 전 | Yesterday – 7 days ago | |
| groupMonth | 8 ~ 30일 전 | 8 – 30 days ago | |
| groupOlder | 30일 이전 | Older than 30 days | |
| barTooltip | {월/일} — {n}회 | {월/일} — {n} views | 함수 |
| countryNames | 한국·미국·일본·중국·영국·독일·프랑스·캐나다·호주·싱가포르·인도·브라질·대만·홍콩·태국·베트남·필리핀·인도네시아·말레이시아·네덜란드 | South Korea · United States · Japan · China · United Kingdom · Germany · France · Canada · Australia · Singapore · India · Brazil · Taiwan · Hong Kong · Thailand · Vietnam · Philippines · Indonesia · Malaysia · Netherlands | 국가 코드 20종 순서 그대로 |
| sourceLabels | 카카오톡 / 인스타그램 / 페이스북 / 라인 / 네이버 앱 / 다음 앱 / X 앱 / 카카오 / 네이버 / 유튜브 / (구글 로그인 리턴) / 구글 검색 / 공유 링크(앱 미상) / 직접/알 수 없음 | KakaoTalk / Instagram / Facebook / LINE / Naver app / Daum app / X app / Kakao / Naver / YouTube / (Google sign-in return) / Google Search / Share link (unknown app) / Direct / unknown | ⚠️ 유입 분류기(admin과 공유)는 한국어 고정 — 표시할 때만 이 표로 번역 |

## connect (AI 연결 패널)

2026-08-14 요청5(토큰 발급 화면 단일화)로 전면 개편 — 발급 UI 삭제, [프롬프트 복사]가 토큰 자동 발급·내장.
삭제된 키: copy, copied, step1Title, step1Body, revealNote, terminalOnce, savedClose, tokenNamePlaceholder, issuing, issue, step2Title, noShell3.
2026-08-14 축약 개편(사용자 피드백 "글자가 너무 많다") — 소개 문단·카드 제목·발급 설명문 삭제, 한 줄 단계 안내 + 프롬프트/토큰 접기.
추가 삭제된 키: intro1, intro2, promptTitle, promptBody, tokensTitle, loading, noTokens. 신설: steps, previewToggle, tokensToggle.

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| steps | 프롬프트 복사 → 내 AI 대화창에 붙여넣기 → 초안이 여기 도착 → 확인 후 공개 | Copy the prompt → paste it into your AI chat → a draft lands here → review & publish | 옛 intro/promptBody 대체 한 줄 |
| copyPrompt | 프롬프트 복사 | Copy prompt | |
| copying | 토큰 발급·복사 중… | Issuing token & copying… | |
| copiedNote | 복사 완료 ✓ AI 대화창에 붙여넣으면 끝이에요. 다시 복사하면 이전 토큰은 자동 폐기돼요. | Copied ✓ Paste it into your AI chat and you're done. Copying again auto-revokes the previous token. | 축약판 |
| copyFailed | 클립보드 복사에 실패했어요. 한 번 더 눌러주세요. | Couldn't copy to the clipboard. Please press it once more. | |
| issueFailed | 토큰 발급에 실패했어요. | Couldn't issue the token. | |
| networkFailed | 네트워크 오류로 발급하지 못했어요. | A network error prevented issuing. | |
| previewToggle | 프롬프트 미리보기 | Preview the prompt | 접기 토글 |
| revokeConfirm | 이 토큰을 폐기할까요? 이 토큰을 쓰는 AI 연결이 즉시 끊겨요. | Revoke this token? Any AI connection using it stops immediately. | |
| revokeFailed | 폐기에 실패했어요. 잠시 후 다시 시도해 주세요. | Couldn't revoke. Please try again shortly. | |
| noShell1~2 | 셸이 없는 AI(챗봇)라면 — AI가 뱉은 JSON을 {링크} 에 붙여넣으면 돼요. | If your AI has no shell (a chatbot) — paste the JSON it produces at {link}. | ⚠️ 링크가 끼어 2조각 분할, 프롬프트 접기 안에서만 노출 |
| tokensToggle | 발급된 토큰 {n}개 | {n} issued token(s) | 함수 · 접기 토글, 0개면 미노출 |
| unnamed | 이름 없음 | Unnamed | |
| autoTokenName | 프롬프트 자동발급 | Auto-issued with prompt | name 센티널 `prompt-auto`의 표시 라벨 |
| lastUsed | 최근 사용 {날짜} | Last used {날짜} | 함수 |
| neverUsed | 사용 전 | Not used yet | |
| revoke | 폐기 | Revoke | |

## share (공유 팝오버)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| share | 공유 | Share | 툴팁 |
| copiedFlash | 복사됨! | Copied! | |
| copyWatch | watch 링크 복사 | Copy watch link | |
| copyX | X 공유문구 복사 | Copy X post | |
| downloadMp4 | mp4 다운로드 | Download mp4 | |

## rerecord (재촬영 요청 모달)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| title | 재촬영 요청 | Request a re-record | |
| body | 시연 영상은 프로젝트당 한 편이에요. 무엇을 어떻게 바꾸고 싶은지 적어주시면 관리자가 확인한 뒤 다시 촬영해 드려요. | Each project gets one demo video. Tell us what you'd like changed and an admin will review and re-shoot it. | |
| emptyReason | 바꾸고 싶은 점을 적어주세요. | Please describe what you'd like changed. | |
| requestFailed | 요청에 실패했어요. | The request failed. | |
| placeholder | 예: 첫 화면 로딩이 길게 잡혔어요. 로그인 후 대시보드 화면 위주로 보여주세요. | e.g. The first screen's loading ran long. Please focus on the dashboard after login. | |
| cancel | 취소 | Cancel | |
| sending | 보내는 중… | Sending… | |
| send | 요청 보내기 | Send request | |

## publish (/publish — AI JSON 붙여넣기 페이지)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| backToDashboard | ← 대시보드 | ← Dashboard | |
| title | AI가 준 걸 붙여넣기 | Paste what your AI gave you | |
| intro | 셸이 없는 AI(챗봇)를 쓰고 있나요? AI에게 publish 페이로드를 만들어 달라고 한 뒤, 그 JSON을 여기 붙여넣으면 초안으로 올라가요. | Using an AI without a shell (a chatbot)? Ask it to build a publish payload, then paste that JSON here and it goes up as a draft. | |
| promptHintBefore + Link + After | 붙여넣을 프롬프트는 [대시보드 → 연결] 탭에 있어요. | The prompt to paste is in the [Dashboard → Connect] tab. | ⚠️ 링크가 끼어 3조각 분할 |
| submitting | 올리는 중… | Uploading… | |
| submit | 초안으로 올리기 | Upload as draft | |
| reviewNote | 공개 전에 대시보드에서 확인할 수 있어요 | You can review it on the dashboard before it goes public | |
| errors.empty | AI가 준 JSON을 붙여넣어 주세요. | Paste the JSON your AI gave you. | |
| errors.urlOnly | URL만으로는 부족해요 — 제목·설명이 담긴 JSON을 붙여넣어 주세요. | A URL alone isn't enough — paste the JSON with a title and description. | |
| errors.invalidJson | JSON을 읽을 수 없어요. AI가 준 { ... } 형식 그대로 붙여넣어 주세요. | Couldn't read that JSON. Paste the { ... } exactly as your AI gave it. | |
| errors.submitFailed | 올리지 못했어요. 잠시 후 다시 시도해 주세요. | Couldn't upload. Please try again shortly. | |
| errors.network | 네트워크 오류로 올리지 못했어요. | A network error kept it from uploading. | |

## common 추가분 (공통)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| terms | 이용약관 | Terms | 푸터 링크 |
| privacy | 개인정보처리방침 | Privacy | 푸터 링크 |
| contact | 문의 | Contact | 푸터 링크 |
| ok | 확인 | OK | |

## theater (/@username 명함 페이지)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| editFrame | 프레임 수정 | Edit frame | 오너 pill |
| myFrame | 내 프레임 | My frame | 로그인 방문자 pill |
| login | 로그인 | Log in | |
| emptyTitle | 아직 공개된 프로젝트가 없어요 | No public projects yet | |
| emptyBody | 곧 새로운 작업물이 올라올 예정이에요. | New work is coming soon. | |
| screenings | 상영 목록 · {N} works | Screenings · {N} works | 함수 |
| aboutLabel | 명함 · About | About | 검수 반영: Card 단독은 결제카드 오해 소지 → About만 사용 |
| upNextLabel | 상영 목록 · Up Next | Up Next | ⚠️ 영어판은 병기 접기 |
| prevWork | 이전 작품 | Previous work | aria |
| nextWork | 다음 작품 | Next work | aria |
| makerNote | 만든이 메모 | Maker's note | |
| ctaFullscreen | 전체화면으로 체험 | Try it fullscreen | |
| ctaFullscreenShort | 전체화면 체험 | Try fullscreen | 모바일 |
| ctaVisit | 체험하러 가기 | Try it live | |
| errorTitle | 프레임을 불러오지 못했어요 | Couldn't load this frame | |
| errorBody | 이 페이지를 표시하는 중 문제가 생겼어요. 다시 시도하거나 홈으로 돌아가 주세요. | Something went wrong while showing this page. Try again or head home. | |
| copyLink | 링크 복사 | Copy link | |
| viewMobile | 모바일 화면으로 보기 | View mobile layout | aria |
| viewDesktop | PC 화면으로 보기 | View desktop layout | aria |
| embedLoginAria | 로그인 안내 | Login notice | aria |
| embedLoginTitle | 로그인은 모바일에서 진행해주세요 | Please log in on your phone | |
| embedLoginBody | 모바일 미리보기에서는 로그인을 할 수 없어요. 실제 모바일 기기에서 로그인해 주세요. | You can't log in from this mobile preview. Please log in on a real mobile device. | |

## errorState (공용 에러 화면 + 404)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| eyebrow | 문제가 발생했어요 | Something went wrong | |
| retry | 다시 시도 | Try again | |
| home | 홈으로 | Home | |
| errorCode | 오류 코드 | Error code | |
| rootTitle | 페이지를 불러오지 못했어요 | Couldn't load the page | |
| rootBody | 잠시 문제가 생겼어요. 다시 시도하거나 홈으로 돌아가 주세요. | Something went wrong for a moment. Try again or head home. | |
| notFoundEyebrow | 404 · 페이지 없음 | 404 · Not found | |
| notFoundTitle | 페이지를 찾을 수 없어요 | We can't find that page | |
| notFoundBody | 주소가 바뀌었거나 사라진 페이지일 수 있어요. 홈으로 돌아가 시작해 주세요. | The address may have changed or the page may be gone. Head home to start over. | |

## api (서버 API 에러 응답 — 3단계)

라우트가 쿠키 언어(getT)로 고른다. admin 전용 라우트는 한국어 유지라 사전 밖. PAT(Bearer) 인제스트는 AI/기계 호출자라 en 고정.

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| loginRequired | 로그인이 필요해요. | Please log in. | |
| retryLater | 잠시 후 다시 시도해 주세요. | Please try again in a moment. | |
| projectNotFound | 프로젝트를 찾을 수 없어요. | Project not found. | |
| projectForbidden | 이 프로젝트에 대한 권한이 없어요. | You don't have permission for this project. | |
| demoStatusFailed | 시연 상태를 불러오지 못했어요. | Couldn't load the demo status. | |
| rerecordReasonRequired | 무엇을 어떻게 바꾸고 싶은지 적어주세요. | Tell us what you'd like changed and how. | |
| rerecordInFlight | 지금 시연 영상을 만드는 중이에요. 끝난 뒤에 요청해 주세요. | A demo video is being made right now. Please ask again once it's done. | |
| rerecordSaveFailed | 요청을 저장하지 못했어요. 잠시 후 다시 시도해 주세요. | Couldn't save the request. Please try again in a moment. | |
| unsupportedSource | 자동 시연을 만들 수 없는 소스예요. | This source can't be turned into an auto demo. | |
| contentHost | {host}는 자동 시연으로 촬영하는 '내 작품' 주소가 아니에요. 영상 링크라면 '구동 영상' 칸에 넣어주세요. | {host} isn't a "my work" address the auto demo can film. If it's a video link, put it in the "Video clip" field instead. | 함수(host). '구동 영상'=projectForm videoLabel(Video clip)과 용어 일치 |
| contentHostShort | {host}는 자동 시연으로 촬영하는 '내 작품' 주소가 아니에요. | {host} isn't a "my work" address the auto demo can film. | 함수(host), 인제스트용 축약 |
| privateHost | localhost나 내부 주소는 촬영할 수 없어요. 공개로 접속되는 배포 URL로 올려주세요. | We can't film localhost or private addresses. Please use a publicly reachable deployed URL. | |
| privateHostShort | localhost·내부 주소는 안 돼요. 공개로 접속되는 배포 URL로 올려주세요. | localhost and private addresses won't work. Please use a publicly reachable deployed URL. | 인제스트용 축약 |
| notPublicUrl | 공개 인터넷에서 접속되는 주소가 아니에요. 배포된 공개 URL로 올려주세요. | That address isn't reachable from the public internet. Please use a deployed public URL. | |
| demoUpdateFailed | 데모 상태를 업데이트하지 못했어요. 잠시 후 다시 시도해 주세요. | Couldn't update the demo status. Please try again in a moment. | |
| alreadyHasDemo | 이미 시연 영상이 있어요. 다시 만들려면 '재촬영 요청'으로 바꾸고 싶은 점을 알려주세요. | This project already has a demo video. To make a new one, use "Request re-record" and tell us what to change. | '재촬영 요청'=projects rerecordRequest(Request re-record)와 용어 일치 |
| attemptLimit | 자동 생성 재시도 한도를 다 썼어요. '재촬영 요청'으로 관리자 승인을 받아주세요. | You've used up the auto-generation retries. Use "Request re-record" to get admin approval. | |
| demoStartFailed | 자동 시연을 시작할 수 없어요. | Couldn't start the auto demo. | |
| heldGlobal | 오늘 자동 시연 생성이 많아 잠시 대기열에 넣었어요. 관리자 확인 후 생성돼요. | Lots of demos are being made today, so yours is briefly queued. It'll be created after an admin check. | ⚠️ 의역 |
| heldUser | 하루 자동 시연 한도를 넘어 관리자 승인 대기로 전환했어요. 승인 전까지는 이미지로 표시돼요. | You've passed the daily auto-demo limit, so this is waiting for admin approval. It shows as an image until then. | |
| tokenInvalid | 토큰이 유효하지 않거나 폐기됐어요. | This token is invalid or has been revoked. | |
| loginOrTokenRequired | 로그인이 필요해요. (토큰 또는 세션) | Authentication required (token or session). | ⚠️ 구조 변경 |
| tooManyRequests | 요청이 너무 많아요. 잠시 후 다시 시도해 주세요. | Too many requests. Please try again later. | |
| uploadTooLarge | 업로드가 너무 커요 (최대 25MB). | The upload is too large (max 25MB). | |
| payloadPartRequired | payload(JSON) 파트가 필요해요. | A payload (JSON) part is required. | |
| payloadJsonInvalid | payload JSON을 읽을 수 없어요. | Couldn't parse the payload JSON. | |
| jsonBodyInvalid | JSON 본문을 읽을 수 없어요. | Couldn't parse the JSON body. | |
| titleRequired | title이 필요해요. | title is required. | |
| draftLimit | 검토 대기 중인 초안이 너무 많아요 (최대 {max}개). 대시보드에서 먼저 공개하거나 정리해 주세요. | Too many drafts are waiting for review (max {max}). Publish or clean some up on your dashboard first. | 함수(max) |
| artifactRequired | deployUrl(또는 appUrl) 또는 파일 번들(bundle)이 필요해요. | Either deployUrl (or appUrl) or a file bundle is required. | appUrl 커밋(fe932cb) 문구 기준 |
| badUrl | 임베드·시연할 수 있는 URL이 아니에요. | This URL can't be embedded or filmed for a demo. | |
| projectCreateFailed | 프로젝트를 만들지 못했어요. | Couldn't create the project. | |
| indexHtmlMissing | index.html이 없어요. 자동 시연은 브라우저에 뜨는 화면을 촬영해요 — 정적 사이트 번들에 index.html을 포함해 주세요. | No index.html found. Auto demos film what shows up in a browser — include index.html in your static site bundle. | |
| badFilePath | 잘못된 파일 경로가 감지됐어요. | An invalid file path was detected. | |
| fileUploadFailed | 파일 업로드 실패: {detail} | File upload failed: {detail} | 함수(detail) |
| demoUrlSaveFailed | 데모 URL 저장에 실패했어요. | Couldn't save the demo URL. | |
| uploadProcessingError | 업로드 처리 중 오류가 났어요. | Something went wrong while processing the upload. | |
| zipBomb | 압축 해제 크기가 한도를 초과했어요 (zip bomb 의심). | The decompressed size exceeds the limit (possible zip bomb). | |
| zipReadError | zip 해제 중 오류가 났어요. | Something went wrong while extracting the zip. | |
| zipEmpty | 빈 zip이에요. | The zip is empty. | |
| zipTooManyFiles | 파일이 너무 많아요 (최대 {max}개). | Too many files (max {max}). | 함수(max) |
| zipNoValidFiles | 업로드할 유효한 파일이 없어요. | No valid files to upload. | |
| badReport | 잘못된 신고 요청이에요. | Invalid report request. | |
| reportRateLimited | 신고가 너무 잦아요. 잠시 후 다시 시도해 주세요. | Too many reports. Please try again later. | |
| targetNotFound | 대상을 찾을 수 없어요. | Target not found. | |
| reportSaveFailed | 신고를 저장하지 못했어요. 잠시 후 다시 시도해 주세요. | Couldn't save the report. Please try again in a moment. | |
| accountDeleteFailed | 탈퇴 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요. | Something went wrong while deleting the account. Please try again in a moment. | |
| tokenLimit | 토큰은 최대 {max}개까지 만들 수 있어요. 안 쓰는 토큰을 폐기해 주세요. | You can have up to {max} tokens. Revoke one you're not using first. | 함수(max) |
| tokenCreateFailed | 토큰을 만들지 못했어요. 잠시 후 다시 시도해 주세요. | Couldn't create the token. Please try again in a moment. | |
| tokenNotFound | 토큰을 찾을 수 없어요. | Token not found. | |
| tokenForbidden | 이 토큰에 대한 권한이 없어요. | You don't have permission for this token. | |
| tokenRevokeFailed | 토큰을 폐기하지 못했어요. 잠시 후 다시 시도해 주세요. | Couldn't revoke the token. Please try again in a moment. | |

## demoFailure (시연 실패 코드별 카피 — 대시보드 팝오버 + 실패 메일 공유)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| login-gated.title | 로그인이 필요한 사이트예요 | This site requires a login | |
| login-gated.body | 지금은 로그인 없이 볼 수 있는 화면만 촬영할 수 있어요. 공개로 접속되는 URL로 바꾼 뒤 다시 시도해 주세요. | Right now we can only film screens that open without logging in. Switch to a publicly accessible URL and try again. | |
| timeout.title | 촬영이 너무 오래 걸렸어요 | The shoot took too long | |
| timeout.body | 사이트 로딩이 느리거나 중간에 멈춘 것 같아요. 잠시 후 한 번 더 시도해 주세요. | The site seems to load slowly or got stuck along the way. Please try once more in a bit. | |
| interrupted.title | 촬영이 중간에 끊겼어요 | The shoot was interrupted | |
| interrupted.body | 녹화 장비가 재시작되면서 작업이 중단됐어요. 다시 시도하면 처음부터 새로 촬영해요. | The recording rig restarted mid-job. Trying again starts a fresh shoot from the beginning. | |
| stuck.title | 생성이 오래 걸려 중단됐어요 | Stopped because it ran too long | |
| stuck.body | 예상보다 오래 걸려 자동으로 멈췄어요. 한 번 더 시도해 주시고, 반복되면 사이트가 정상 접속되는지 확인해 주세요. | It took longer than expected, so we stopped it automatically. Try once more, and if it keeps happening, check that your site loads normally. | |
| build-failed.title | 프로젝트를 빌드하지 못했어요 | We couldn't build the project | |
| build-failed.body | 코드를 설치하거나 실행하는 중에 멈췄어요. 로컬에서 npm install · npm run dev가 잘 되는지 확인하거나, 빌드된 결과물(dist 폴더)이나 배포된 URL로 올려주세요. | Something stopped while installing or running the code. Check that npm install · npm run dev work locally, or upload the built output (dist folder) or a deployed URL instead. | |
| not-a-webapp.title | 보여줄 웹 화면을 찾지 못했어요 | We couldn't find a web screen to show | |
| not-a-webapp.body | 웹페이지(HTML)가 없는 것 같아요. 자동 시연은 브라우저에 뜨는 화면을 촬영해요. 웹앱이라면 index.html이 포함됐는지, 백엔드·CLI 프로젝트라면 시연 촬영 대상이 아닌지 확인해 주세요. | There doesn't seem to be a web page (HTML). Auto demos film what shows up in a browser. For a web app, check that index.html is included; backend or CLI projects may not be filmable. | ⚠️ 마지막 절 의역 |
| blank.title | 화면에 아무것도 나오지 않았어요 | Nothing showed up on screen | |
| blank.body | 페이지는 열렸는데 아직 아무것도 그려지지 않았어요. 만들다 만 빈 화면이거나 로딩이 끝나지 않은 것 같아요. 화면에 뭔가 보이는 상태로 다시 올려주세요. | The page opened but nothing was drawn yet. It may be a blank work-in-progress screen, or still loading. Please upload it in a state where something is visible. | |
| policy.title | 콘텐츠 정책에 맞지 않아 게시하지 못했어요 | We couldn't publish this due to content policy | |
| policy.body | 검토 결과 이 시연은 Nookframe에 공개하기 어려운 내용이 담겨 있었어요. 내용을 수정한 뒤 다시 시도해 주시고, 잘못된 판단이라고 생각되면 회신으로 알려주세요. | On review, this demo contained content we can't publish on Nookframe. Please revise it and try again — and if you think this was a mistake, let us know by replying. | |
| error.title | 촬영 중 문제가 생겼어요 | Something went wrong during the shoot | |
| error.body | 일시적인 문제일 수 있어요. 한 번 더 시도해 보고, 반복되면 URL이 브라우저에서 정상 접속되는지 확인해 주세요. | It may be a temporary issue. Try once more, and if it keeps failing, check that the URL opens normally in a browser. | |

## email (유저 수신 알림 메일 — 완성·실패)

수신자 언어는 profiles.locale(토글 시 저장, 기본 ko). 관리자 경보 메일은 한국어 유지라 사전 밖.

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| footer | Nookframe 자동 알림이에요. 궁금한 점은 이 메일에 회신해 주세요. | This is an automated Nookframe notification. Questions? Just reply to this email. | ⚠️ 의역 |
| untitledProject | 내 프로젝트 | My project | 제목 없는 프로젝트 폴백 |
| readySubject | 시연 영상이 완성됐어요 — {title} | Your demo video is ready — {title} | 함수(title) |
| readyPreheader | {title} 자동 시연 영상이 방금 완성됐어요. | The auto demo video for {title} just finished. | 함수(title), 받은편지함 미리보기 줄 |
| readyHeading | 시연 영상이 완성됐어요 | Your demo video is ready | |
| readyBody | {title}의 자동 시연 영상이 방금 완성됐어요. 사람 손 없이, 배포된 화면 그대로 촬영됐어요. | The auto demo video for {title} just finished — filmed straight from your deployed screen, no human hands involved. | ⚠️ 구조 변경(함수, 어순) |
| readyPosterAlt | {title} 시연 영상 첫 장면 | Opening frame of the {title} demo video | 함수(title), 이미지 alt |
| readyCta | 영상 보러 가기 | Watch the video | 버튼 |
| readyShareIntro | 링크를 그대로 공유하면 Discord·Slack에서 영상이 바로 재생돼요. mp4 다운로드와 공유 문구는␣ | Share the link as-is and the video plays right inside Discord or Slack. The mp4 download and ready-made captions live in␣ | intro+링크+outro로 조립, 끝 공백 유지 |
| readyShareLink | 대시보드의 공유 버튼 | the share button on your dashboard | 링크 텍스트 |
| readyShareOutro | 에 있어요. | . | ⚠️ 어순상 en은 마침표만 |
| failedSubject | 시연 영상을 만들지 못했어요 — {title} | We couldn't make your demo video — {title} | 함수(title) |
| failedBody | {title}의 자동 시연 촬영이 완료되지 못했어요. | The auto demo shoot for {title} couldn't be completed. | 함수(title) |
| failedCta | 대시보드에서 다시 시도 | Try again from the dashboard | 버튼 |
| failedTechLine | 자세한 기술 정보는 대시보드의 실패 배지를 누르면 볼 수 있어요. | For technical details, click the failure badge on your dashboard. | |

### 사전 밖 이중 카피 (components/ReportButton.tsx)
신고 모달은 사전이 아니라 컴포넌트 안 COPY 상수에 ko/en이 이미 들어 있음(watch 페이지 공유). 토글을 따라가되 watch에서는 en 고정. 검수 시 이 파일도 볼 것.

## authEmail (Supabase 인증메일 2종 — 사전 밖, docs/auth-emails/*.html)

사전이 아니라 Supabase 대시보드 수동 템플릿. 언어는 user_metadata.locale로 템플릿 안에서 분기(`{{ if eq (printf "%v" .Data.locale) "en" }}`), locale 없으면 ko 폴백. 수정 시 repo 파일 고치고 대시보드 재붙여넣기.

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| confirm.subject | 메일 주소만 확인하면 가입이 끝나요 | Confirm your email to finish signing up | 제목 필드 |
| confirm.heading | 메일 주소만 확인하면 끝나요 | One click and you're in | ⚠️ 의역 |
| confirm.body | 아래 버튼을 누르면 가입이 완료돼요. 본인이 요청한 게 아니라면 이 메일은 무시해도 돼요. | Press the button below and your signup is complete. If this wasn't you, feel free to ignore this email. | |
| confirm.cta | 이메일 인증하기 | Verify email | 버튼 |
| confirm.footer | Nookframe 가입 인증 메일이에요. 궁금한 점은 이 메일에 회신해 주세요. | This is the Nookframe signup confirmation email. Questions? Just reply to this email. | |
| reset.subject | 비밀번호를 다시 설정할게요 | Let's reset your password | 제목 필드 |
| reset.heading | 비밀번호를 다시 설정할게요 | Let's set a new password | ⚠️ 제목과 차별화 |
| reset.body | 아래 버튼에서 새 비밀번호를 정할 수 있어요. 요청한 적이 없다면 이 메일은 무시해 주세요 — 계정은 그대로 안전해요. | The button below takes you to a page where you can choose a new password. If you didn't request this, just ignore this email — your account is safe. | ⚠️ 구조 변경 |
| reset.cta | 비밀번호 재설정 | Reset password | 버튼 |
| reset.footer | Nookframe 비밀번호 재설정 메일이에요. 궁금한 점은 이 메일에 회신해 주세요. | This is the Nookframe password reset email. Questions? Just reply to this email. | |
| (공통) linkFallback | 버튼이 열리지 않으면 이 링크를 브라우저에 붙여넣어 주세요. | If the button doesn't open, paste this link into your browser. | 두 템플릿 공통 |

## landing (랜딩 / — 4단계, 2026-08-14)

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| landing.login | 로그인 | Log in | 나브 |
| landing.getStarted | 시작하기 | Get started | 나브 |
| landing.greetingBefore/After | 안녕하세요, {이름}님! | Welcome back, {이름}! | ⚠️ 구조 변경 |
| landing.viewMyFrame | 내 프레임 보기 | View my frame | |
| landing.editFrame | 프레임 수정 | Edit frame | |

### 사전 밖 이중 카피 (랜딩 감성 카피 — 재창작, 사용자 1차 번역 2026-08-14 반영)
- `lib/taglines.ts` → `taglinesEn` (69개): 비로그인 히어로 회전 풀. 종결부호 없음, {N} 유지, "sum = all" 원문 유지
- `lib/loggedInTaglines.ts` → `loggedInTaglinesEn` (60개): 로그인 헤드라인 풀. 럭키비키→Task failed successfully, 영역전개→Domain Expansion, 썸녀/여친→situationship/commit to, 기도 메타→Thoughts & Prayers™
- `components/FaqRepliesSection.tsx` → `FAQ_EN` (4쌍)
- `components/PortfolioPipSection.tsx` → `TITLE_VARIANTS_EN` (5개) + 시연 힌트 2종 + 어트리뷰션
- `lib/identityLine.ts` → `I mostly build {복수형 라벨}` (+`and` 결합), 라벨 복수형 별도 맵(CONTENT_TYPE_LABELS_EN)

## legal (privacy/terms — 4단계 잔여, 2026-08-14)

사전 밖 — 법률 문서라 키로 쪼개지 않고 페이지 안에서 한/영 본문(JSX)을 통째로 분기.
원본 코드: `app/privacy/page.tsx` · `app/terms/page.tsx` (각각 `KoBody`/`EnBody`).
검수는 실서버 육안 대조 권장: nookframe.com/privacy · /terms (토글로 한↔영 전환).

- 제목: 개인정보처리방침 → Privacy Policy · 이용약관 → Terms of Service
- 조 표기: 제N조 (…) → Article N (…) — 구조 1:1 대응, 조/항 순서 동일
- 시행일: 2026년 7월 26일 → Effective date: July 26, 2026
- 영문판 말미에 고지 추가: "This English version is provided for convenience. … the Korean version prevails." (한국법 준거 서비스의 표준 안전장치 — 한국어판에는 없음) ⚠️
- 준거법·관할(terms 제9조): laws/courts of the Republic of Korea 유지
- 푸터 링크: 이용약관/개인정보처리방침 → Terms of Service / Privacy Policy

## 5단계 잔존 스윕 추가분 (2026-08-14)

grep 게이트에서 잡힌 유저 노출 한글 잔존 수리분.

| 키 | 한국어 | English | 비고 |
|---|---|---|---|
| common.switchToDark | 다크 모드로 전환 | Switch to dark mode | ThemeToggle aria-label |
| common.switchToLight | 라이트 모드로 전환 | Switch to light mode | ThemeToggle aria-label |
| landing.settings | 설정 | Settings | 랜딩 프로필 메뉴 |
| (재사용) dashboard.logout | 로그아웃 | Log out | 랜딩 프로필 메뉴가 기존 키 재사용 |
| auth.turnstileFailed | 보안 확인을 불러오지 못했어요. | Couldn't load the security check. | Turnstile 로드 실패 |
| auth.turnstileFixPrefix | 광고 차단을 끄거나 | Turn off your ad blocker or | ⚠️ [다시 시도] 버튼과 조립되는 문장 조각 |
| auth.turnstileRetry | 다시 시도 | try again | 버튼 |
| auth.turnstileFixSuffix | 해 주세요. | . | ⚠️ 버튼 뒤에 붙는 조각 (영어는 마침표만) |
| theater.mobilePreview | 모바일 미리보기 | Mobile preview | ViewportFrame iframe title(접근성) |

### 사전 밖
- `lib/connectSnippets.ts` `pastePrompt(origin, locale)` — "AI에 붙여넣기" 프롬프트 전문 영어판 추가(구조 1:1, 번역 아닌 동일 지시 재작성). ConnectPanel이 locale 전달
- `app/global-error.tsx` — 루트 크래시 화면. LocaleProvider 밖이라 자체 COPY 상수(ko/en)+NEXT_LOCALE 쿠키 직접 감지

### 의도적 잔존(번역 안 함) — 확인 완료
- 관리자 경보 메일·admin API 라우트·cron(report/trigger-demo/request-rerecord의 sendEmail 본문, REASON_LABEL 포함) = admin 한국어 유지 정책
- lib/traffic-source·projectTaxonomy 원본 라벨 = 표시 시점에 사전 매핑으로 번역
- upload-safety UploadError 한국어 기본 메시지 = code로 locale 재매핑됨(서버 폴백)
- 메타데이터·OG(루트 description, 인증 페이지 title, /publish title, [username] og fallback) = 6덩어리 ⑥, 정적 페이지·크롤러는 쿠키가 없어 별도 결정 필요(미착수)

## 탭 제목 (⑥ 메타데이터 절충안 — 2026-08-14, ②안 사용자 확정)

정적 페이지 탭 제목은 마운트 후 클라이언트에서 바꿔치기(`components/LocalizedTitle.tsx`, 사전 밖 props).
SNS/검색 로봇은 JS를 안 돌려 OG·크롤러 노출 문구(루트 description 등)는 ko 유지 — ③ /en 경로는 보류 결정 그대로.

| 페이지 | 한국어 | English | 비고 |
|---|---|---|---|
| /login | 로그인 \| Nookframe | Log in \| Nookframe | LocalizedTitle |
| /signup | 회원가입 \| Nookframe | Sign up \| Nookframe | LocalizedTitle |
| /forgot-password | 비밀번호 찾기 \| Nookframe | Forgot password \| Nookframe | LocalizedTitle |
| /reset-password | 비밀번호 재설정 \| Nookframe | Reset password \| Nookframe | LocalizedTitle |
| /publish | AI 초안 붙여넣기 · Nookframe | Paste your AI draft · Nookframe | 동적 페이지라 generateMetadata 서버 분기 |

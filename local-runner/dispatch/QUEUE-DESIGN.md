# DB 큐 설계 — 자동 시간표를 대신하는 실행 방식

> 2026-09-21. **설계만 적는다. 표를 만들지도, 마이그레이션을 돌리지도 않았다.**
> 지금 도는 것은 여전히 파일 큐(`~/Dispatch/queue/*.json`)다.

## 왜 바꾸나

지금까지 반복 잡은 **04~06시 창** 안에서만 시작했다(`gate.run_window`). 판정 자체는 옳다 —
Vive는 20~01시 피크라 그 시각이 진짜 유휴고, 06시 넘어 시작하면 5시간 창이 낮 피크까지 물린다.

문제는 시간표가 **맥이 깨어 있다고 가정한다**는 것이다. 덮개를 닫고 자면 04시에 아무 일도 안 일어나고,
그 회차는 그냥 사라진다. 그리고 Vive가 지금 당장 시키고 싶을 때 쓸 통로가 CLI뿐이다.

촬영 워커는 이 문제를 이미 다르게 풀었다 — **큐에 넣어두면 맥이 깨어날 때 집어간다.**
Dispatch도 같은 구조로 간다(2026-09-20 결정, 사용자 제안).

## 모양

```
관제탑(/admin) / 폰 버튼     ──┐
                              ├──► dispatch_jobs (Supabase)  ──►  맥의 dispatchd
CLI `dispatch add`          ──┘        상태 기계                     20초 폴링
```

시간표는 사라지고, **게이트는 그대로 남는다.** 언제 돌지는 큐가 정하고,
"지금 돌려도 되나"는 한도 게이트가 계속 정한다. 둘은 다른 질문이다.

## 표 (제안 — 아직 만들지 않았다)

`dispatch_jobs`

| 칸 | 타입 | 뜻 |
|---|---|---|
| `id` | uuid | 기본키 |
| `type` | text | `research` \| `site-monitor` \| `code-review` (CHECK로 묶는다) |
| `prompt` | text | 잡 본문 |
| `model` | text | null이면 기본 모델 |
| `status` | text | `pending` \| `claimed` \| `running` \| `done` \| `failed` \| `deferred` |
| `not_before` | timestamptz | 게이트 보류가 쓰는 칸. 이 시각 전엔 집어가지 않는다 |
| `claimed_by` | text | 맥 식별자. 러너가 둘이 되는 날을 위한 자리 |
| `claimed_at` | timestamptz | 이게 오래됐는데 `running`이면 죽은 것 → 회수 |
| `result` | jsonb | `{ ok, minutes, num_turns, outs[] }` |
| `created_at` / `finished_at` | timestamptz | |

`dispatch_artifacts` — **산출물이 여러 개라는 걸 표에서도 인정한다.**
파일 큐 시절 이걸 인정 안 해서 `REPORT.md` 하나만 꺼내는 버그가 났다(2026-09-20).

| 칸 | 타입 | 뜻 |
|---|---|---|
| `id` | uuid | |
| `job_id` | uuid | → `dispatch_jobs.id` |
| `rel_path` | text | 워크스페이스 기준 상대경로 (`REPORT.md`, `cards/01.html`) |
| `is_primary` | bool | `REPORT.md` 한 장만 true |
| `bytes` | int | |
| `storage_key` | text | 큰 파일은 본문 대신 오브젝트 스토리지 키 |
| `body` | text | 작은 텍스트는 그대로 |

## 집어가기 (경쟁 조건)

러너가 하나뿐이어도 **원자적으로 집는다.** 나중에 둘이 되는 날 조용히 깨지지 않게.

```sql
-- 개념 스케치. 실행하지 말 것.
update dispatch_jobs set status = 'claimed', claimed_by = $1, claimed_at = now()
where id = (
  select id from dispatch_jobs
  where status = 'pending' and (not_before is null or not_before <= now())
  order by created_at
  for update skip locked
  limit 1
)
returning *;
```

`claimed_at`이 30분 넘게 `claimed`/`running`인 잡은 pending으로 되돌린다
(지금 파일 큐의 `recover()`가 죽은 pid로 하는 일과 같다).

## 권한

`dispatch_jobs`는 **Vive 본인만** 읽고 쓴다. 잡을 넣는 통로는 관제탑(`/admin`)이고 `requireAdmin` 라우트로 넣는다.

🔴 **러너는 관리자 권한 열쇠를 갖지 않는다**(2026-09-24 정정 — 처음 안은 키체인에서 읽는 것이었다).
맥엔 `WORKER_SECRET` 하나만 두고 서비스롤·R2·RESEND 키는 서버에만 두는 게 워커 호스트 보안의 불변식이다(서버 중계).
→ 집기·끝내기는 `/api/worker/dispatch/{claim,finish}`(`requireWorker`)로 서버에 부탁하고, 표는 서비스롤 전용으로 둔다.
전체 구상은 `docs/promo-publish.md` §4.1.

## 옮기는 순서

1. 표 2개 생성 (이때 처음으로 마이그레이션을 돈다 — `pending_migrations.md`에 올린다)
2. `src/queue.js` 뒤에 DB 구현을 하나 더 붙인다. 파일 큐는 지우지 않는다 —
   맥이 인터넷 없이도 돌 수 있는 유일한 길이다. `DISPATCH_QUEUE=db|file`로 고른다
3. 한 주 둘 다 돌려 결과를 대조한 뒤 기본값을 `db`로 바꾼다
4. `gate.run_window.applies_to`는 계속 비워둔다

## 남는 것

- 맥이 며칠 자면 큐가 쌓인다. 깨어날 때 **몇 개까지** 몰아 돌릴지는 아직 안 정했다.
  하루 예산 게이트가 어차피 막긴 하지만, 그러면 "보류" 푸시만 여러 발 간다.
- 폰에서 잡을 넣는 화면은 허브 PWA 대신 nookframe 관제탑(`/admin`, 폰 대응됨)으로 구상 중이다(2026-09-24 사용자 요청, `docs/promo-publish.md` §4.1).

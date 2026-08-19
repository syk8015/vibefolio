"use client";

import { useEffect } from "react";

// 같은 브라우저의 반복 새로고침을 한 번으로 눌러주는 창. 방문자 식별자를 새로
// 만들지 않고 localStorage 타임스탬프만 쓴다 — 완화가 목적이지 정밀 UV가 아니다.
const DEDUP_MS = 30 * 60_000;

// 오너 본인 방문 제외는 **서버가** 판단해 아예 이 컴포넌트를 렌더하지 않는다.
// 예전에는 여기서 supabase-js로 getSession()을 불렀는데, 그 한 줄 때문에
// 공개 명함 페이지 번들에 supabase 청크(전송 55KB)가 통째로 실렸다.
// 서버는 같은 쿠키를 이미 getUser()로 검증해 읽으므로 판정이 더 정확하다.
export default function ViewTracker({ username }: { username: string }) {
  useEffect(() => {
    try {
      const key = `vf-viewed:${username}`;
      const last = Number(localStorage.getItem(key) ?? 0);
      if (Date.now() - last < DEDUP_MS) return;
      localStorage.setItem(key, String(Date.now()));
    } catch {
      /* 프라이빗 모드 등 스토리지 불가 → 그냥 기록 */
    }

    fetch("/api/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, referrer: document.referrer }),
    }).catch(() => {});
  }, [username]);

  return null;
}

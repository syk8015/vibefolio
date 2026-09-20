// Claude Code 자격증명 읽기 + 필요 시 토큰 갱신.
//
// 2026-09-20 변경: 갱신한 토큰을 예전처럼 `~/.dispatch/token-cache.json`(0700 폴더의
// 평문 파일)에 쓰지 않고 **맥 키체인**에 넣는다. 저장소를 nookframe 쪽으로 통일한 것이고
// (`scripts/_secrets.mjs`가 쓰는 바로 그 키체인. 구현은 둘 다 `scripts/_keychain.mjs`),
// 백업·실수 커밋·디스크 이미지로 평문이 새 나가는 경로가 하나 줄어든다.
// Claude Code 본체의 자격증명 항목은 여전히 건드리지 않는다 — 별도 이름으로 저장한다.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readKeychain, writeKeychain } from '../../../scripts/_keychain.mjs';

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'; // Claude Code 공개 OAuth client_id
const TOKEN_URL = 'https://console.anthropic.com/v1/oauth/token';
const CACHE_SERVICE = process.env.DISPATCH_TOKEN_SERVICE || 'nookframe-dispatch-token-cache';

export function readKeychainCreds() {
  let raw = null;
  try {
    raw = execFileSync('security', ['find-generic-password', '-s', 'Claude Code-credentials', '-w'], {
      encoding: 'utf8',
      timeout: 15000,
    }).trim();
  } catch {
    const file = path.join(os.homedir(), '.claude', '.credentials.json');
    if (fs.existsSync(file)) raw = fs.readFileSync(file, 'utf8');
  }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    const o = parsed.claudeAiOauth || parsed;
    if (!o.accessToken) return null;
    return { accessToken: o.accessToken, refreshToken: o.refreshToken, expiresAt: o.expiresAt || 0 };
  } catch {
    return null;
  }
}

function readCache() {
  const raw = readKeychain(CACHE_SERVICE);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(next) {
  // 키체인에 못 쓰면(잠김·취소) 그냥 넘어간다 — 다음 실행에서 다시 갱신하면 된다.
  // 실패했다고 평문 파일로 흘리지 않는다. 그게 이 변경의 요점이다.
  writeKeychain(CACHE_SERVICE, JSON.stringify(next));
}

async function refresh(creds) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: creds.refreshToken, client_id: CLIENT_ID }),
  });
  const json = await res.json().catch(() => null);
  if (res.status !== 200 || !json?.access_token) throw new Error(`토큰 갱신 실패 (HTTP ${res.status})`);
  const next = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || creds.refreshToken,
    expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
  };
  writeCache(next);
  return next;
}

// 유효한 access token 확보: Keychain(Claude Code 본체) → 캐시 중 더 신선한 것, 만료 임박 시 갱신
export async function getAccessToken() {
  const kc = readKeychainCreds();
  const cache = readCache();
  let creds = kc;
  if (cache && (!kc || (cache.expiresAt || 0) > (kc.expiresAt || 0))) creds = { ...kc, ...cache };
  if (!creds) throw new Error('NO_CREDS: claude 로그인 상태를 확인하세요');
  if (creds.expiresAt && Date.now() > creds.expiresAt - 5 * 60 * 1000 && creds.refreshToken) {
    try {
      creds = await refresh(creds);
    } catch {
      /* 기존 토큰으로 시도 */
    }
  }
  return creds.accessToken;
}

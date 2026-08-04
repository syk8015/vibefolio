// SSRF 가드: 사용자가 준 URL을 서버가 직접 fetch하기 전에 목적지가 공개
// 인터넷 호스트인지 검증한다. 방어가 여러 겹인 이유 —
//   1. 사전 검증(assertSafePublicUrl): hostname을 직접 DNS resolve해서 모든
//      IP를 사설/예약 대역과 대조. literal IP·10진수/hex IP 표기도 getaddrinfo가
//      정규화해 주므로 함께 차단된다.
//   2. 수동 리다이렉트(safeFetch): undici가 리다이렉트를 알아서 따라가면 hop
//      대상이 내부 IP여도 새지 못하게 redirect:"manual"로 매 홉 #1을 재검증.
//   3. connect 훅(ssrfAgent): hostname 기반 호스트의 DNS 리바인딩(검증과 연결
//      사이에 응답이 바뀌는 TOCTOU)을 실제 연결 직전 한 번 더 막는다.
//
// undici를 직접 import해 fetch를 쓰는 이유: redirect:"manual"의 동작이
// Node 내장 undici 버전마다 달라서(opaqueredirect로 막히기도 함), package에
// 핀된 undici의 fetch를 써야 환경과 무관하게 Location 헤더를 읽을 수 있다.
import { fetch as undiciFetch, Agent, type RequestInit, type Response } from "undici";
import { lookup as dnsLookup, type LookupOptions, type LookupAddress } from "node:dns";
import { lookup as dnsLookupAsync } from "node:dns/promises";

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

// ── IP 파싱 + CIDR 매칭 (v4/v6 모두 바이트 배열로 환원) ──

function ipv4ToBytes(ip: string): number[] | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const n = Number(p);
    if (n > 255) return null;
    bytes.push(n);
  }
  return bytes;
}

function ipv6ToBytes(ip: string): number[] | null {
  let s = ip.split("%")[0]; // zone id(%eth0 등) 제거
  // 끝에 박힌 IPv4(예: ::ffff:127.0.0.1)는 16진수 두 그룹으로 환산.
  const v4 = s.match(/^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (v4) {
    const b = ipv4ToBytes(v4[2]);
    if (!b) return null;
    const hex =
      ((b[0] << 8) | b[1]).toString(16) + ":" + ((b[2] << 8) | b[3]).toString(16);
    s = v4[1] + hex;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parseGroups = (str: string): number[] | null => {
    if (str === "") return [];
    const out: number[] = [];
    for (const g of str.split(":")) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      out.push(parseInt(g, 16));
    }
    return out;
  };
  const head = parseGroups(halves[0]);
  const tail = halves.length === 2 ? parseGroups(halves[1]) : [];
  if (head === null || tail === null) return null;
  let groups: number[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 0) return null;
    groups = [...head, ...Array(fill).fill(0), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) bytes.push((g >> 8) & 0xff, g & 0xff);
  return bytes;
}

function inCidr(bytes: number[], cidr: string): boolean {
  const [range, bitsStr] = cidr.split("/");
  const bits = Number(bitsStr);
  const rangeBytes = range.includes(":") ? ipv6ToBytes(range) : ipv4ToBytes(range);
  if (!rangeBytes || rangeBytes.length !== bytes.length) return false;
  let remaining = bits;
  for (let i = 0; i < bytes.length; i++) {
    if (remaining <= 0) break;
    const take = Math.min(8, remaining);
    const mask = (0xff << (8 - take)) & 0xff;
    if ((bytes[i] & mask) !== (rangeBytes[i] & mask)) return false;
    remaining -= 8;
  }
  return true;
}

// 사설/예약/특수목적 대역. 공개 인터넷 외 목적지는 전부 막는다.
const BLOCKED_V4 = [
  "0.0.0.0/8", // "this" network (0.0.0.0 포함)
  "10.0.0.0/8", // 사설
  "100.64.0.0/10", // CGNAT
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local (169.254.169.254 클라우드 메타데이터 포함)
  "172.16.0.0/12", // 사설
  "192.0.0.0/24", // IETF 프로토콜 할당
  "192.0.2.0/24", // TEST-NET-1
  "192.88.99.0/24", // 6to4 relay anycast
  "192.168.0.0/16", // 사설
  "198.18.0.0/15", // 벤치마킹
  "198.51.100.0/24", // TEST-NET-2
  "203.0.113.0/24", // TEST-NET-3
  "224.0.0.0/4", // 멀티캐스트
  "240.0.0.0/4", // 예약 (255.255.255.255 포함)
];

const BLOCKED_V6 = [
  "::1/128", // loopback
  "::/128", // unspecified
  "100::/64", // discard-only
  "fc00::/7", // ULA (사설)
  "fe80::/10", // link-local
  "ff00::/8", // 멀티캐스트
];

// IPv4가 박혀 있는 v6 표현 — 마지막 4바이트를 IPv4로 떼어 재검사한다.
const V6_EMBEDDED_V4 = [
  "::ffff:0:0/96", // IPv4-mapped
  "64:ff9b::/96", // NAT64
  "::/96", // 폐기된 IPv4-compatible
];

// export: local-runner/netguard.ts가 녹화 브라우저의 요청 차단에 같은 대역
// 정의를 쓴다 — 서버 fetch 가드와 브라우저 가드가 어긋나지 않게 단일 소스 유지.
export function isBlockedIp(address: string, family: number): boolean {
  if (family === 4) {
    const b = ipv4ToBytes(address);
    if (!b) return true; // 파싱 불가 → 안전하게 차단
    return BLOCKED_V4.some((c) => inCidr(b, c));
  }
  const b = ipv6ToBytes(address);
  if (!b) return true;
  if (V6_EMBEDDED_V4.some((c) => inCidr(b, c))) {
    const v4 = b.slice(12);
    return BLOCKED_V4.some((c) => inCidr(v4, c));
  }
  return BLOCKED_V6.some((c) => inCidr(b, c));
}

// ── 사전 검증: 프로토콜 + 모든 resolved IP 검사 ──

export async function assertSafePublicUrl(rawUrl: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError("invalid url");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfError(`disallowed protocol: ${parsed.protocol}`);
  }
  // URL.hostname은 IPv6를 대괄호째 반환([::1]) — getaddrinfo에 넘기려면 벗겨야 한다.
  const host = parsed.hostname.replace(/^\[/, "").replace(/\]$/, "");
  if (!host) throw new SsrfError("missing host");

  let results: { address: string; family: number }[];
  try {
    results = await dnsLookupAsync(host, { all: true });
  } catch {
    throw new SsrfError(`dns resolution failed: ${host}`);
  }
  if (!results.length) throw new SsrfError(`no addresses: ${host}`);
  for (const { address, family } of results) {
    if (isBlockedIp(address, family)) {
      throw new SsrfError(`blocked address: ${host} -> ${address}`);
    }
  }
  return parsed;
}

// ── connect 훅: 실제 연결 직전 resolved IP 재검증 (DNS 리바인딩 방어) ──
// 주의: undici는 literal IP 호스트에는 lookup을 호출하지 않으므로(직접 연결)
// 이 훅만으로는 불충분하다. literal/숫자 IP는 위 사전 검증이 잡는다.
function guardedLookup(
  hostname: string,
  options: LookupOptions,
  callback: (
    err: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
): void {
  dnsLookup(hostname, options, (err, address, family) => {
    if (err) return callback(err, address, family);
    const list = Array.isArray(address)
      ? address
      : [{ address, family }];
    for (const e of list) {
      if (isBlockedIp(e.address, e.family)) {
        return callback(new SsrfError(`blocked address: ${hostname} -> ${e.address}`), address, family);
      }
    }
    callback(null, address, family);
  });
}

const ssrfAgent = new Agent({
  connect: { lookup: guardedLookup, timeout: 8000 },
});

// ── 안전한 fetch: 매 홉 사전 검증 + 수동 리다이렉트 ──
export async function safeFetch(
  rawUrl: string,
  init: RequestInit = {},
  maxRedirects = 4,
): Promise<Response> {
  let url = rawUrl;
  for (let hop = 0; ; hop++) {
    await assertSafePublicUrl(url);
    const res = await undiciFetch(url, {
      ...init,
      redirect: "manual",
      dispatcher: ssrfAgent,
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc) return res;
      if (hop >= maxRedirects) throw new SsrfError("too many redirects");
      url = new URL(loc, url).href;
      continue;
    }
    return res;
  }
}

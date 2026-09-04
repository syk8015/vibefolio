// 남의 사이트를 iframe에 넣을 수 있는지는 **그 사이트가 보낸 두 헤더**가 정한다:
// `X-Frame-Options`와 CSP의 `frame-ancestors`. 우리가 뚫을 방법은 없다 — 그게
// 그 헤더의 목적이다. 그래서 미리 물어보고, 안 되는 곳은 화면을 다르게 그린다.
//
// 배경(2026-09-05 사용자 접수): 초안 검토 화면이 외부 URL을 그냥 iframe에 꽂아
// 두어서 대부분의 작품이 "…에서 연결을 거부했습니다"로만 보였다. 명함
// (TheaterStage)은 원래 외부 URL을 임베드하지 않아 이 증상이 없었다.
//
// 판정은 브라우저 규칙을 따른다:
//  - frame-ancestors가 있으면 그것이 X-Frame-Options를 **이긴다**.
//  - CSP 정책이 여러 개면 전부 만족해야 한다(하나라도 막으면 막힌 것).
//  - 인식할 수 없는 X-Frame-Options 값(예전 ALLOWALL 등)은 브라우저가 무시하므로
//    우리도 허용으로 본다. deny·sameorigin·allow-from은 전부 차단.

export type EmbedVerdict = "ok" | "blocked";

/** CSP 헤더 하나에 콤마로 합쳐져 올 수 있는 여러 정책을 쪼갠다. */
function splitPolicies(csp: string): string[] {
  return csp.split(",").map((p) => p.trim()).filter(Boolean);
}

/** 정책 문자열에서 한 디렉티브의 소스 목록을 꺼낸다. 없으면 null. */
function directive(policy: string, name: string): string[] | null {
  for (const raw of policy.split(";")) {
    const parts = raw.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) continue;
    if (parts[0].toLowerCase() !== name) continue;
    return parts.slice(1);
  }
  return null;
}

/** frame-ancestors 소스 하나가 우리 오리진을 허용하는가. */
function sourceAllows(raw: string, origin: URL): boolean {
  const s = raw.trim().toLowerCase().replace(/^'|'$/g, "");
  if (s === "none") return false;
  if (s === "*") return true;
  // 'self'는 그 사이트 자신 — 우리(다른 오리진)에겐 허용이 아니다.
  if (s === "self") return false;
  if (s === "http:" || s === "https:") return `${s}` === origin.protocol;
  // host-source: [scheme://]host[:port], 호스트 앞에 * 와일드카드 가능.
  const withoutScheme = s.replace(/^https?:\/\//, "");
  const [hostPart] = withoutScheme.split("/");
  const [host, port] = hostPart.split(":");
  if (port && port !== "*" && port !== (origin.port || (origin.protocol === "https:" ? "443" : "80"))) {
    return false;
  }
  if (host === "*") return true;
  if (host.startsWith("*.")) {
    const suffix = host.slice(1); // ".example.com"
    return origin.hostname.endsWith(suffix);
  }
  return host === origin.hostname;
}

export function embedVerdict(
  headers: { xFrameOptions?: string | null; csp?: string | null },
  appOrigin: string,
): EmbedVerdict {
  let origin: URL;
  try {
    origin = new URL(appOrigin);
  } catch {
    return "blocked";
  }

  if (headers.csp) {
    let sawAncestors = false;
    for (const policy of splitPolicies(headers.csp)) {
      const srcs = directive(policy, "frame-ancestors");
      if (!srcs) continue;
      sawAncestors = true;
      if (!srcs.some((s) => sourceAllows(s, origin))) return "blocked";
    }
    // frame-ancestors가 하나라도 있었으면 그것이 최종 판정 — XFO는 보지 않는다.
    if (sawAncestors) return "ok";
  }

  const xfo = (headers.xFrameOptions ?? "").toLowerCase();
  if (!xfo.trim()) return "ok";
  if (xfo.includes("deny") || xfo.includes("sameorigin") || xfo.includes("allow-from")) {
    return "blocked";
  }
  return "ok";
}

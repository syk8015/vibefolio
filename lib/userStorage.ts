// 사용자 파일 저장소 = R2(2026-10-01). 예전 Supabase Storage 버킷(project-files·avatars)을 대신한다.
//
// 왜 옮겼나: Supabase 무료 요금제는 전송량이 한 달 5GB를 넘으면 유예 뒤 조직 전체의 요청을 막는다
// (402). 공개 버킷이라 누구든 25MB 파일 하나를 200번 받으면 닿았다(위협 목록 C3). R2는 전송료가
// 없고 media.nookframe.com(Cloudflare)이 앞에서 캐시한다.
//
// 모양: 버킷 이름·경로는 그대로 두고 R2 키 앞에 뿌리만 붙인다 —
//   project-files/<경로>  →  files/<경로>
//   avatars/<경로>        →  avatars/<경로>
// demo_url(`/api/preview/<경로>`)·소스 값(`{uid}/{폴더}`)·소유자 접두사 검사가 전부 그대로 산다.
// 촬영 영상은 `{uid}/{rowId}/demo-*.mp4`(뿌리 없음)라 겹치지 않는다 — 워커의 prune이 그 폴더를
// 통째로 비우므로 사용자 파일을 거기 두면 안 된다.
//
// API는 supabase-js `storage.from(bucket)`의 쓰는 부분만 같은 모양으로 흉내 낸다(upload·list·remove·
// download·getPublicUrl·createSignedUploadUrl·createSignedUrls) — 호출부의 안전 검사 코드를 그대로
// 두려는 것. 에러도 throw가 아니라 `{ error }`로 돌려준다.
//
// 🔴 같은 사이트 문제: media.nookframe.com은 nookframe.com과 "같은 사이트"다. 거기서 사용자 HTML·JS·
// SVG가 문서로 열리면 로그인 쿠키가 실리는 요청을 우리 API에 보낼 수 있다. 그래서 그림(png·jpeg·
// webp·gif)·영상(mp4·webm·mov)만 진짜 형식으로 저장하고, 나머지는 전부 application/octet-stream +
// Content-Disposition: attachment(열면 내려받기)로 저장한다. 앱은 /api/preview가 확장자로 형식을
// 붙여 미리보기 도메인(다른 사이트)에서 띄운다.
import {
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from "@aws-sdk/client-s3";
import { r2Client, r2Bucket, r2PublicBase, isR2Configured } from "./r2";

export type UserBucket = "project-files" | "avatars";
const ROOT: Record<UserBucket, string> = { "project-files": "files/", avatars: "avatars/" };

/** 직접 올린 파일의 CDN 캐시 — 같은 키를 다시 쓰는 경로(초안 재발행의 _media 등)가 있어 짧게. */
const USER_FILE_CACHE = "public, max-age=300";
/** 서명 URL 기본 수명 — 업로드는 2시간(느린 회선의 25MB), 읽기는 30분. */
const UPLOAD_TTL_S = 2 * 3600;

type StorageError = { message: string };

export function userFileKey(bucket: UserBucket, path: string): string {
  return `${ROOT[bucket]}${path.replace(/^\/+/, "")}`;
}

export function userFilePublicUrl(bucket: UserBucket, path: string): string {
  return `${r2PublicBase()}/${userFileKey(bucket, path)}`;
}

/**
 * 공개 주소 → (버킷, 경로). R2 주소와 옛 Supabase 공개 주소 둘 다 읽는다(옛 행 정리용).
 * 우리 주소가 아니면 null — 남의 주소를 지우는 일이 없게.
 */
export function userFilePathFromUrl(url: string | null | undefined): { bucket: UserBucket; path: string; legacy: boolean } | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  // URL 파서는 `%2e%2e`·`/./`를 조용히 접어 다른 경로로 바꾼다 — 원문 경로와 다르면 거절한다
  // (사용자가 쓰는 칸의 주소로 서버가 파일을 지우는 경로라, 남의 폴더로 새면 안 된다).
  const rawPath = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*(\/[^?#]*)?/i.exec(url)?.[1] ?? "/";
  if (rawPath !== u.pathname) return null;
  const decode = (p: string) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return null;
    }
  };
  const base = r2PublicBase();
  if (base && u.origin === new URL(base).origin) {
    for (const bucket of Object.keys(ROOT) as UserBucket[]) {
      const prefix = `/${ROOT[bucket]}`;
      if (u.pathname.startsWith(prefix)) {
        const path = decode(u.pathname.slice(prefix.length));
        return path && !path.split("/").includes("..") ? { bucket, path, legacy: false } : null;
      }
    }
    return null;
  }
  const supa = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supa && u.origin === new URL(supa).origin) {
    const m = u.pathname.match(/^\/storage\/v1\/object\/public\/(project-files|avatars)\/(.+)$/);
    const path = m ? decode(m[2]) : null;
    return m && path && !path.split("/").includes("..") ? { bucket: m[1] as UserBucket, path, legacy: true } : null;
  }
  return null;
}

const INLINE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

/**
 * 저장할 때 붙일 헤더. 그림·영상은 확장자와 요청 형식이 같은 계열일 때만 그 형식으로,
 * 나머지는 내려받기 전용. (확장자만 믿고 형식을 정하므로, 이름만 .png인 HTML도 문서로는 안 열린다.)
 */
export function storedObjectHeaders(path: string, requested?: string | null): {
  ContentType: string;
  ContentDisposition?: string;
  CacheControl: string;
} {
  const ext = path.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  const inline = INLINE_TYPES[ext];
  const req = (requested ?? "").split(";")[0].trim().toLowerCase();
  if (inline && (!req || req === inline || (req.startsWith("image/") && inline.startsWith("image/")) || (req.startsWith("video/") && inline.startsWith("video/")))) {
    return { ContentType: inline, CacheControl: USER_FILE_CACHE };
  }
  return { ContentType: "application/octet-stream", ContentDisposition: "attachment", CacheControl: USER_FILE_CACHE };
}

export type ListEntry = {
  name: string;
  id: string | null; // null = 폴더(supabase-js와 같은 규칙)
  updated_at: string | null;
  created_at: string | null;
  metadata: { size: number } | null;
};

function errOf(e: unknown): StorageError {
  return { message: e instanceof Error ? e.message : String(e) };
}

async function presigner() {
  return (await import("@aws-sdk/s3-request-presigner")).getSignedUrl;
}

function bucketApi(bucket: UserBucket) {
  const ensure = () => {
    if (!isR2Configured()) throw new Error("R2 is not configured — user files need R2 (lib/userStorage.ts)");
  };
  return {
    async upload(
      path: string,
      data: Uint8Array | ArrayBuffer | Blob,
      opts?: { upsert?: boolean; contentType?: string },
    ): Promise<{ error: StorageError | null }> {
      try {
        ensure();
        const body = data instanceof Blob ? new Uint8Array(await data.arrayBuffer()) : data instanceof Uint8Array ? data : new Uint8Array(data);
        await r2Client().send(new PutObjectCommand({
          Bucket: r2Bucket(),
          Key: userFileKey(bucket, path),
          Body: body,
          ...storedObjectHeaders(path, opts?.contentType),
        }));
        return { error: null };
      } catch (e) {
        return { error: errOf(e) };
      }
    },

    getPublicUrl(path: string): { data: { publicUrl: string } } {
      return { data: { publicUrl: userFilePublicUrl(bucket, path) } };
    },

    /** 한 겹 목록(폴더는 id null). supabase-js처럼 이름순·limit/offset. */
    async list(
      dir: string,
      opts?: { limit?: number; offset?: number },
    ): Promise<{ data: ListEntry[] | null; error: StorageError | null }> {
      try {
        ensure();
        const prefix = userFileKey(bucket, dir.replace(/\/+$/, "")) + (dir ? "/" : "");
        const folders: ListEntry[] = [];
        const files: ListEntry[] = [];
        let token: string | undefined;
        do {
          const res = await r2Client().send(new ListObjectsV2Command({
            Bucket: r2Bucket(), Prefix: prefix, Delimiter: "/", ContinuationToken: token,
          }));
          for (const p of res.CommonPrefixes ?? []) {
            const name = (p.Prefix ?? "").slice(prefix.length).replace(/\/$/, "");
            if (name) folders.push({ name, id: null, updated_at: null, created_at: null, metadata: null });
          }
          for (const o of res.Contents ?? []) {
            const name = (o.Key ?? "").slice(prefix.length);
            if (!name) continue;
            const at = o.LastModified?.toISOString() ?? null;
            files.push({ name, id: o.Key!, updated_at: at, created_at: at, metadata: { size: o.Size ?? 0 } });
          }
          token = res.IsTruncated ? res.NextContinuationToken : undefined;
        } while (token);
        const all = [...folders, ...files].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
        const offset = opts?.offset ?? 0;
        const limit = opts?.limit ?? 100;
        return { data: all.slice(offset, offset + limit), error: null };
      } catch (e) {
        return { data: null, error: errOf(e) };
      }
    },

    async remove(paths: string[]): Promise<{ error: StorageError | null }> {
      try {
        ensure();
        const keys = paths.filter(Boolean).map((p) => userFileKey(bucket, p));
        for (let i = 0; i < keys.length; i += 1000) {
          await r2Client().send(new DeleteObjectsCommand({
            Bucket: r2Bucket(),
            Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true },
          }));
        }
        return { error: null };
      } catch (e) {
        return { error: errOf(e) };
      }
    },

    /**
     * 내용 읽기 — CDN이 아니라 저장소에서 바로(방금 지우거나 바꾼 파일이 캐시에서 읽히지 않게).
     * maxBytes를 넘는 파일은 읽지 않고 에러 — 서명 URL로 올리는 파일은 크기를 서명에 못 묶어서
     * (CLI가 크기를 미리 안 알려준다) 아주 큰 파일이 함수 메모리를 터뜨리지 않게 여기서 막는다.
     */
    async download(path: string, opts?: { maxBytes?: number }): Promise<{ data: Blob | null; error: StorageError | null }> {
      try {
        ensure();
        const res = await r2Client().send(new GetObjectCommand({ Bucket: r2Bucket(), Key: userFileKey(bucket, path) }));
        if (opts?.maxBytes && (res.ContentLength ?? 0) > opts.maxBytes) {
          await res.Body?.transformToWebStream().cancel().catch(() => {});
          return { data: null, error: { message: `object too large: ${res.ContentLength} bytes` } };
        }
        const bytes = await res.Body!.transformToByteArray();
        return { data: new Blob([bytes as BlobPart]), error: null };
      } catch (e) {
        return { data: null, error: errOf(e) };
      }
    },

    /**
     * 남(CLI·AI)이 직접 PUT할 서명 URL. 서명에 묶는 헤더는 Content-Type: application/octet-stream
     * 하나뿐 — CLI가 정확히 그 헤더로 보낸다. 다른 형식을 보내면 R2가 403으로 거절하므로, 이 키에
     * HTML 형식 파일이 생길 수 없다(같은 사이트 문제).
     */
    // 두 번째 인자(supabase-js의 { upsert })는 받지 않는다 — R2 PUT은 늘 덮어쓴다.
    async createSignedUploadUrl(
      path: string,
    ): Promise<{ data: { signedUrl: string; path: string; token: string } | null; error: StorageError | null }> {
      try {
        ensure();
        const getSignedUrl = await presigner();
        const signedUrl = await getSignedUrl(
          r2Client(),
          new PutObjectCommand({ Bucket: r2Bucket(), Key: userFileKey(bucket, path), ContentType: "application/octet-stream" }),
          { expiresIn: UPLOAD_TTL_S },
        );
        return { data: { signedUrl, path, token: "" }, error: null };
      } catch (e) {
        return { data: null, error: errOf(e) };
      }
    },

    async createSignedUrls(
      paths: string[],
      ttlSeconds: number,
    ): Promise<{ data: { path: string; signedUrl: string; error: string | null }[] | null; error: StorageError | null }> {
      try {
        ensure();
        const getSignedUrl = await presigner();
        const data = await Promise.all(paths.map(async (path) => ({
          path,
          signedUrl: await getSignedUrl(
            r2Client(),
            new GetObjectCommand({ Bucket: r2Bucket(), Key: userFileKey(bucket, path) }),
            { expiresIn: ttlSeconds },
          ),
          error: null,
        })));
        return { data, error: null };
      } catch (e) {
        return { data: null, error: errOf(e) };
      }
    },
  };
}

export type UserStorageBucket = ReturnType<typeof bucketApi>;

/** supabase-js `admin.storage`와 같은 모양 — `userStorage.from("project-files")`. */
export const userStorage = {
  from(bucket: string): UserStorageBucket {
    if (bucket !== "project-files" && bucket !== "avatars") throw new Error(`unknown user bucket: ${bucket}`);
    return bucketApi(bucket);
  },
};

/** `{ storage }` 모양을 받는 함수(lib/ingestStore·demoPayload 등)에 넘기는 값. */
export const userStorageClient = { storage: userStorage };

/**
 * 관리자 클라이언트에서 저장소만 R2로 바꾼 것 — 표(`.from("projects")`)와 저장소를 한 인자로 받는
 * 함수(dropNewRow 등)에 넘긴다. `storage`만 가리고 나머지는 원래 객체 그대로.
 */
export function withUserStorage<T extends object>(admin: T): Omit<T, "storage"> & { storage: typeof userStorage } {
  return new Proxy(admin, {
    get(target, prop) {
      if (prop === "storage") return userStorage;
      const v = Reflect.get(target, prop, target);
      // 메서드는 원래 객체에 묶는다(supabase-js 내부 필드를 this로 읽는다).
      return typeof v === "function" ? v.bind(target) : v;
    },
  }) as Omit<T, "storage"> & { storage: typeof userStorage };
}

/** 미리보기 프록시용 — 저장소에서 바로 흘려보낸다. 없으면 null. */
export async function readUserFileStream(
  bucket: UserBucket,
  path: string,
): Promise<{ body: ReadableStream; size: number | null } | null> {
  if (!isR2Configured()) return null;
  try {
    const res = await r2Client().send(new GetObjectCommand({ Bucket: r2Bucket(), Key: userFileKey(bucket, path) }));
    if (!res.Body) return null;
    return { body: res.Body.transformToWebStream(), size: res.ContentLength ?? null };
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === "NoSuchKey" || name === "NotFound") return null;
    throw e;
  }
}

/** 사용자 폴더 통째로 지우기(탈퇴·작품 삭제). 지운 개수. */
export async function removeUserPrefix(bucket: UserBucket, prefix: string): Promise<number> {
  if (!prefix || prefix.split("/").includes("..")) throw new Error("bad prefix");
  const { deleteR2Prefix } = await import("./r2");
  return deleteR2Prefix(userFileKey(bucket, prefix.replace(/\/*$/, "/")));
}

export type PresignedPut = {
  path: string;
  url: string;
  headers: Record<string, string>;
  publicUrl: string;
};

/**
 * 브라우저 직행 업로드용 서명 — 키·형식·크기를 서버가 정하고 서명에 묶는다. 브라우저는 받은
 * headers를 그대로 보내야 한다(Content-Length는 브라우저가 몸통 크기로 채운다 — 크기가 다르면 403).
 */
export async function presignUserPut(
  bucket: UserBucket,
  path: string,
  size: number,
  requestedType?: string | null,
  ttlSeconds = 900,
): Promise<PresignedPut> {
  if (!isR2Configured()) throw new Error("R2 is not configured");
  const h = storedObjectHeaders(path, requestedType);
  const getSignedUrl = await presigner();
  const url = await getSignedUrl(
    r2Client(),
    new PutObjectCommand({
      Bucket: r2Bucket(),
      Key: userFileKey(bucket, path),
      ContentType: h.ContentType,
      ContentLength: size,
      CacheControl: h.CacheControl,
      ...(h.ContentDisposition ? { ContentDisposition: h.ContentDisposition } : {}),
    }),
    { expiresIn: ttlSeconds, signableHeaders: new Set(["content-type", "content-length", "cache-control", "content-disposition"]) },
  );
  const headers: Record<string, string> = { "content-type": h.ContentType, "cache-control": h.CacheControl };
  if (h.ContentDisposition) headers["content-disposition"] = h.ContentDisposition;
  return { path, url, headers, publicUrl: userFilePublicUrl(bucket, path) };
}

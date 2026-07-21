import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

const BASE = "https://nookframe.com";

// Public sitemap: static marketing/legal pages + every public 명함 (/@username).
// Profiles are the discoverable unit, so they carry the higher priority.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/signup`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${BASE}/login`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  let profiles: MetadataRoute.Sitemap = [];
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("profiles").select("username, updated_at");
    profiles = (data ?? [])
      .filter((p) => Boolean(p.username))
      .map((p) => ({
        url: `${BASE}/${p.username}`,
        lastModified: p.updated_at ? new Date(p.updated_at as string) : undefined,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      }));
  } catch {
    // A read failure must never 500 the sitemap — serve the static routes alone.
  }

  return [...staticRoutes, ...profiles];
}

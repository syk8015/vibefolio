import type { MetadataRoute } from "next";
import { createClient } from "@/lib/supabase/server";

const BASE = "https://nookframe.com";

// Public sitemap: static marketing/legal pages + every public 명함 (/@username)
// + every public project watch page (/@username/{id}).
//
// The watch pages are the bulk of our indexable surface and nothing links to
// them from inside the site (the theater deliberately keeps its layout clean),
// so without this sitemap Google has no way to discover they exist at all.
//
// Drafts are excluded twice over: RLS already hides them from the anon client,
// and the explicit is_draft filter below keeps that true even if this route is
// ever moved onto a service-role client.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE, changeFrequency: "weekly", priority: 1 },
    { url: `${BASE}/signup`, changeFrequency: "yearly", priority: 0.5 },
    { url: `${BASE}/login`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  let dynamicRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = await createClient();

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, username, updated_at");

    const profiles = (profileRows ?? []).filter((p) => Boolean(p.username));

    dynamicRoutes = profiles.map((p) => ({
      url: `${BASE}/${p.username}`,
      lastModified: p.updated_at ? new Date(p.updated_at as string) : undefined,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    }));

    const usernameById = new Map(
      profiles.map((p) => [p.id as string, p.username as string]),
    );

    if (usernameById.size > 0) {
      const { data: projectRows } = await supabase
        .from("projects")
        .select("id, user_id, demo_generated_at, created_at")
        .eq("is_draft", false);

      for (const row of projectRows ?? []) {
        const username = usernameById.get(row.user_id as string);
        if (!username) continue;
        const touched = (row.demo_generated_at ?? row.created_at) as string | null;
        dynamicRoutes.push({
          url: `${BASE}/${username}/${row.id}`,
          lastModified: touched ? new Date(touched) : undefined,
          changeFrequency: "monthly",
          priority: 0.6,
        });
      }
    }
  } catch {
    // A read failure must never 500 the sitemap — serve the static routes alone.
  }

  return [...staticRoutes, ...dynamicRoutes];
}

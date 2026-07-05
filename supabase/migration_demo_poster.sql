-- Poster frame for each auto-demo.
-- A first-frame JPG extracted during post-processing and stored alongside the
-- demo mp4. Used as the og:image on the public watch page (/{username}/{id}) and
-- as the <video> poster. Null until a demo is (re)generated with this pipeline;
-- consumers fall back to projects.thumbnail.
alter table projects
  add column if not exists demo_poster_url text;

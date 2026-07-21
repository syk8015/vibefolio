// Deterministic, self-hosted thumbnail placeholder for projects with no image.
// Replaces a runtime dependency on picsum.photos — a third-party host that, when
// down, left public 명함 cards with broken images. A soft, paper-toned gradient
// seeded by the project id, so each card is stable and quietly distinct.
export function placeholderThumbnail(seed: string): string {
  // FNV-1a hash → stable hue from the seed.
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="hsl(${hue} 32% 88%)"/>` +
    `<stop offset="1" stop-color="hsl(${(hue + 32) % 360} 30% 78%)"/>` +
    `</linearGradient></defs>` +
    `<rect width="800" height="600" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

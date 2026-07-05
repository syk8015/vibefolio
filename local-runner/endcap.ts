// Render the demo endcap overlays as PNGs.
//
// ffmpeg on this machine is built WITHOUT libfreetype (no `drawtext` filter), so
// we can't burn text with ffmpeg. Instead we rasterize the chip + end card in a
// headless system Chrome (already a dependency for recording) and hand the PNGs
// to postprocess, which composites them with `overlay` + `concat` (both present).
//
// The chip is a small pill shown only in the last few seconds of the film; the end
// card is a full-frame cream outro. Both use system fonts (deterministic, offline)
// in the Paper & Ink palette that matches the OG image.
import { chromium } from "playwright-core";

export type EndcapAssets = { chipPath: string; endcardPath: string };

// Paper & Ink palette (mirrors app/[username]/opengraph-image.tsx).
const CREAM = "#f4ede0";
const INK = "#1a1612";
const MUTED = "#6a5e4e";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function chipHtml(handle: string): string {
  return `<!doctype html><html><body style="margin:0;background:transparent">
<div id="chip" style="display:inline-flex;align-items:center;gap:9px;
  padding:11px 18px;border-radius:999px;background:rgba(14,14,18,0.72);
  font-family:ui-monospace,'SF Mono',Menlo,monospace;font-size:23px;font-weight:600;
  color:#ffffff;letter-spacing:0.01em;white-space:nowrap">
  <span style="width:8px;height:8px;border-radius:50%;background:#ffffff;opacity:0.9"></span>
  nookframe.com/${esc(handle)}
</div></body></html>`;
}

function endcardHtml(handle: string, w: number, h: number): string {
  return `<!doctype html><html><body style="margin:0">
<div style="width:${w}px;height:${h}px;background:${CREAM};display:flex;
  flex-direction:column;align-items:center;justify-content:center;
  font-family:Georgia,'Times New Roman',serif">
  <div style="font-size:88px;font-weight:500;color:${INK};letter-spacing:-0.02em">${esc(handle)}</div>
  <div style="margin-top:24px;font-family:ui-monospace,'SF Mono',Menlo,monospace;
    font-size:26px;color:${MUTED};letter-spacing:0.12em">nookframe.com</div>
</div></body></html>`;
}

// Renders chip.png (transparent, sized to content) + endcard.png (w×h cream) into
// outDir. handle is "@username". Throws on browser failure — the caller treats the
// endcap as best-effort and ships the plain film if this fails.
export async function renderEndcapAssets(opts: {
  handle: string;
  width: number;
  height: number;
  outDir: string;
}): Promise<EndcapAssets> {
  const { handle, width, height, outDir } = opts;
  const chipPath = `${outDir}/chip.png`;
  const endcardPath = `${outDir}/endcard.png`;

  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  try {
    const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();

    // End card — full frame.
    await page.setContent(endcardHtml(handle, width, height), { waitUntil: "load" });
    await page.waitForTimeout(120); // let fonts paint
    await page.screenshot({ path: endcardPath });

    // Chip — element-only screenshot on a transparent page.
    await page.setContent(chipHtml(handle), { waitUntil: "load" });
    await page.waitForTimeout(120);
    await page.locator("#chip").screenshot({ path: chipPath, omitBackground: true });

    await ctx.close();
  } finally {
    await browser.close().catch(() => {});
  }
  return { chipPath, endcardPath };
}

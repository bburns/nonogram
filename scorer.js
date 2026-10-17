/* ══ for picscore ═════════════════════════════════════════════════════
   What ../picscore needs to score pictures for this game, rank them
   and draw its gallery. The work is in picture.js, shared with
   make.html, so a picture scores exactly as the page would make it.
   See picscore's README for the shape of this interface;
   puzzle/scorer.js is the other example.                              */

import "./picture.js"

const { shrink, quality, rowsOf, WEIGHTS } = globalThis.Nonogram

export const name = "nonogram"          // group in .props.yaml
export const title = "Nonogram"
export const version = 1                // bump when a change would move scores
export const settings = { size: 15 }    // stored with scores; one fixed size, so they compare
// Below this a picture has fewer pixels than a 20×20 grid has squares.
export const minSide = 20
// Same as readPixels() in make.html: 400px wide, transparency on white.
export const decode = { width: 400, background: "#ffffff" }

export const parts = [
  { key: "shape", label: "Shape", tip: "A subject clear of a plain background, in a few solid pieces" },
  { key: "clarity", label: "Clarity", tip: "How cleanly it splits into light and dark" },
  { key: "clean", label: "Clean", tip: "Squares mostly one shade, few lone specks or pinholes" },
  { key: "faithful", label: "Faithful", tip: "How few squares changed to make it solvable" },
  { key: "balance", label: "Balance", tip: "Filled share near half" },
  { key: "interest", label: "Interest", tip: "More than one run per line" },
]
export const tiers = [
  { min: 78, key: "good", label: "Good puzzle" },
  { min: 68, key: "fair", label: "Workable" },
  { min: 0, key: "hard", label: "Mostly noise" },
]
export const blurb = s => `scored for how well they'd work as a ${s.size}×${s.size}`
  + ` nonogram. Tap a picture to see the puzzle it makes. Squares changed`
  + ` to make it solvable without guessing are gold.`
export const previewLabel = "puzzles"
export { WEIGHTS }

export function score(img, { size }) {
  const { data, width: w, height: h, channels: ch = 3 } = img
  const lum = new Float32Array(w * h)
  for (let p = 0; p < w * h; p++) {
    lum[p] = 0.299 * data[p * ch] + 0.587 * data[p * ch + 1] + 0.114 * data[p * ch + 2]
  }
  const s = shrink(lum, w, h, size)
  const r = quality(s.gray, s.bg, { lum, w, h, square: s.square })
  const [sx, sy, side] = s.square
  return { ...r, crop: { left: sx, top: sy, size: side }, rows: rowsOf(r.T) }
}

// What goes in the sidecar, in whole percent, and back.
const pct = x => Math.round(100 * x)
export const record = r => {
  const out = { score: r.score }
  for (const p of parts) out[p.key] = pct(r[p.key])
  out.changed = r.changed
  return out
}
export const fromRecord = g => {
  const out = { score: g.score, changed: g.changed }
  for (const p of parts) out[p.key] = g[p.key] / 100
  return out
}

export const meta = r => r.changed
  ? `${r.changed} square${r.changed > 1 ? "s" : ""} changed` : "nothing changed"
export const column = { head: "chg", cell: r => String(r.changed) }
// The rows to paste into PUZZLES in index.html.
export const details = r => r.rows
  && { summary: "Rows for index.html", text: r.rows.map(x => `"${x}",`).join("\n") }

// The puzzle as the game draws it: cream squares on dark, squares
// changed to make it solvable in gold, guide lines every five. Raw RGB.
export function preview(img, r) {
  const N = r.N, s = Math.floor(360 / N), W = s * N
  const px = new Uint8Array(W * W * 3)
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = Math.floor(y / s), j = Math.floor(x / s)
    const changed = r.flipped.has(i + "," + j)
    const line = x % s === 0 || y % s === 0
    const guide = x % (5 * s) === 0 || y % (5 * s) === 0
    const ring = changed && !r.T[i][j]
      && (x % s < 3 || y % s < 3 || x % s > s - 4 || y % s > s - 4)
    const c = guide ? [106, 134, 142]
      : line ? [52, 69, 74]
      : r.T[i][j] ? (changed ? [232, 181, 75] : [233, 227, 214])
      : ring ? [232, 181, 75] : [27, 35, 38]
    px.set(c, (y * W + x) * 3)
  }
  return { data: px, width: W, height: W }
}

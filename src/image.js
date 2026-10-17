/* Shared by rank.js and score.js: which files count as pictures, how
   they're decoded for scoring, and a small concurrency pool. Decoding
   matches readPixels() in make.html — 400px wide, transparency on
   white, the same lightness weights — so a picture scores the way the
   page would make it.                                                */

import sharp from "sharp"
import "../picture.js"

export const { quality, shrink, rowsOf } = globalThis.Nonogram

export const EXT = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif",
  ".tif", ".tiff", ".gif"])
const WORK = 400

// Below this a picture has fewer pixels than a 20×20 grid has squares.
export const MIN_SIDE = 20

// The group score.js writes under each file in .props.yaml.
export const GROUP = "nonogram"

// Bump when a change would move scores, so stored ones get redone.
export const VERSION = 1

export async function load(file) {
  const img = sharp(file, { failOn: "none" })
  const meta = await img.metadata()
  const side = Math.min(meta.width, meta.height)
  if (side < MIN_SIDE) {
    throw Object.assign(new Error(`too small: ${meta.width}x${meta.height}`),
      { code: "TOO_SMALL" })
  }
  const { data, info } = await img
    .rotate()                                   // honour EXIF orientation
    .flatten({ background: "#ffffff" })
    .resize({ width: WORK })
    .removeAlpha().toColourspace("srgb")
    .raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels: ch } = info
  const lum = new Float32Array(w * h)
  for (let p = 0; p < w * h; p++) {
    lum[p] = 0.299 * data[p * ch] + 0.587 * data[p * ch + 1]
      + 0.114 * data[p * ch + 2]
  }
  return { data, lum, width: w, height: h, channels: ch }
}

// Score a loaded picture as an N×N nonogram.
export function score(img, N) {
  const s = shrink(img.lum, img.width, img.height, N)
  return { ...quality(s.gray, s.bg,
    { lum: img.lum, w: img.width, h: img.height, square: s.square }), square: s.square }
}

export async function pool(items, n, fn) {
  const out = []; let next = 0
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]) }
  }))
  return out
}

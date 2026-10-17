#!/usr/bin/env node
/* Rank pictures by how good a nonogram they'd make.

     node rank.js <files or folders...> [options]

     --size N       score as an N×N puzzle (default 15)
     --html FILE    write a page of thumbnails, scores and puzzles
     --list FILE    read folders and excludes from FILE (see folders.js);
                    ../folders.txt is used when no paths are given
     --exclude NAME skip folders with this name at any depth, or just
                    this folder if it's a path (repeatable)
     --sample N     score a random N of the pictures found
     --stored       rank by the scores score.js saved in .props.yaml
                    files instead of scoring; only pictures shown in
                    --html output get loaded
     --json         print JSON instead of a table
     --top N        only show the best N                              */

import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises"
import { join, extname, dirname } from "node:path"
import sharp from "sharp"
import { gallery } from "./gallery.js"
import { EXT, GROUP, load, pool, score, rowsOf } from "./image.js"
import { SIDECAR } from "./props.js"
import { readList, readDefault, skipper } from "./folders.js"
import YAML from "yaml"

function args(argv) {
  const o = { paths: [], size: 15, html: null, list: null, exclude: [],
    sample: 0, stored: false, json: false, top: 0 }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--size") o.size = +argv[++i]
    else if (a === "--html") o.html = argv[++i]
    else if (a === "--list") o.list = argv[++i]
    else if (a === "--exclude") o.exclude.push(argv[++i])
    else if (a === "--sample") o.sample = +argv[++i]
    else if (a === "--stored") o.stored = true
    else if (a === "--json") o.json = true
    else if (a === "--top") o.top = +argv[++i]
    else o.paths.push(a)
  }
  return o
}

// A file named directly is checked against every folder above it, so
// it's skipped the same way it would be if found while walking.
async function* walk(p, skip) {
  const s = await stat(p)
  if (s.isFile()) {
    if (EXT.has(extname(p).toLowerCase()) && !skip.file(p)) yield p
    return
  }
  for (const e of await readdir(p, { withFileTypes: true })) {
    if (e.name.startsWith(".") || e.name === "node_modules") continue
    if (e.isDirectory() && skip.dir(join(p, e.name))) continue
    yield* walk(join(p, e.name), skip)
  }
}

function shuffle(xs) {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [xs[i], xs[j]] = [xs[j], xs[i]]
  }
  return xs
}

const THUMB = 360

// The square of the picture the puzzle was cut from, padded white.
async function cropThumb(file, img, square) {
  const [sx, sy, side] = square
  const { data, info } = await sharp(file, { failOn: "none" }).rotate()
    .flatten({ background: "#ffffff" }).removeAlpha()
    .raw().toBuffer({ resolveWithObject: true })
  const f = info.width / img.width
  const left = Math.round(sx * f), top = Math.round(sy * f)
  const size = Math.max(1, Math.round(side * f))
  // extend with white where the square runs past the picture
  const pad = {
    left: Math.max(0, -left), top: Math.max(0, -top),
    right: Math.max(0, left + size - info.width),
    bottom: Math.max(0, top + size - info.height),
  }
  const ext = await sharp(data, { raw: info })
    .extend({ ...pad, background: "#ffffff" })
    .raw().toBuffer({ resolveWithObject: true })
  return sharp(ext.data, { raw: ext.info })
    .extract({ left: left + pad.left, top: top + pad.top, width: size,
      height: size })
    .resize(THUMB, THUMB, { fit: "fill" })
    .jpeg({ quality: 80 }).toBuffer()
}

// The puzzle as the game draws it: cream squares on dark, with squares
// changed to make it solvable in gold, and guide lines every five.
function puzzlePicture(r) {
  const N = r.N, s = Math.floor(THUMB / N), W = s * N
  const px = Buffer.alloc(W * W * 3)
  const put = (x, y, [a, b, c]) => {
    const i = (y * W + x) * 3; px[i] = a; px[i + 1] = b; px[i + 2] = c
  }
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const i = Math.floor(y / s), j = Math.floor(x / s)
    const changed = r.flipped.has(i + "," + j)
    const line = x % s === 0 || y % s === 0
    const guide = (x % (5 * s) === 0) || (y % (5 * s) === 0)
    const ring = changed && !r.T[i][j]
      && (x % s < 3 || y % s < 3 || x % s > s - 4 || y % s > s - 4)
    put(x, y, guide ? [106, 134, 142]
      : line ? [52, 69, 74]
      : r.T[i][j] ? (changed ? [232, 181, 75] : [233, 227, 214])
      : ring ? [232, 181, 75] : [27, 35, 38])
  }
  return sharp(px, { raw: { width: W, height: W, channels: 3 } })
    .png().toBuffer()
}

const dataUrl = (buf, type) => `data:image/${type};base64,`
  + buf.toString("base64")

async function render(file, o) {
  const img = await load(file)
  const r = score(img, o.size)
  const pics = o.html ? {
    thumb: dataUrl(await cropThumb(file, img, r.square), "jpeg"),
    puzzle: dataUrl(await puzzlePicture(r), "png"),
  } : {}
  return { file, ...summary(r), rows: rowsOf(r.T), ...pics }
}

const summary = r => ({ score: r.score, shape: r.shape, clarity: r.clarity, clean: r.clean,
  faithful: r.faithful, balance: r.balance, interest: r.interest,
  changed: r.changed, size: r.N })

// Saved scores from every sidecar under the given folders. Only folder
// listings and sidecars are read, never the pictures, so a whole
// collection ranks in seconds. Entries whose file has gone are skipped.
async function stored(paths, skip) {
  const out = []
  const visit = async dir => {
    let entries
    try { entries = await readdir(dir, { withFileTypes: true }) } catch {
      return
    }
    const here = new Set(entries.filter(e => e.isFile()).map(e => e.name))
    if (here.has(SIDECAR)) {
      let doc = {}
      try { doc = YAML.parse(await readFile(join(dir, SIDECAR), "utf8")) ?? {} }
      catch (e) { console.error(`bad ${join(dir, SIDECAR)}: ${e.message}`) }
      for (const [name, e] of Object.entries(doc)) {
        const g = e?.[GROUP]
        if (!here.has(name) || g?.score == null) continue
        out.push({ file: join(dir, name), score: g.score, shape: g.shape / 100,
          clarity: g.clarity / 100, clean: g.clean / 100,
          faithful: g.faithful / 100, balance: g.balance / 100,
          interest: g.interest / 100, changed: g.changed, size: g.size })
      }
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith(".")) continue
      if (e.name === "node_modules" || skip.dir(join(dir, e.name))) continue
      await visit(join(dir, e.name))
    }
  }
  for (const p of paths) await visit(p)
  return out
}

const pct = x => String(Math.round(100 * x)).padStart(3)

async function main() {
  const o = args(process.argv.slice(2))
  const list = o.list ? await readList(o.list)
    : o.paths.length ? null : await readDefault()
  if (list) { o.paths.push(...list.roots); o.exclude.push(...list.exclude) }
  o.skip = skipper(o.exclude)
  if (!o.paths.length) {
    console.error("usage: node rank.js <files or folders...> [--size N]"
      + " [--html FILE] [--list FILE] [--exclude NAME] [--sample N]"
      + " [--stored] [--json] [--top N]")
    process.exit(1)
  }
  if (o.html) await mkdir(dirname(o.html), { recursive: true })
  const results = o.stored ? await fromStore(o) : await scoreAll(o)

  const shown = o.top ? results.slice(0, o.top) : results
  if (o.html) {
    await writeFile(o.html, gallery(shown, { size: o.size }))
    console.error(`wrote ${o.html}`)
    for (const r of shown) { delete r.thumb; delete r.puzzle }
  }
  if (o.json) { console.log(JSON.stringify(shown, null, 2)); return }

  console.log(`score  shap clar clen fait balc intr  chg  file`)
  for (const r of shown) {
    console.log(`${String(r.score).padStart(5)}  ${pct(r.shape)}  ${pct(r.clarity)}  `
      + `${pct(r.clean)}  ${pct(r.faithful)}  ${pct(r.balance)}  `
      + `${pct(r.interest)}  ${String(r.changed).padStart(3)}  ${r.file}`)
  }
}

const byScore = (a, b) => b.score - a.score
const safely = o => async file => {
  // Pictures too small to make a puzzle aren't candidates, so they're
  // left out quietly.
  try { return await render(file, o) } catch (e) {
    if (e.code !== "TOO_SMALL") console.error(`skip ${file}: ${e.message}`)
    return null
  }
}

async function scoreAll(o) {
  let files = []
  for (const p of o.paths) {
    for await (const f of walk(p, o.skip)) files.push(f)
  }
  if (o.sample) files = shuffle(files).slice(0, o.sample)
  return (await pool(files, 4, safely(o))).filter(Boolean).sort(byScore)
}

// Rank from the store, then load only what will be drawn. Scores are
// only comparable at the size they were saved at, so that size wins
// over --size.
async function fromStore(o) {
  let rs = await stored(o.paths, o.skip)
  if (o.sample) rs = shuffle(rs).slice(0, o.sample)
  rs.sort(byScore)
  if (rs.length) o.size = rs[0].size
  if (!o.html) return rs
  const shown = o.top ? rs.slice(0, o.top) : rs
  return (await pool(shown.map(r => r.file), 4, safely(o)))
    .filter(Boolean).sort(byScore)
}

main()

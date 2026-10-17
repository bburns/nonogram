/* ══ pictures into nonograms ══════════════════════════════════════════
   Shared by make.html (as a plain <script>) and src/score.js and
   src/rank.js (as an import), so a picture scores exactly as the page
   would make it. Pure: everything works on a lightness array, 0..255,
   row by row. No imports or exports, so it loads either way, and it
   puts its functions on globalThis.Nonogram.                          */

(() => {

/* ── solving ──────────────────────────────────────────────────────── */

const clueOf = arr => {
  const out = []; let n = 0
  for (const v of arr) { if (v === 1) n++; else if (n) { out.push(n); n = 0 } }
  if (n) out.push(n)
  return out.length ? out : [0]
}

/* A line is an array of -1 (unknown), 0 (empty), 1 (filled). solveLine
   returns the line with every cell that is the same in all arrangements
   of the clue filled in, or null if no arrangement fits. Solving rows
   and columns in turn until nothing changes is how a person solves
   without guessing, so a puzzle this finishes is fair and has exactly
   one answer. */
function solveLine(clue, line) {
  const b = clue[0] === 0 ? [] : clue, m = b.length, n = line.length
  // fits[k][i]: blocks k.. can be placed in cells i..
  const fits = Array.from({ length: m + 1 }, () => new Array(n + 2).fill(false))
  const noFill = new Array(n + 1).fill(true)    // no forced fill in i..n-1
  for (let i = n - 1; i >= 0; i--) noFill[i] = noFill[i + 1] && line[i] !== 1
  const noGap = new Array(n + 1).fill(0)        // run of non-empty cells from i
  for (let i = n - 1; i >= 0; i--) noGap[i] = line[i] === 0 ? 0 : noGap[i + 1] + 1
  for (let i = 0; i <= n; i++) fits[m][i] = noFill[i]
  for (let k = m - 1; k >= 0; k--) {
    for (let i = n; i >= 0; i--) {
      let ok = i < n && line[i] !== 1 && fits[k][i + 1]
      const e = i + b[k]
      if (!ok && e <= n && noGap[i] >= b[k]) {
        if (e === n) ok = k === m - 1
        else ok = line[e] !== 1 && fits[k + 1][e + 1]
      }
      fits[k][i] = ok
    }
  }
  if (!fits[0][0]) return null
  // walk forward through reachable states, recording what each cell can be
  const can0 = new Array(n).fill(false), can1 = new Array(n).fill(false)
  const seen = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(false))
  const stack = [[0, 0]]; seen[0][0] = true
  while (stack.length) {
    const [k, i] = stack.pop()
    if (k === m) { for (let t = i; t < n; t++) can0[t] = true; continue }
    if (i < n && line[i] !== 1 && fits[k][i + 1]) {
      can0[i] = true
      if (!seen[k][i + 1]) { seen[k][i + 1] = true; stack.push([k, i + 1]) }
    }
    const e = i + b[k]
    if (e <= n && noGap[i] >= b[k]) {
      if (e === n && k === m - 1) {
        for (let t = i; t < e; t++) can1[t] = true
      } else if (e < n && line[e] !== 1 && fits[k + 1][e + 1]) {
        for (let t = i; t < e; t++) can1[t] = true
        can0[e] = true
        if (!seen[k + 1][e + 1]) { seen[k + 1][e + 1] = true; stack.push([k + 1, e + 1]) }
      }
    }
  }
  return line.map((v, t) => can0[t] && can1[t] ? -1 : can1[t] ? 1 : 0)
}

// The grid as far as line logic gets, with -1 where it's stuck, and how
// many sweeps over the rows and columns that took.
function solve(rowClues, colClues) {
  const R = rowClues.length, C = colClues.length
  const g = Array.from({ length: R }, () => new Array(C).fill(-1))
  let dirtyR = new Set(g.keys()), dirtyC = new Set(colClues.keys()), sweeps = 0
  while (dirtyR.size || dirtyC.size) {
    sweeps++
    for (const i of dirtyR) {
      const out = solveLine(rowClues[i], g[i])
      if (!out) return null
      out.forEach((v, j) => { if (v !== g[i][j]) { g[i][j] = v; dirtyC.add(j) } })
    }
    dirtyR = new Set()
    for (const j of dirtyC) {
      const out = solveLine(colClues[j], g.map(r => r[j]))
      if (!out) return null
      out.forEach((v, i) => { if (v !== g[i][j]) { g[i][j] = v; dirtyR.add(i) } })
    }
    dirtyC = new Set()
  }
  g.sweeps = sweeps
  return g
}

const unknowns = g => g.reduce((s, r) => s + r.filter(v => v === -1).length, 0)
const cluesOf = T => [T.map(clueOf), T[0].map((_, j) => clueOf(T.map(r => r[j])))]

/* Greedy: while line logic gets stuck, try flipping each cell it is stuck
   on and keep the flip that unsticks the most, preferring cells whose
   shade was close to the threshold anyway, so the picture changes as
   little as possible. */
function makeSolvable(T, gray, thr) {
  T = T.map(r => r.slice())
  const flipped = new Set()
  let g = solve(...cluesOf(T)), left = unknowns(g)
  const stuck = left
  for (let step = 0; left && step < 60; step++) {
    let best = null
    for (let i = 0; i < T.length; i++) for (let j = 0; j < T[0].length; j++) {
      if (g[i][j] !== -1) continue
      T[i][j] ^= 1
      const s = unknowns(solve(...cluesOf(T)))
      T[i][j] ^= 1
      const cost = Math.abs(gray[i][j] - thr)
      if (!best || s < best.s || (s === best.s && cost < best.cost)) best = { i, j, s, cost }
    }
    T[best.i][best.j] ^= 1
    const key = best.i + "," + best.j
    flipped.has(key) ? flipped.delete(key) : flipped.add(key)
    g = solve(...cluesOf(T)); left = unknowns(g)
  }
  return { T, flipped, solved: left === 0, stuck, sweeps: g.sweeps }
}

/* ── picture to grid ──────────────────────────────────────────────── */

// The background is the median shade around the edge. Crop away border
// rows and columns that are all background.
function cropBox(lum, w, h) {
  const edge = []
  for (let x = 0; x < w; x++) edge.push(lum[x], lum[(h - 1) * w + x])
  for (let y = 0; y < h; y++) edge.push(lum[y * w], lum[y * w + w - 1])
  edge.sort((a, b) => a - b)
  const bg = edge[edge.length >> 1]
  const busy = (x0, y0, x1, y1) => {
    let n = 0, t = 0
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { t++; if (Math.abs(lum[y * w + x] - bg) > 40) n++ }
    return n / t > 0.01
  }
  let top = 0, bot = h, lef = 0, rig = w
  while (top < bot - 1 && !busy(0, top, w, top + 1)) top++
  while (bot > top + 1 && !busy(0, bot - 1, w, bot)) bot--
  while (lef < rig - 1 && !busy(lef, top, lef + 1, bot)) lef++
  while (rig > lef + 1 && !busy(rig - 1, top, rig, bot)) rig--
  return { bg, box: [lef, top, rig, bot] }
}

// Square the crop around the subject, padding with background, and
// average every pixel into its cell. `square` is the crop in pixels.
function shrink(lum, w, h, N) {
  const { bg, box: [x0, y0, x1, y1] } = cropBox(lum, w, h)
  const side = Math.max(x1 - x0, y1 - y0)
  const sx = (x0 + x1) / 2 - side / 2, sy = (y0 + y1) / 2 - side / 2
  const sum = Array.from({ length: N }, () => new Array(N).fill(0))
  const cnt = Array.from({ length: N }, () => new Array(N).fill(0))
  for (let y = 0; y < Math.ceil(side); y++) for (let x = 0; x < Math.ceil(side); x++) {
    const px = Math.floor(sx + x), py = Math.floor(sy + y)
    const v = (px >= 0 && py >= 0 && px < w && py < h) ? lum[py * w + px] : bg
    const i = Math.min(N - 1, Math.floor(y * N / side)), j = Math.min(N - 1, Math.floor(x * N / side))
    sum[i][j] += v; cnt[i][j]++
  }
  const gray = sum.map((r, i) => r.map((s, j) => s / cnt[i][j]))
  return { gray, bg, square: [sx, sy, side] }
}

// Otsu's threshold, and how cleanly it splits the shades: the share of
// all variance that lies between the two sides (1 = pure two-tone).
function otsu(values) {
  const hist = new Array(256).fill(0)
  values.forEach(v => hist[Math.max(0, Math.min(255, Math.round(v)))]++)
  const total = values.length
  let sum = 0, sq = 0
  for (let t = 0; t < 256; t++) { sum += t * hist[t]; sq += t * t * hist[t] }
  const variance = sq / total - (sum / total) ** 2
  let sumB = 0, wB = 0, best = 0, thr = 128
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (!wB) continue
    const wF = total - wB; if (!wF) break
    sumB += t * hist[t]
    const mB = sumB / wB, mF = (sum - sumB) / wF, between = wB * wF * (mB - mF) ** 2
    if (between > best) { best = between; thr = t }
  }
  return { thr, split: variance > 1 ? best / total / total / variance : 0 }
}

const toGrid = (gray, thr, invert) => gray.map(r => r.map(v => (invert ? v > thr : v < thr) ? 1 : 0))

/* ── quality ──────────────────────────────────────────────────────────
   How good a nonogram a picture makes at N×N, with the settings
   make.html starts from. Six parts, each 0..1:

     shape    a subject standing clear of a plain background, in a few
              solid pieces. The border of the grid is mostly empty, and
              the filled squares don't break into scattered islands or
              fill their own box solid.
              This is what tells a silhouette from a photo with big
              dark areas: both split cleanly, only one reads as a thing.
     clarity  how cleanly the picture splits into light and dark, at
              full size when it's given (`lum`), since shrinking greys
              every edge. Clip art is near 1; a soft photo is a smear
              of greys, and whichever squares the threshold picks are
              arbitrary.
     clean    squares that are mostly one side or the other at full
              size, and few lone specks or pinholes. Line art and
              text fail here: crisp at full size, but every square is
              half ink and half paper, so the puzzle comes out a block.
              Specks are noise, and noise is what a busy photo turns
              into. Without `lum`, squares near the threshold count
              as mixed instead.
     faithful how few squares had to change to make it solvable
              without guessing. Every change is a lie about the picture.
     balance  filled share near half. Nearly empty or nearly full
              grids are dull, and say little about the picture.
     interest more than one run per line on average. A plain blob is
              all single runs and solves itself — fine, but easy.

   The score is a weighted geometric mean, so a picture that fails any
   one of them can't score well.                                      */

const WEIGHTS = { shape: 0.3, clarity: 0.2, clean: 0.15, faithful: 0.1, balance: 0.1, interest: 0.15 }

// Groups of filled squares touching side to side.
function islands(T) {
  const N = T.length, seen = T.map(r => r.map(() => false))
  let n = 0
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    if (!T[i][j] || seen[i][j]) continue
    n++
    const stack = [[i, j]]; seen[i][j] = true
    while (stack.length) {
      const [a, b] = stack.pop()
      for (const [c, d] of [[a - 1, b], [a + 1, b], [a, b - 1], [a, b + 1]]) {
        if (c < 0 || d < 0 || c >= N || d >= N || seen[c][d] || !T[c][d]) continue
        seen[c][d] = true; stack.push([c, d])
      }
    }
  }
  return n
}

// How much of each square lies on its own side of the threshold, at full
// size, averaged over the squares: 1 when every square is solid.
function purity(lum, w, h, [sx, sy, side], N, thr, bg) {
  const dark = Array.from({ length: N }, () => new Array(N).fill(0))
  const cnt = Array.from({ length: N }, () => new Array(N).fill(0))
  for (let y = 0; y < Math.ceil(side); y++) for (let x = 0; x < Math.ceil(side); x++) {
    const px = Math.floor(sx + x), py = Math.floor(sy + y)
    const v = (px >= 0 && py >= 0 && px < w && py < h) ? lum[py * w + px] : bg
    const i = Math.min(N - 1, Math.floor(y * N / side)), j = Math.min(N - 1, Math.floor(x * N / side))
    if (v < thr) dark[i][j]++
    cnt[i][j]++
  }
  let s = 0
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const p = dark[i][j] / cnt[i][j]
    s += Math.max(p, 1 - p)
  }
  return s / (N * N)
}

function quality(gray, bg, { repair = true, lum = null, w = 0, h = 0, square = null } = {}) {
  const N = gray.length, cells = N * N
  const { thr, split: smallSplit } = otsu(gray.flat())
  let split = smallSplit
  if (lum) {
    const step = Math.max(1, Math.floor(lum.length / 40000)), sample = []
    for (let p = 0; p < lum.length; p += step) sample.push(lum[p])
    split = otsu(sample).split
  }
  const invert = bg < thr                       // dark background, light subject
  const T0 = toGrid(gray, thr, invert)
  const res = repair ? makeSolvable(T0, gray, thr)
    : { T: T0, flipped: new Set(), solved: !unknowns(solve(...cluesOf(T0))), stuck: 0 }
  const T = res.T

  const spread = Math.max(1, Math.abs(bg - thr))
  const edgy = gray.flat().filter(v => Math.abs(v - thr) < 0.15 * spread + 8).length / cells
  let specks = 0
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const nb = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]
      .filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N)
    if (nb.every(([a, b]) => T[a][b] !== T[i][j])) specks++
  }
  const filled = T.flat().filter(v => v).length / cells
  const [rc, cc] = cluesOf(T)
  const runs = [...rc, ...cc].reduce((s, c) => s + (c[0] ? c.length : 0), 0) / (2 * N)

  const ring = []
  for (let k = 0; k < N; k++) ring.push(T[0][k], T[N - 1][k], T[k][0], T[k][N - 1])
  const framed = ring.filter(v => !v).length / ring.length
  const pieces = islands(T)
  // share of the filled squares inside the biggest solid rectangle; a
  // block (what dense line art and text shrink to) is near 1 and says
  // nothing, where a heart or a cat can't fit much into one rectangle
  const up = T.map(r => r.slice())
  for (let i = 1; i < N; i++) for (let j = 0; j < N; j++) if (up[i][j]) up[i][j] += up[i - 1][j]
  let rect = 0
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    let hgt = Infinity
    for (let k = j; k < N && up[i][k]; k++) {
      hgt = Math.min(hgt, up[i][k]); rect = Math.max(rect, hgt * (k - j + 1))
    }
  }
  const boxy = filled ? rect / (filled * cells) : 1

  const clamp = x => Math.max(0, Math.min(1, x))
  const parts = {
    shape: (0.15 + 0.85 * framed ** 2) / (1 + Math.max(0, pieces - 3) / 4)
      * (1 - 2.5 * Math.max(0, boxy - 0.6)),
    clarity: clamp((split - 0.5) / 0.4),
    clean: (lum && square
      ? clamp((purity(lum, w, h, square, N, thr, bg) - 0.7) / 0.25)
      : Math.exp(-3 * edgy)) * Math.exp(-12 * specks / cells),
    faithful: res.solved ? 1 / (1 + res.flipped.size / (cells / 50)) : 0,
    balance: clamp(1 - ((filled - 0.5) / 0.4) ** 2),
    interest: clamp(0.3 + 0.7 * (runs - 0.8) / 1.2),
  }
  let total = 1
  for (const [k, wt] of Object.entries(WEIGHTS)) total *= Math.max(1e-3, parts[k]) ** wt

  return {
    score: Math.round(100 * total), ...parts,
    N, thr, invert, T, flipped: res.flipped, solved: res.solved,
    changed: res.flipped.size, stuck: res.stuck, filled, runs, specks,
    framed, pieces, boxy,
  }
}

const rowsOf = T => T.map(r => r.map(v => v ? "#" : ".").join(""))

globalThis.Nonogram = {
  clueOf, solveLine, solve, unknowns, cluesOf, makeSolvable,
  cropBox, shrink, otsu, toGrid, quality, rowsOf, WEIGHTS,
}
})()

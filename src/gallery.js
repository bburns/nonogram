/* One self-contained HTML page of ranked pictures. Thumbnails and
   puzzles arrive as data URLs, so the page works offline and can be
   moved around without its pictures. File and folder names link to
   the originals, which only works while they're where they were.
   Adapted from jigsaw's gallery.js.                                  */

import { pathToFileURL } from "node:url"
import { resolve, dirname } from "node:path"

const esc = s => String(s).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c])

const tier = s => s >= 78 ? "good" : s >= 68 ? "fair" : "hard"
const TIER = { good: "Good puzzle", fair: "Workable", hard: "Mostly noise" }

function card(r, i) {
  const parts = r.file.split(/[\\/]/)
  const name = parts.pop()
  const dir = parts.slice(-3).join(" / ")
  const url = p => esc(pathToFileURL(resolve(p)).href)
  const bar = (label, v, tip) => `
      <div class="bar" title="${tip}">
        <span>${label}</span>
        <i><b style="width:${Math.round(100 * v)}%"></b></i>
        <em>${Math.round(100 * v)}</em>
      </div>`
  return `
  <article class="card ${tier(r.score)}" data-score="${r.score}"
    data-shape="${r.shape}" data-clarity="${r.clarity}" data-clean="${r.clean}"
    data-faithful="${r.faithful}" data-balance="${r.balance}"
    data-interest="${r.interest}" data-rank="${i}">
    <button class="pic" aria-label="Toggle the puzzle">
      <img class="photo" src="${r.thumb}" alt="" loading="lazy">
      <img class="heat" src="${r.puzzle}" alt="" loading="lazy">
    </button>
    <div class="body">
      <div class="head">
        <div class="score">${r.score}</div>
        <div>
          <div class="tier">${TIER[tier(r.score)]}</div>
          <div class="meta">${r.size}×${r.size} ·
            ${r.changed ? `${r.changed} square${r.changed > 1 ? "s" : ""} changed` : "nothing changed"}</div>
        </div>
      </div>
      ${bar("Shape", r.shape, "A subject clear of a plain background, in a few solid pieces")}
      ${bar("Clarity", r.clarity, "How cleanly it splits into light and dark")}
      ${bar("Clean", r.clean, "Few borderline squares, lone specks or pinholes")}
      ${bar("Faithful", r.faithful, "How few squares changed to make it solvable")}
      ${bar("Balance", r.balance, "Filled share near half")}
      ${bar("Interest", r.interest, "More than one run per line")}
      <details class="rows"><summary>Rows for index.html</summary><pre>${(r.rows || []).map(x => `"${x}",`).join("\n")}</pre></details>
      <div class="file" title="${esc(r.file)}">
        <a class="dir" href="${url(dirname(r.file))}">${esc(dir)}</a>
        <a class="name" href="${url(r.file)}">${esc(name)}</a>
      </div>
    </div>
  </article>`
}

export function gallery(results, { size }) {
  const when = new Date().toISOString().slice(0, 10)
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nonogram Picks</title>
<style>
:root {
  --bg: #f4efe6; --card: #fffdf8; --ink: #2b2620; --muted: #7a7064;
  --line: #e2d9ca; --track: #ece4d6; --bar: #5b6f8f;
  --good: #3f7d4e; --fair: #b07a1e; --hard: #b0463a;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #1b1916; --card: #25221e; --ink: #ece6dc; --muted: #a0968a;
    --line: #37322b; --track: #34302a; --bar: #8ea3c4;
    --good: #6cb07c; --fair: #d9a646; --hard: #e07565;
  }
}
:root[data-theme="dark"] {
  --bg: #1b1916; --card: #25221e; --ink: #ece6dc; --muted: #a0968a;
  --line: #37322b; --track: #34302a; --bar: #8ea3c4;
  --good: #6cb07c; --fair: #d9a646; --hard: #e07565;
}
* { box-sizing: border-box }
body {
  margin: 0; background: var(--bg); color: var(--ink);
  font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
}
header, main { max-width: 1200px; margin: 0 auto; padding: 0 16px }
header { padding-top: 32px; padding-bottom: 8px }
h1 {
  font: 600 30px/1.1 Georgia, "Times New Roman", serif; margin: 0 0 6px;
}
.sub { color: var(--muted); margin: 0 0 18px; max-width: 70ch }
.controls { display: flex; flex-wrap: wrap; gap: 10px; align-items: center }
.controls label { color: var(--muted); font-size: 14px }
select, .toggle {
  font: inherit; font-size: 14px; color: var(--ink); background: var(--card);
  border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px;
}
.toggle { cursor: pointer }
.toggle[aria-pressed="true"] { border-color: var(--hard); color: var(--hard) }
.legend { display: flex; gap: 14px; font-size: 13px; color: var(--muted) }
.legend span::before {
  content: ""; display: inline-block; width: 9px; height: 9px;
  border-radius: 50%; margin-right: 5px; background: var(--c);
}
main {
  display: grid; gap: 18px; padding-top: 18px; padding-bottom: 48px;
  grid-template-columns:
    repeat(auto-fill, minmax(min(280px, 100%), 1fr));
}
.card {
  background: var(--card); border: 1px solid var(--line);
  border-radius: 12px; overflow: hidden; display: flex;
  flex-direction: column;
}
.pic {
  position: relative; display: block; padding: 0; border: 0;
  background: var(--track); aspect-ratio: 1; cursor: pointer; width: 100%;
}
.rows summary { font-size: 12px; color: var(--muted); cursor: pointer }
.rows pre { font-size: 11px; line-height: 1.25; margin: 6px 0 0 }
.pic img {
  position: absolute; inset: 0; width: 100%; height: 100%;
  object-fit: contain; transition: opacity .2s;
}
.heat { opacity: 0 }
.card.show .heat, body.all .heat { opacity: 1 }
body.all .card.show .heat { opacity: 0 }
.body { padding: 12px 14px 14px; display: grid; gap: 6px }
.head { display: flex; gap: 12px; align-items: center; margin-bottom: 4px }
.score {
  font: 600 34px/1 Georgia, serif; min-width: 52px; text-align: center;
  color: var(--t); font-variant-numeric: tabular-nums;
}
.good { --t: var(--good) } .fair { --t: var(--fair) } .hard { --t: var(--hard) }
.tier { font-weight: 600; color: var(--t) }
.meta { font-size: 13px; color: var(--muted) }
.bar {
  display: grid; grid-template-columns: 62px 1fr 26px; gap: 8px;
  align-items: center; font-size: 13px; color: var(--muted);
}
.bar i {
  height: 6px; background: var(--track); border-radius: 3px;
  overflow: hidden;
}
.bar b { display: block; height: 100%; background: var(--bar) }
.bar em {
  font-style: normal; text-align: right; color: var(--ink);
  font-variant-numeric: tabular-nums;
}
.file {
  margin-top: 6px; font-size: 12px; color: var(--muted);
  display: grid; min-width: 0;
}
.file a {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  color: inherit; text-decoration: none;
}
.file a:hover { text-decoration: underline }
.file .name { color: var(--ink) }
footer {
  max-width: 1200px; margin: 0 auto; padding: 0 16px 40px;
  color: var(--muted); font-size: 13px;
}
</style>
</head>
<body>
<header>
  <h1>Nonogram Picks</h1>
  <p class="sub">${results.length} pictures scored for how well they'd
    work as a ${size}×${size} nonogram. Tap a picture to see the puzzle
    it makes. Squares changed to make it solvable without guessing
    are gold.</p>
  <div class="controls">
    <label>Sort by
      <select id="sort">
        <option value="score">Overall</option>
        <option value="shape">Shape</option>
        <option value="clarity">Clarity</option>
        <option value="clean">Clean</option>
        <option value="faithful">Faithful</option>
        <option value="balance">Balance</option>
        <option value="interest">Interest</option>
      </select>
    </label>
    <button class="toggle" id="all" aria-pressed="false">Show all
      puzzles</button>
    <div class="legend">
      <span style="--c:var(--good)">78+ good</span>
      <span style="--c:var(--fair)">68–77 workable</span>
      <span style="--c:var(--hard)">under 68 mostly noise</span>
    </div>
  </div>
</header>
<main id="grid">${results.map(card).join("")}
</main>
<footer>Generated ${when} by src/rank.js.</footer>
<script>
const grid = document.getElementById("grid")
grid.addEventListener("click", e => {
  const b = e.target.closest(".pic")
  if (b) b.parentElement.classList.toggle("show")
})
document.getElementById("all").addEventListener("click", e => {
  const on = document.body.classList.toggle("all")
  e.currentTarget.setAttribute("aria-pressed", on)
  for (const c of grid.children) c.classList.remove("show")
})
document.getElementById("sort").addEventListener("change", e => {
  const k = e.target.value
  ;[...grid.children]
    .sort((a, b) => b.dataset[k] - a.dataset[k])
    .forEach(c => grid.append(c))
})
</script>
</body>
</html>
`
}

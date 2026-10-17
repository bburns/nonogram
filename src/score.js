#!/usr/bin/env node
/* Score every picture under a folder and keep the results in each
   folder's .props.yaml (see props.js), under the `nonogram` group.
   Adapted from jigsaw's score.js; the two share sidecars, each keeping
   to its own group.

     node score.js <folders...> [options]

     --list FILE     also score the folders listed in FILE, and skip its
                     excludes (see folders.js); ../folders.txt is used
                     when no folders are given
     --exclude NAME  skip folders with this name at any depth, or just
                     this folder if it's a path (repeatable)
     --dry-run       report what would be scored; write nothing
     --limit N       stop after scoring N pictures
     --force         rescore even pictures whose scores are current
     --log FILE      append the report to FILE (default ../out/score.log)
     --no-log        don't write a log

   Each finished folder gets a line on the console and in the log. In a
   terminal, a status line also shows the folder being worked on.

   Safe to stop and rerun: a picture is only scored again if it has no
   score, its file changed, or the scorer's VERSION moved on. Sidecars
   are saved every CHUNK pictures, so an interruption loses little.  */

import { readdir, stat } from "node:fs/promises"
import { appendFileSync, mkdirSync } from "node:fs"
import { join, extname, resolve, sep, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import os from "node:os"
import { EXT, GROUP, VERSION, load, pool, score } from "./image.js"
import * as props from "./props.js"
import { readList, readDefault, skipper } from "./folders.js"

const SIZE = 15           // one fixed size, so scores compare
const CHUNK = 50
const LOG = join(dirname(fileURLToPath(import.meta.url)), "..", "out",
  "score.log")

function args(argv) {
  const o = { roots: [], list: null, exclude: [], dry: false,
    limit: Infinity, force: false, log: LOG }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--list") o.list = argv[++i]
    else if (a === "--exclude") o.exclude.push(argv[++i])
    else if (a === "--dry-run") o.dry = true
    else if (a === "--limit") o.limit = +argv[++i]
    else if (a === "--force") o.force = true
    else if (a === "--log") o.log = argv[++i]
    else if (a === "--no-log") o.log = null
    else o.roots.push(a)
  }
  return o
}

async function* folders(dir, skip) {
  let entries
  try { entries = await readdir(dir, { withFileTypes: true }) } catch {
    return
  }
  yield { dir, entries }
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith(".")) continue
    if (e.name === "node_modules" || skip.dir(join(dir, e.name))) continue
    yield* folders(join(dir, e.name), skip)
  }
}

/* ── reporting ────────────────────────────────────────────────────── */

// The status line is rewritten in place, so it's only drawn on a
// terminal; redirected output gets just the finished-folder lines.
const tty = process.stdout.isTTY
let shown = false, drawn = 0

function status(text, force = false) {
  if (!tty || (!force && Date.now() - drawn < 100)) return
  const w = (process.stdout.columns || 80) - 1
  const t = text.length > w ? text.slice(0, 20) + "…" + text.slice(-(w - 21))
    : text
  process.stdout.write("\r" + t + "\x1b[K")
  shown = true; drawn = Date.now()
}

let logFile = null
function say(line = "") {
  if (shown) { process.stdout.write("\r\x1b[K"); shown = false }
  console.log(line)
  if (logFile) {
    try { appendFileSync(logFile, line + "\n") } catch {}
  }
}

const elapsed = t0 => `[${((Date.now() - t0) / 1000).toFixed(0)}s]`

const pct = x => Math.round(100 * x)
const today = () => new Date().toISOString().slice(0, 10)

function current(side, name, force) {
  if (force) return false
  const g = props.get(side, name, GROUP)
  return g && g.version === VERSION && g.size === SIZE
}

async function run(o) {
  const t0 = Date.now()
  const total = { folders: 0, scored: 0, kept: 0, failed: 0, small: 0,
    moved: 0, unsaved: 0 }

  for (const root of o.roots) {
    for await (const { dir, entries } of folders(root, o.skip)) {
      status(`${elapsed(t0)}  checking  ${dir}`)
      const pics = entries.filter(e => e.isFile()
        && EXT.has(extname(e.name).toLowerCase())).map(e => e.name)
      if (!pics.length) continue

      const present = new Map()
      for (const n of pics) {
        try { present.set(n, props.fingerprint(await stat(join(dir, n)))) }
        catch {}
      }
      const side = await props.open(dir)
      const { moved } = props.reattach(side, present)
      for (const [n, fp] of present) props.touch(side, n, fp)

      const todo = [...present.keys()].filter(n => !current(side, n, o.force))
        .slice(0, Math.max(0, o.limit - total.scored))
      const kept = present.size - todo.length
      total.kept += kept; total.moved += moved.length

      if (o.dry) {
        if (todo.length || moved.length) {
          say(`${String(todo.length).padStart(5)} to score  `
            + `${String(kept).padStart(4)} current  ${dir}`)
        }
        total.scored += todo.length; total.folders++
        continue
      }

      // A save that fails even after props.save's retries leaves the
      // document dirty, so the next save carries those scores too. Only
      // the folder's last save failing loses anything — and the next
      // run rescores just those.
      let unsaved = null
      const trySave = async () => {
        try { await props.save(side); unsaved = null } catch (e) { unsaved = e }
      }

      let scored = 0, failed = 0, small = 0
      const progress = force => status(`${elapsed(t0)}  `
        + `${scored + failed + small}/${todo.length}  ${dir}`, force)
      if (todo.length) progress(true)
      for (let i = 0; i < todo.length; i += CHUNK) {
        await pool(todo.slice(i, i + CHUNK), 4, async n => {
          try {
            const r = score(await load(join(dir, n)), SIZE)
            props.set(side, n, GROUP, {
              score: r.score, shape: pct(r.shape), clarity: pct(r.clarity),
              clean: pct(r.clean), faithful: pct(r.faithful),
              balance: pct(r.balance), interest: pct(r.interest),
              changed: r.changed, size: SIZE,
              version: VERSION, scored: today(),
            })
            scored++
          } catch (e) {
            // Recorded, so a broken or tiny file isn't retried on every
            // run — only when it changes or the scorer does. Tiny ones
            // are only counted: icons can run to thousands.
            const msg = e.message.split("\n")[0]
            const tiny = e.code === "TOO_SMALL"
            if (!tiny) say(`  failed: ${join(dir, n)}: ${msg}`)
            props.set(side, n, GROUP, { [tiny ? "skipped" : "error"]: msg,
              size: SIZE, version: VERSION, scored: today() })
            if (tiny) small++; else failed++
          }
          progress()
        })
        await trySave()
      }
      await trySave()          // fingerprints/renames even if none scored
      if (unsaved) total.unsaved++

      total.scored += scored; total.failed += failed; total.small += small
      if (todo.length || moved.length) {
        total.folders++
        say(`${String(scored).padStart(5)} scored  `
          + `${String(kept).padStart(4)} current`
          + (failed ? `  ${failed} failed` : "")
          + (small ? `  ${small} too small` : "")
          + (moved.length ? `  ${moved.length} renamed` : "")
          + (unsaved ? `  NOT SAVED (${unsaved.code || unsaved.message})` : "")
          + `  ${elapsed(t0)}  ${dir}`)
      }
      if (total.scored >= o.limit) break
    }
  }

  const secs = (Date.now() - t0) / 1000
  say()
  say(`${o.dry ? "would score" : "scored"} ${total.scored}`
    + ` in ${total.folders} folders, ${total.kept} already current`
    + (total.failed ? `, ${total.failed} failed` : "")
    + (total.small ? `, ${total.small} too small` : "")
    + (total.moved ? `, ${total.moved} renames followed` : "")
    + (total.unsaved ? `, ${total.unsaved} folders not saved (rerun)` : "")
    + ` — ${secs.toFixed(0)}s`)
}

// Walking is recursive, so a folder listed under another listed folder
// would be visited twice. Drop it, and say which folders don't exist
// rather than silently scoring nothing for them.
async function roots(paths) {
  const ok = []
  for (const p of paths) {
    const s = await stat(p).catch(() => null)
    if (s?.isDirectory()) ok.push(resolve(p))
    else console.error(`not a folder, skipped: ${p}`)
  }
  const key = p => p.toLowerCase() + sep
  return [...new Set(ok)].filter(p =>
    !ok.some(q => q !== p && key(p).startsWith(key(q))))
}

const o = args(process.argv.slice(2))
const list = o.list ? await readList(o.list)
  : o.roots.length ? null : await readDefault()
if (list) { o.roots.push(...list.roots); o.exclude.push(...list.exclude) }
o.skip = skipper(o.exclude)
o.roots = await roots(o.roots)
if (!o.roots.length) {
  console.error("usage: node score.js <folders...> [--list FILE]"
    + " [--exclude NAME] [--dry-run] [--limit N] [--force]")
  process.exit(1)
}
// A background job: let anything interactive go first.
try { os.setPriority(os.constants.priority.PRIORITY_LOW) } catch {}
if (o.log && !o.dry) {
  mkdirSync(dirname(o.log), { recursive: true })
  logFile = o.log
  const now = new Date().toLocaleString("sv").slice(0, 16)
  appendFileSync(logFile, `\n== ${now}  ${o.roots.join("  ")}\n`)
}
run(o)

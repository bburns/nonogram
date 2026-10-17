/* ══ .props.yaml ══════════════════════════════════════════════════════
   Per-file properties, kept in one sidecar per folder and keyed by
   filename. Each tool owns a named group under the file and rewrites
   only that group, so scorers don't trample each other or hand edits:

     daisies.jpg:
       file: { size: 482113, modified: 2019-06-02T14:11:05Z }
       puzzle: { score: 59, distinct: 44, ..., version: 1, scored: ... }

   `file` is the fingerprint the groups were computed against. When it
   stops matching, the file has changed and every group is suspect.
   Documents are edited in place with the yaml library's Document API,
   so comments and ordering survive a rewrite.                         */

import { readFile, writeFile, rename, unlink } from "node:fs/promises"
import { join, dirname } from "node:path"
import YAML from "yaml"

export const SIDECAR = ".props.yaml"

const HEADER = " Per-file properties, keyed by filename. Tools rewrite only"
  + " their own group;\n hand edits elsewhere are kept."

export async function open(dir) {
  const path = join(dir, SIDECAR)
  let text = null
  try { text = await readFile(path, "utf8") } catch {}
  const doc = YAML.parseDocument(text ?? "")
  if (!YAML.isMap(doc.contents)) doc.contents = doc.createNode({})
  if (text == null) doc.commentBefore = HEADER
  return { path, doc, dirty: false, existed: text != null }
}

export async function save(side) {
  if (!side.dirty) return false
  // Write beside and rename, so a crash mid-write can't leave a
  // truncated sidecar that loses every other tool's properties. The
  // `~*.tmp` name is one Dropbox doesn't sync, so it never uploads (or
  // holds open) the half-written copy.
  const tmp = join(dirname(side.path), "~props.yaml.tmp")
  await writeFile(tmp, side.doc.toString({ lineWidth: 0 }))
  try {
    await renameRetrying(tmp, side.path)
  } catch (e) {
    await unlink(tmp).catch(() => {})
    throw e
  }
  side.dirty = false
  return true
}

// Windows won't replace a file another process has open, and Dropbox
// or a virus scanner opens a sidecar right after it's written. Those
// locks last a moment, so back off and try again for ~15s.
async function renameRetrying(from, to) {
  for (let wait = 50; ; wait *= 2) {
    try { return await rename(from, to) } catch (e) {
      if (!["EPERM", "EACCES", "EBUSY"].includes(e.code) || wait > 8000)
        throw e
      await new Promise(r => setTimeout(r, wait))
    }
  }
}

// Seconds are plenty, and some filesystems don't keep milliseconds.
export const fingerprint = st => ({
  size: st.size,
  modified: new Date(Math.floor(st.mtimeMs / 1000) * 1000)
    .toISOString().replace(".000Z", "Z"),
})

const same = (a, b) => a && b && a.size === b.size
  && a.modified === b.modified

export const names = side => side.doc.contents.items
  .map(p => String(p.key?.value ?? p.key))

export const get = (side, name, group) => {
  const v = side.doc.getIn([name, group])
  return YAML.isNode(v) ? v.toJSON() : v
}

// Flow style keeps one group to a line or two, which is what makes a
// folder of hundreds of entries skimmable.
export function set(side, name, group, value) {
  const node = side.doc.createNode(value, { flow: true })
  if (!side.doc.hasIn([name])) side.doc.set(name, side.doc.createNode({}))
  side.doc.setIn([name, group], node)
  side.dirty = true
}

// Stamp the fingerprint. If it changed, computed groups describe a
// different picture now, so they go and each tool recomputes its own.
// A group counts as computed if it carries a `version`; anything else
// (tags, notes) was written by hand and outlives edits to the file.
export function touch(side, name, fp) {
  const old = get(side, name, "file")
  if (same(old, fp)) return false
  if (old) {
    const entry = side.doc.get(name)
    for (const p of [...entry.items]) {
      const k = String(p.key?.value ?? p.key)
      if (YAML.isMap(p.value) && p.value.has("version")) entry.delete(k)
    }
  }
  set(side, name, "file", fp)
  return true
}

// A renamed file shows up as one entry with no file and one file with
// no entry. Pair them up by fingerprint — but only when the match is
// unique, since duplicates in the same folder are common with photos.
export function reattach(side, present) {
  const known = new Set(names(side))
  const orphans = names(side).filter(n => !present.has(n))
  const fresh = [...present.keys()].filter(n => !known.has(n))
  const moved = []
  for (const n of fresh) {
    const fp = present.get(n)
    const hits = orphans.filter(o => same(get(side, o, "file"), fp))
    const rivals = fresh.filter(f => same(present.get(f), fp))
    if (hits.length !== 1 || rivals.length !== 1) continue
    const pair = side.doc.contents.items
      .find(p => String(p.key?.value ?? p.key) === hits[0])
    pair.key = side.doc.createNode(n)
    orphans.splice(orphans.indexOf(hits[0]), 1)
    moved.push([hits[0], n])
    side.dirty = true
  }
  return { moved, orphans }
}

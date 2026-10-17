/* Which folders to scan, from a list file shared by rank.js and
   score.js. One entry per line:

     D:\Photos             a folder to scan, with its subfolders
     -screenshots          skip folders with this name, at any depth
     -D:\Photos\2019\Phone skip just this folder (anything with a
                           slash, backslash or colon is a path)
     # comment             blank lines and comments are ignored

   Quotes and trailing backslashes, as Explorer's "Copy as path" gives
   them, are fine. Relative paths are taken from the list file's folder.
   folders.txt in the project folder is used when no folders are
   given.                                                             */

import { readFile, stat } from "node:fs/promises"
import { resolve, dirname, basename, join } from "node:path"
import { fileURLToPath } from "node:url"

export const DEFAULT = join(dirname(fileURLToPath(import.meta.url)),
  "..", "folders.txt")

const clean = s => s.trim().replace(/^"(.*)"$/, "$1").replace(/[\\/]+$/, "")
const isPath = s => /[\\/:]/.test(s)

export async function readList(file) {
  const base = dirname(resolve(file))
  const roots = [], exclude = []
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const l = line.trim()
    if (!l || l.startsWith("#")) continue
    const skip = l.startsWith("-")
    const p = clean(skip ? l.slice(1) : l)
    if (!p) continue
    if (skip) exclude.push(isPath(p) ? resolve(base, p) : p)
    else roots.push(resolve(base, p))
  }
  return { roots, exclude }
}

// The default list, if there is one.
export const readDefault = async () =>
  (await stat(DEFAULT).catch(() => null)) ? readList(DEFAULT) : null

// Tests for excluded folders, from a mix of names and paths. dir(p)
// checks the folder p itself — enough while walking, since excluded
// folders are never entered. file(p) checks every folder above p, for
// files named directly.
export function skipper(exclude) {
  const names = new Set(), paths = new Set()
  for (const x of exclude) {
    if (isPath(x)) paths.add(resolve(x).toLowerCase())
    else names.add(x.toLowerCase())
  }
  const dir = p => names.has(basename(p).toLowerCase())
    || paths.has(resolve(p).toLowerCase())
  const file = p => {
    for (let d = dirname(resolve(p)); ; d = dirname(d)) {
      if (dir(d)) return true
      if (dirname(d) === d) return false
    }
  }
  return { dir, file }
}

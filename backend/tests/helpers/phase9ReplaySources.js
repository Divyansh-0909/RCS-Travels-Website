import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { posix } from 'node:path'

const relativeImports = /\b(?:from\s+|import\s*\(\s*|import\s+)['"](\.[^'"]+)['"]/g
async function sourceBytes(file, read) {
  try { return { file, bytes: await read(new URL(`../../${file}`, import.meta.url)) } }
  catch (error) {
    if (error.code !== 'ENOENT' || !file.endsWith('.js')) throw error
    const typed = file.slice(0, -3) + '.ts'
    return { file: typed, bytes: await read(new URL(`../../${typed}`, import.meta.url)) }
  }
}

/** Hash the actual local import graph; tsx resolves existing .js imports to .ts when needed. */
export async function phase9ReplayDependencyHashes(roots, { read = readFile } = {}) {
  const hashes = {}, queue = [...roots]
  while (queue.length) {
    const requested = posix.normalize(queue.shift())
    if (requested.startsWith('../') || posix.isAbsolute(requested)) throw new Error('REPLAY_SOURCE_OUTSIDE_BACKEND')
    if (Object.hasOwn(hashes, requested)) continue
    const { file, bytes } = await sourceBytes(requested, read)
    if (Object.hasOwn(hashes, file)) continue
    hashes[file] = createHash('sha256').update(bytes).digest('hex')
    if (!/\.[cm]?[jt]s$/.test(file)) continue
    for (const match of bytes.toString('utf8').matchAll(relativeImports)) {
      const dependency = posix.normalize(posix.join(posix.dirname(file), match[1]))
      if (dependency.startsWith('../') || posix.isAbsolute(dependency)) throw new Error('REPLAY_SOURCE_OUTSIDE_BACKEND')
      queue.push(dependency)
    }
  }
  return Object.fromEntries(Object.entries(hashes).sort(([a], [b]) => a.localeCompare(b)))
}

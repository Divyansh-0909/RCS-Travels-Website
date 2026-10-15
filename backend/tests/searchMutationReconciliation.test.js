import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, basename, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'

test('a repeated source-identical mutation report replaces its stale status in both directions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'rcs-search-mutation-reconciliation-'))
  const output = join(root, 'output/search-s5-authorized-development')
  const script = join(root, 'backend/scripts/search-s5-mutation-reconcile.mjs')
  const file = 'services/search/questions.ts'
  const source = 'export const bounded = true;\n'
  const hash = value => createHash('sha256').update(value).digest('hex')
  const mutation = { id: '1', location: { start: { line: 1, column: 24 }, end: { line: 1, column: 28 } },
    mutatorName: 'BooleanLiteral', replacement: 'false' }
  const name = 'search-development-closure-mutation.json'
  const key = hash(JSON.stringify({ file, sourceHash: hash(source), location: mutation.location,
    mutator: mutation.mutatorName, replacement: mutation.replacement }))
  try {
    for (const directory of [output, join(root, 'backend/scripts'), join(root, 'backend/coverage'), join(root, 'backend/services/search')])
      await mkdir(directory, { recursive: true })
    await writeFile(script, await readFile(new URL('../scripts/search-s5-mutation-reconcile.mjs', import.meta.url)))
    await writeFile(join(root, 'backend', file), source)
    await writeFile(join(output, 'reviewed-equivalence-dispositions.json'), JSON.stringify({ entries: [] }))
    await writeFile(join(output, 'mutation-reconciliation.json'), JSON.stringify({ reportCounts: [], entries: [{
      key, file, sourceHash: hash(source), location: mutation.location, mutator: mutation.mutatorName,
      replacement: mutation.replacement, witnesses: [{ report: name, id: '1', status: 'Survived' }],
    }] }))
    for (const status of ['Killed', 'Survived']) {
      await writeFile(join(root, 'backend/coverage', name), JSON.stringify({ files: {
        [file]: { source, mutants: [{ ...mutation, status }] },
      } }))
      execFileSync(process.execPath, [script], { stdio: 'pipe' })
      const result = JSON.parse(await readFile(join(output, 'mutation-reconciliation.json'), 'utf8'))
      assert.equal(result.entries[0].witnesses[0].status, status)
      assert.equal(result.counts.KILLED, Number(status === 'Killed'))
      assert.equal(result.counts.PENDING_MEANINGFUL_REVIEW, Number(status === 'Survived'))
      assert.equal(result.meaningfulSurvivors, status === 'Killed' ? 0 : 'UNRESOLVED')
    }
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()))
    assert.match(basename(root), /^rcs-search-mutation-reconciliation-/)
    await rm(root, { recursive: true, force: true })
  }
})

import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import test from 'node:test'
import { developmentEnvironment } from './run.mjs'

function fixture(developmentBucket = '') {
  const projectRoot = mkdtempSync(resolve(tmpdir(), 'rcs-dev-run-'))
  for (const directory of ['backend', 'frontend', 'driver-app']) mkdirSync(resolve(projectRoot, directory))
  writeFileSync(resolve(projectRoot, 'backend/.env'), [
    'DATABASE_URL=postgresql://user:pass@localhost:5432/ordinary',
    'DEVELOPMENT_DATABASE_URL=postgresql://user:pass@localhost:5432/development',
    'DEVELOPMENT_CLERK_SECRET_KEY=sk_test_fixture',
    'DEVELOPMENT_CLERK_PUBLISHABLE_KEY=pk_test_fixture',
    'GOOGLE_MAPS_API_KEY=fixture-maps-key',
    'OPENAI_API_KEY=fixture-openai-key',
    'GCS_BUCKET=ordinary-file-bucket-must-not-cross-boundary',
    `DEVELOPMENT_GCS_BUCKET=${developmentBucket}`,
  ].join('\n'))
  writeFileSync(resolve(projectRoot, 'frontend/.env'), [
    'VITE_DEVELOPMENT_CLERK_PUBLISHABLE_KEY=pk_test_fixture',
    'VITE_GOOGLE_MAPS_API_KEY=fixture-maps-key',
  ].join('\n'))
  writeFileSync(resolve(projectRoot, 'driver-app/.env'), '')
  return projectRoot
}

function guardedEnvironment(projectRoot) {
  const backendEnv = developmentEnvironment({
    projectRoot,
    inheritedEnvironment: {
      GCS_BUCKET: 'ordinary-parent-bucket-must-not-cross-boundary',
      GOOGLE_APPLICATION_CREDENTIALS: 'ordinary-parent-credentials-must-not-cross-boundary',
    },
  }).backendEnv
  assert.equal(backendEnv.DOTENV_CONFIG_PATH, resolve(import.meta.dirname, 'empty.env'))
  return backendEnv
}

test('launcher maps only DEVELOPMENT_GCS_BUCKET into the backend', () => {
  const projectRoot = fixture('rcs-travels-driver-documents-dev')
  try {
    const backendEnv = guardedEnvironment(projectRoot)
    assert.equal(backendEnv.GCS_BUCKET, 'rcs-travels-driver-documents-dev')
    assert.equal('GOOGLE_APPLICATION_CREDENTIALS' in backendEnv, false)
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
})

test('launcher leaves document storage disabled without DEVELOPMENT_GCS_BUCKET', () => {
  const projectRoot = fixture()
  try {
    const backendEnv = guardedEnvironment(projectRoot)
    assert.equal('GCS_BUCKET' in backendEnv, false)
    assert.equal('GOOGLE_APPLICATION_CREDENTIALS' in backendEnv, false)
  } finally {
    rmSync(projectRoot, { recursive: true, force: true })
  }
})

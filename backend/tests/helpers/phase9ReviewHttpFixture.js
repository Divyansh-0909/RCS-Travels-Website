import assert from 'node:assert/strict'
import { createBrowserHarness } from './phase9BrowserHarness.js'

export async function incidentWithReplacement(t) {
  const harness = await createBrowserHarness()
  t.after(() => harness.close())
  assert.equal((await harness.lifecycle.deliver()).status, 200)
  const dispatchAt = new Date((await harness.lifecycle.booking()).scheduledAt.getTime() - 30 * 60 * 1000).toISOString()
  await harness.lifecycle.offer({ at: dispatchAt })
  await harness.lifecycle.accept()
  await harness.lifecycle.cancel(await harness.lifecycle.booking())
  await harness.lifecycle.offer({ at: dispatchAt })
  await harness.lifecycle.accept(harness.actors.replacement)
  const incident = await harness.shadow()
  assert.equal(incident.state, 'NEEDS_ADMIN_REVIEW')
  return { harness, incident }
}

export function request(harness, path, actor, body, overrides) {
  const headers = { 'content-type': 'application/json' }
  if (actor) headers.authorization = 'Bearer ' + harness.auth.token(harness.actors[actor], overrides)
  return fetch(harness.apiUrl + path, { method: body ? 'POST' : 'GET', headers,
    ...(body ? { body: JSON.stringify(body) } : {}) })
}


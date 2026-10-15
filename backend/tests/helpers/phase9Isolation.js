// Loaded only by the isolated Phase 9 child. Never import this in the application.
import net from 'node:net'
import { fileURLToPath } from 'node:url'
import { testDatabaseUrl } from './database.js'

export const PHASE9_FORBIDDEN_DATABASE = 'postgresql://denied:denied@127.0.0.1:1/phase9_forbidden'
export const PHASE9_EMPTY_ENV = fileURLToPath(new URL('./phase9-empty.env', import.meta.url))
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]'])
export function assertPhase9Environment(env) {
  if (env.PHASE9_ISOLATED !== '1' || env.DATABASE_URL !== PHASE9_FORBIDDEN_DATABASE ||
      env.DIRECT_URL !== PHASE9_FORBIDDEN_DATABASE || env.DOTENV_CONFIG_PATH !== PHASE9_EMPTY_ENV) {
    throw new Error('Phase 9 requires the dedicated isolated runner')
  }
  testDatabaseUrl(env.TEST_DATABASE_URL)
}
export function assertPhase9Connection(args) {
  const options = args[0]
  const host = typeof options === 'object' ? options.host : typeof args[1] === 'string' ? args[1] : 'localhost'
  if (!LOOPBACK.has(host ?? 'localhost') || typeof options === 'string' || options?.path) {
    throw new Error('Phase 9 forbids non-loopback connections and socket paths')
  }
}
export function installPhase9NetworkFence(env = process.env) {
  assertPhase9Environment(env)
  const connect = net.Socket.prototype.connect
  net.Socket.prototype.connect = function (...args) {
    // Node internals may pass the normalized argument array as one argument.
    assertPhase9Connection(Array.isArray(args[0]) ? args[0] : args)
    return connect.apply(this, args)
  }
}
if (process.env.PHASE9_ISOLATED === '1') installPhase9NetworkFence()

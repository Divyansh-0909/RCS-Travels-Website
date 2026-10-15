import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { createRequire } from 'node:module'

export const CODEX_MODEL = 'gpt-6-luna'
export const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex')
export const disabledFeatures = Object.freeze([
  'shell_tool', 'unified_exec', 'apps', 'plugins', 'remote_plugin', 'multi_agent',
  'multi_agent_v2', 'browser_use', 'browser_use_external', 'computer_use',
  'image_generation', 'view_image', 'hooks', 'memories', 'skill_search',
  'skill_mcp_dependency_install', 'code_mode', 'code_mode_host', 'goals', 'sleep_tool',
])
export const isolationConfig = Object.freeze({
  model_provider: 'openai', forced_login_method: 'chatgpt', web_search: 'disabled',
  model_reasoning_effort: 'low', approval_policy: 'never', project_doc_max_bytes: 0,
  mcp_servers: {}, 'apps._default.enabled': false,
  'features.skip_host_skill_discovery': true, 'features.unbounded_connection_retries': false,
})
export function isolatedEnvironment(source) {
  const allowed = new Set(['path', 'pathext', 'systemroot', 'windir', 'userprofile',
    'homedrive', 'homepath', 'home', 'temp', 'tmp', 'tmpdir', 'appdata', 'localappdata', 'codex_home'])
  return Object.fromEntries(Object.entries(source).filter(([name]) => allowed.has(name.toLowerCase())))
}
export function codexNativePath(packagePath, platform, architecture) {
  const triples = { win32: 'pc-windows-msvc', linux: 'unknown-linux-musl', darwin: 'apple-darwin' }
  const arch = architecture === 'x64' ? 'x86_64' : 'aarch64'
  return join(packagePath, '..', 'vendor', `${arch}-${triples[platform]}`, 'bin', platform === 'win32' ? 'codex.exe' : 'codex')
}
export function resolveCodexLauncher(env = process.env, platform = process.platform) {
  const path = Object.entries(env).find(([name]) => name.toLowerCase() === 'path')?.[1]
  if (!path) throw new Error('CODEX_CLI_MISSING')
  for (const directory of path.split(delimiter)) {
    const executable = join(directory, platform === 'win32' ? 'codex.exe' : 'codex')
    if (existsSync(executable)) return { command: executable, prefix: [] }
    const script = join(directory, 'node_modules', '@openai', 'codex', 'bin', 'codex.js')
    if (existsSync(script)) {
      const require = createRequire(script)
      const packagePath = require.resolve(`@openai/codex-${platform}-${process.arch}/package.json`)
      const binary = codexNativePath(packagePath, platform, process.arch)
      if (existsSync(binary)) return { command: binary, prefix: [] }
    }
  }
  throw new Error('CODEX_CLI_MISSING')
}
export function buildCodexArgs({ schemaPath, resultPath, instructionsPath }) {
  const config = { ...isolationConfig, model_instructions_file: instructionsPath }
  return ['exec', '--model', CODEX_MODEL, '--ignore-user-config', '--ignore-rules',
    '--strict-config', '--sandbox', 'read-only', '--skip-git-repo-check', '--ephemeral',
    '--output-schema', schemaPath, '--output-last-message', resultPath, '--json',
    '--color', 'never', ...Object.entries(config).flatMap(([key, value]) => ['-c', `${key}=${JSON.stringify(value)}`]),
    ...disabledFeatures.flatMap(feature => ['--disable', feature]), '-']
}
export function verifyCliHelp(help, features) {
  for (const flag of ['--model', '--ignore-user-config', '--ignore-rules', '--strict-config',
    '--sandbox', '--skip-git-repo-check', '--ephemeral', '--output-schema', '--output-last-message', '--json']) {
    if (!help.includes(flag)) throw new Error('CODEX_CLI_UNSUPPORTED_FLAG')
  }
  for (const feature of [...disabledFeatures, 'skip_host_skill_discovery', 'unbounded_connection_retries']) {
    if (!features.split('\n').some(line => line.startsWith(`${feature} `))) throw new Error('CODEX_CLI_UNSUPPORTED_ISOLATION')
  }
}

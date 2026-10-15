import { spawn } from 'node:child_process'

export function collectProcess({ command, args, cwd, env, stdin = '', timeoutMs = 120_000,
  signal, maxBytes = 1_000_000, launch = spawn, onEvent = null,
  setDeadline = setTimeout, clearDeadline = clearTimeout }) {
  return new Promise(resolve => {
    let child, timer, settled = false, reason = null, stdout = '', stderr = '', pending = ''
    const finish = (code, termination = reason) => {
      if (settled) return
      settled = true
      clearDeadline(timer)
      signal?.removeEventListener('abort', abort)
      resolve({ code, termination, stdout, stderr })
    }
    const terminate = why => {
      reason = why
      child.kill()
    }
    const abort = () => terminate('PROCESS_ABORTED')
    if (signal?.aborted) { finish(null, 'PROCESS_ABORTED'); return }
    try { child = launch(command, args, { cwd, env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }) }
    catch { finish(null, 'CODEX_CLI_MISSING'); return }
    child.on('error', error => finish(null, error.code === 'ENOENT' ? 'CODEX_CLI_MISSING' : 'PROCESS_FAILURE'))
    child.on('close', code => finish(code))
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxBytes) terminate('PROCESS_OUTPUT_LIMIT')
      if (!onEvent) return
      pending += chunk.toString()
      const lines = pending.split('\n')
      pending = lines.pop()
      for (const line of lines.filter(line => line.trim())) {
        try { if (onEvent(JSON.parse(line)) === false) terminate('UNEXPECTED_TOOL_USE') }
        catch { terminate('PROVIDER_SCHEMA_FAILURE') }
      }
    })
    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
      if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) > maxBytes) terminate('PROCESS_OUTPUT_LIMIT')
    })
    child.stdin.on('error', () => terminate('PROCESS_FAILURE'))
    timer = setDeadline(() => terminate('PROCESS_TIMEOUT'), timeoutMs)
    signal?.addEventListener('abort', abort, { once: true })
    child.stdin.end(stdin)
  })
}

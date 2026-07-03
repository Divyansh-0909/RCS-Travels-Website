// Frees the backend's port before (re)starting the dev server, so a leftover /
// orphaned node process never causes EADDRINUSE. Cross-platform, no deps:
// Windows uses netstat/taskkill, POSIX uses lsof/kill.
import { execSync } from 'node:child_process'

const port = process.argv[2] || process.env.PORT || 5000

function pidsOnPort(p) {
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' })
      const pids = new Set()
      for (const line of out.split('\n')) {
        const parts = line.trim().split(/\s+/)
        // Proto  Local Address  Foreign Address  State  PID
        if (parts.length >= 5 && parts[0] === 'TCP' && /LISTENING/i.test(parts[3]) && parts[1].endsWith(`:${p}`)) {
          if (parts[4] !== '0') pids.add(parts[4])
        }
      }
      return [...pids]
    }
    const out = execSync(`lsof -ti tcp:${p} -sTCP:LISTEN`, { encoding: 'utf8' })
    return out.split('\n').map((s) => s.trim()).filter(Boolean)
  } catch {
    return [] // no matching listener (or the tool isn't available) — nothing to free
  }
}

const pids = pidsOnPort(port)
if (pids.length === 0) {
  console.log(`Port ${port} is free`)
} else {
  for (const pid of pids) {
    try {
      if (process.platform === 'win32') execSync(`taskkill /PID ${pid} /F /T`)
      else execSync(`kill -9 ${pid}`)
      console.log(`Freed port ${port} (killed PID ${pid})`)
    } catch (e) {
      console.warn(`Could not kill PID ${pid}: ${e.message}`)
    }
  }
}

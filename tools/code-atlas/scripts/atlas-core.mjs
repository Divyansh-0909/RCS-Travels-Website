import path from 'node:path'

const CODE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx'])

export const toPosix = value => value.replaceAll('\\', '/')

export function surfaceFor(relativePath) {
  const value = toPosix(relativePath)
  if (value.startsWith('frontend/')) return 'website'
  if (value.startsWith('driver-app/')) return 'captain-app'
  if (value.startsWith('backend/')) return 'backend'
  if (value.startsWith('shared/')) return 'shared'
  return 'project'
}

export function shouldScan(relativePath) {
  const value = `/${toPosix(relativePath).toLowerCase()}/`
  if (/\/(node_modules|dist|build|coverage|assets|public|migrations|\.git)\//.test(value)) return false
  const base = path.posix.basename(toPosix(relativePath)).toLowerCase()
  if (base.startsWith('.env') || base === 'theme.generated.css') return false
  return CODE_EXTENSIONS.has(path.extname(base))
}

export function slug(...parts) {
  return parts.join(':').replace(/[^a-zA-Z0-9_./:@*-]+/g, '-').replace(/-+/g, '-')
}

export function normalizeApiPath(input) {
  if (!input) return '/'
  let value = String(input).trim()
  value = value.replace(/^https?:\/\/[^/]+/i, '')
  value = value.split('?')[0].split('#')[0]
  value = value.replace(/\$\{\s*encodeURIComponent\(([^)]+)\)\s*\}/g, (_, name) => `:${lastName(name)}`)
  value = value.replace(/\$\{\s*([^}]+)\s*\}/g, (_, name) => `:${lastName(name)}`)
  value = value.replace(/:([A-Za-z_$][\w$]*)\([^/)]*\)/g, ':$1')
  value = value.replace(/\*+/g, ':wildcard')
  value = value.replace(/\/+/, '/').replace(/\/{2,}/g, '/')
  if (!value.startsWith('/')) value = `/${value}`
  if (value.length > 1) value = value.replace(/\/$/, '')
  return value
}

function lastName(value) {
  const names = String(value).match(/[A-Za-z_$][\w$]*/g)
  return names?.at(-1) || 'param'
}

export function apiMatchKey(method, apiPath) {
  return `${String(method || 'GET').toUpperCase()} ${normalizeApiPath(apiPath).replace(/:[^/]+/g, ':param')}`
}

export function joinApiPaths(base, child) {
  if (!base) return normalizeApiPath(child)
  if (!child || child === '/') return normalizeApiPath(base)
  return normalizeApiPath(`${base}/${String(child).replace(/^\//, '')}`)
}

export function expressionPath(node) {
  if (!node) return null
  const kind = node.getKindName()
  if (kind === 'StringLiteral' || kind === 'NoSubstitutionTemplateLiteral') return normalizeApiPath(node.getLiteralText())
  if (kind === 'TemplateExpression') {
    let text = node.getHead().getLiteralText()
    for (const span of node.getTemplateSpans()) {
      const expression = span.getExpression().getText()
      // Query-builder interpolations do not change route identity. Replacing
      // them with a path parameter would incorrectly turn `/rides${toQuery()}`
      // into `/rides:param` and prevent a match with the Express route.
      const isQueryInterpolation = /^toQuery\s*\(/.test(expression) || /["'`]\?/.test(expression)
      text += `${isQueryInterpolation ? '' : `:${lastName(expression)}`}${span.getLiteral().getLiteralText()}`
    }
    return normalizeApiPath(text)
  }
  return null
}

export function methodFromOptions(node) {
  if (!node?.getText) return 'GET'
  const text = node.getText()
  const match = text.match(/\bmethod\s*:\s*['"`]([A-Za-z]+)['"`]/)
  return (match?.[1] || 'GET').toUpperCase()
}

export function stableUnique(items, key = item => item.id) {
  const byKey = new Map()
  for (const item of items) if (!byKey.has(key(item))) byKey.set(key(item), item)
  return [...byKey.values()].sort((a, b) => key(a).localeCompare(key(b)))
}

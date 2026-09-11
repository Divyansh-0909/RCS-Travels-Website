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

/**
 * Normalize copy for display/search without retaining an entire source line.
 * Source text nodes only ever contain a literal's own value, never surrounding
 * code, comments, or interpolation expressions.
 */
export function normalizeSourceText(input) {
  return String(input ?? '').replace(/\s+/g, ' ').trim()
}

function shannonEntropy(value) {
  const counts = new Map()
  for (const character of value) counts.set(character, (counts.get(character) || 0) + 1)
  let entropy = 0
  for (const count of counts.values()) {
    const probability = count / value.length
    entropy -= probability * Math.log2(probability)
  }
  return entropy
}

/**
 * Keep the text index useful without turning it into a source/secret dump.
 * This intentionally rejects opaque values and code-ish identifiers even when
 * callers have already identified a string literal.
 */
export function isSafeSourceText(input, { allowSimpleLabel = false } = {}) {
  const value = normalizeSourceText(input)
  if (value.length < 3 || value.length > 240) return false
  if (!/[A-Za-z]/.test(value)) return false
  if (/^(?:https?:)?\/\//i.test(value) || /\b(?:https?:\/\/|www\.)/i.test(value)) return false
  if (/^\/?(?:api|internal)\//i.test(value) || /(?:^|\s)[~.]?\.?[\\/][\w.-]+(?:[\\/][\w.-]+)+/.test(value) || /^[\w.-]+(?:[\\/][\w.-]+)+\.[A-Za-z]{1,8}$/.test(value)) return false
  if (!allowSimpleLabel && /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(value)) return false
  if (/^(?:[A-Fa-f0-9]{8}-){3,}[A-Fa-f0-9]{8,}$/.test(value)) return false
  const compact = value.replace(/[\s_-]/g, '')
  if (compact.length >= 24 && /^[A-Za-z0-9+/=]+$/.test(compact) && shannonEntropy(compact) >= 3.5) return false
  return true
}

export function isLikelyVisibleSourceText(input) {
  const value = normalizeSourceText(input)
  // JSX/translation callers are allowed to show compact labels such as "Log in";
  // ordinary literals need prose-like spacing to avoid indexing implementation
  // constants and identifiers.
  return isSafeSourceText(value) && /\s/.test(value) && /[A-Za-z]{2}/.test(value)
}

/**
 * Return each distinct directed cycle in the confirmed file-import graph.
 *
 * A cycle is returned with its first node repeated at the end. Starting each
 * depth-first search at the lexically smallest node in a candidate cycle
 * prevents reporting its rotations as separate diagnostics. This deliberately
 * does not consider test, call, or inferred edges: those do not prove a module
 * loader cycle.
 */
export function findCircularImportCycles(edges) {
  const adjacency = new Map()
  for (const edge of edges) {
    if (edge.type !== 'imports' || edge.confidence !== 'confirmed' || !edge.source || !edge.target) continue
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, new Set())
    adjacency.get(edge.source).add(edge.target)
    if (!adjacency.has(edge.target)) adjacency.set(edge.target, new Set())
  }

  const cycles = []
  const starts = [...adjacency.keys()].sort((a, b) => a.localeCompare(b))
  for (const start of starts) {
    const visit = (current, trail, visiting) => {
      for (const target of [...(adjacency.get(current) || [])].sort((a, b) => a.localeCompare(b))) {
        if (target === start && trail.length > 1) {
          cycles.push([...trail, start])
          continue
        }
        // Only the smallest ID in a cycle may start its traversal, which
        // eliminates rotation duplicates while retaining distinct cycles.
        if (target.localeCompare(start) < 0 || visiting.has(target)) continue
        visiting.add(target)
        visit(target, [...trail, target], visiting)
        visiting.delete(target)
      }
    }
    visit(start, [start], new Set([start]))
  }
  return cycles.sort((left, right) => left.join('\u0000').localeCompare(right.join('\u0000')))
}

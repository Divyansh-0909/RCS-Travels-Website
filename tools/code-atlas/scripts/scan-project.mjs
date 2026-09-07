import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Project, Node, SyntaxKind } from 'ts-morph'
import {
  apiMatchKey, expressionPath, joinApiPaths, methodFromOptions, normalizeApiPath,
  shouldScan, slug, stableUnique, surfaceFor, toPosix,
} from './atlas-core.mjs'

const SCAN_ROOTS = ['frontend/src', 'backend', 'driver-app/src', 'shared']
const ROUTE_METHODS = new Set(['get', 'post', 'put', 'patch', 'delete'])

async function walk(root, current = root) {
  const output = []
  let entries = []
  try { entries = await fs.readdir(current, { withFileTypes: true }) } catch { return output }
  for (const entry of entries) {
    const absolute = path.join(current, entry.name)
    const relative = toPosix(path.relative(root, absolute))
    if (entry.isDirectory()) {
      if (!/(^|\/)(node_modules|dist|build|coverage|assets|public|migrations|\.git)(\/|$)/i.test(relative)) output.push(...await walk(root, absolute))
    } else if (shouldScan(relative)) output.push(absolute)
  }
  return output
}

function location(repoRoot, node) {
  const source = node.getSourceFile()
  return { path: toPosix(path.relative(repoRoot, source.getFilePath())), line: node.getStartLineNumber() }
}

function fileId(relativePath) { return slug('file', toPosix(relativePath)) }
function symbolId(relativePath, name, line) { return slug('symbol', toPosix(relativePath), name, line) }

function nearestOwner(node, indexedDeclarations, repoRoot) {
  for (let current = node; current; current = current.getParent()) {
    const id = indexedDeclarations.get(current)
    if (id) return id
    if (Node.isSourceFile(current)) return fileId(toPosix(path.relative(repoRoot, current.getFilePath())))
  }
  return null
}

function declarationKind(name, node) {
  if (Node.isClassDeclaration(node)) return 'class'
  if (/^use[A-Z0-9]/.test(name)) return 'hook'
  if (/^[A-Z]/.test(name)) return 'component'
  return 'function'
}

function addEdge(edges, source, target, type, confidence = 'confirmed', label) {
  if (!source || !target || source === target) return
  edges.push({ id: slug('edge', type, source, target, label || ''), source, target, type, ...(label ? { label } : {}), confidence })
}

function importedTarget(importDeclaration) {
  return importDeclaration.getModuleSpecifierSourceFile()
}

function resolveDeclarationId(identifier, indexedDeclarations) {
  try {
    const symbol = identifier.getSymbol()
    const resolvedSymbol = symbol?.getAliasedSymbol?.() || symbol
    for (const declaration of resolvedSymbol?.getDeclarations() || []) {
      for (let current = declaration; current; current = current.getParent()) {
        if (indexedDeclarations.has(current)) return indexedDeclarations.get(current)
        if (Node.isSourceFile(current)) break
      }
    }
    for (const definition of identifier.getDefinitions?.() || []) {
      const declaration = definition.getDeclarationNode?.()
      if (declaration && indexedDeclarations.has(declaration)) return indexedDeclarations.get(declaration)
    }
  } catch { /* unresolved external/dynamic symbol */ }
  return null
}

function getCallName(call) {
  const expression = call.getExpression()
  if (Node.isIdentifier(expression)) return { object: null, method: expression.getText(), expression }
  if (Node.isPropertyAccessExpression(expression)) return {
    object: expression.getExpression().getText(), method: expression.getName(), expression: expression.getNameNode(),
  }
  return { object: null, method: '', expression }
}

function parsePrismaSchema(text, relativePath, nodes, edges) {
  const models = new Map()
  for (const match of text.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)) {
    const [, name, body] = match
    const line = text.slice(0, match.index).split('\n').length
    const id = slug('prisma-model', name)
    const fields = []
    for (const rawLine of body.split('\n')) {
      const field = rawLine.trim().match(/^(\w+)\s+([A-Za-z_]\w*)(\[\])?(\?)?\s*(.*)$/)
      if (field) fields.push({ name: field[1], type: field[2], list: Boolean(field[3]), optional: Boolean(field[4]) })
    }
    nodes.push({ id, type: 'prismaModel', label: name, path: relativePath, line, surface: 'backend', group: 'database', details: { fields } })
    models.set(name, id)
  }
  for (const node of nodes.filter(item => item.type === 'prismaModel')) {
    for (const field of node.details.fields) {
      const target = models.get(field.type)
      if (target) addEdge(edges, node.id, target, 'prisma_relation', 'confirmed', field.name)
    }
  }
  return models
}

function findElementName(node) {
  if (!node) return null
  const text = node.getText()
  return text.match(/<\s*([A-Z][\w.]*)/)?.[1]?.split('.').at(-1) || null
}

export async function scanProject(repoRoot) {
  const started = Date.now()
  const nodes = []
  const edges = []
  const diagnostics = []
  const absoluteFiles = (await Promise.all(SCAN_ROOTS.map(scanRoot => walk(path.join(repoRoot, scanRoot))))).flat().sort()
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    compilerOptions: { allowJs: true, checkJs: false, jsx: 1, moduleResolution: 2, target: 99, skipLibCheck: true },
  })
  project.addSourceFilesAtPaths(absoluteFiles)
  const sourceFiles = project.getSourceFiles().sort((a, b) => a.getFilePath().localeCompare(b.getFilePath()))
  const indexedDeclarations = new Map()
  const nameToIds = new Map()
  const symbolsBySource = new Map()

  for (const source of sourceFiles) {
    const relativePath = toPosix(path.relative(repoRoot, source.getFilePath()))
    nodes.push({ id: fileId(relativePath), type: 'file', label: path.basename(relativePath), path: relativePath, surface: surfaceFor(relativePath), group: relativePath.split('/').slice(0, -1).join('/') })
  }

  // Index named module-level declarations before resolving references and calls.
  for (const source of sourceFiles) {
    const relativePath = toPosix(path.relative(repoRoot, source.getFilePath()))
    const candidates = [...source.getFunctions(), ...source.getClasses(), ...source.getVariableDeclarations()]
    for (const declaration of candidates) {
      const name = declaration.getName?.()
      if (!name) continue
      if (Node.isVariableDeclaration(declaration)) {
        const statement = declaration.getVariableStatement()
        const initializer = declaration.getInitializer()
        const callable = Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer)
        if (!statement || (!callable && !statement.isExported())) continue
      }
      if (Node.isFunctionDeclaration(declaration) && declaration.getParent() !== source) continue
      const line = declaration.getStartLineNumber()
      const id = symbolId(relativePath, name, line)
      const type = declarationKind(name, declaration)
      nodes.push({ id, type, label: name, path: relativePath, line, surface: surfaceFor(relativePath), group: fileId(relativePath), details: { exported: Boolean(declaration.isExported?.() || declaration.isDefaultExport?.()) } })
      indexedDeclarations.set(declaration, id)
      if (Node.isVariableDeclaration(declaration)) {
        const init = declaration.getInitializer()
        if (init) indexedDeclarations.set(init, id)
      }
      if (!nameToIds.has(name)) nameToIds.set(name, [])
      nameToIds.get(name).push(id)
      if (!symbolsBySource.has(source.getFilePath())) symbolsBySource.set(source.getFilePath(), new Map())
      symbolsBySource.get(source.getFilePath()).set(name, id)
      addEdge(edges, fileId(relativePath), id, 'declares')
    }
  }

  // Imports and explicit test-to-source relationships.
  const bindingsBySource = new Map([...symbolsBySource].map(([sourcePath, symbols]) => [sourcePath, new Map(symbols)]))
  for (const source of sourceFiles) {
    const relativePath = toPosix(path.relative(repoRoot, source.getFilePath()))
    if (!bindingsBySource.has(source.getFilePath())) bindingsBySource.set(source.getFilePath(), new Map())
    const bindings = bindingsBySource.get(source.getFilePath())
    for (const declaration of source.getImportDeclarations()) {
      const target = importedTarget(declaration)
      if (!target) continue
      const targetPath = toPosix(path.relative(repoRoot, target.getFilePath()))
      addEdge(edges, fileId(relativePath), fileId(targetPath), /(^|\/)(tests?|__tests__)(\/|\.)/i.test(relativePath) ? 'tests' : 'imports')
      const targetSymbols = symbolsBySource.get(target.getFilePath()) || new Map()
      for (const named of declaration.getNamedImports()) {
        const localName = named.getAliasNode()?.getText() || named.getName()
        const targetId = targetSymbols.get(named.getName())
        if (targetId) bindings.set(localName, targetId)
      }
      const defaultImport = declaration.getDefaultImport()
      if (defaultImport) {
        const defaultId = [...targetSymbols.values()].find(id => nodes.find(node => node.id === id)?.details?.exported) || targetSymbols.get(defaultImport.getText())
        if (defaultId) bindings.set(defaultImport.getText(), defaultId)
      }
    }
  }

  const quickTarget = (source, identifier) => bindingsBySource.get(source.getFilePath())?.get(identifier.getText()) || null

  // Express router mounts are collected first so endpoint paths are complete.
  const mountByTargetFile = new Map()
  for (const source of sourceFiles) {
    const imports = new Map()
    for (const declaration of source.getImportDeclarations()) {
      const target = importedTarget(declaration)
      const defaultImport = declaration.getDefaultImport()
      if (target && defaultImport) imports.set(defaultImport.getText(), target)
      for (const named of declaration.getNamedImports()) if (target) imports.set(named.getAliasNode()?.getText() || named.getName(), target)
    }
    for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const { object, method } = getCallName(call)
      if (object !== 'app' || method !== 'use') continue
      const [prefixNode, ...rest] = call.getArguments()
      const prefix = expressionPath(prefixNode)
      if (!prefix) continue
      const routerArg = [...rest].reverse().find(Node.isIdentifier)
      const target = routerArg && imports.get(routerArg.getText())
      if (target) mountByTargetFile.set(target.getFilePath(), prefix)
    }
  }

  const backendRoutes = new Map()
  const clientEndpoints = []
  for (const source of sourceFiles) {
    const relativePath = toPosix(path.relative(repoRoot, source.getFilePath()))
    const surface = surfaceFor(relativePath)
    for (const call of source.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const { object, method, expression } = getCallName(call)
      const args = call.getArguments()

      // Function calls and symbol references resolved through the language service.
      const target = Node.isIdentifier(expression) ? quickTarget(source, expression) : quickTarget(source, expression)
      if (target) addEdge(edges, nearestOwner(call, indexedDeclarations, repoRoot), target, 'calls')

      if ((object === 'router' || object?.endsWith('Router') || object === 'app') && ROUTE_METHODS.has(method)) {
        const localPath = expressionPath(args[0])
        if (localPath) {
          const fullPath = object === 'app' ? localPath : joinApiPaths(mountByTargetFile.get(source.getFilePath()) || '', localPath)
          const httpMethod = method.toUpperCase()
          const id = slug('server-endpoint', httpMethod, fullPath)
          const loc = location(repoRoot, call)
          nodes.push({ id, type: 'serverEndpoint', label: `${httpMethod} ${fullPath}`, ...loc, surface: 'backend', group: 'api', details: { method: httpMethod, path: fullPath } })
          addEdge(edges, fileId(relativePath), id, 'declares_route')
          for (const argument of args.slice(1)) {
            let handler = Node.isIdentifier(argument) ? quickTarget(source, argument) : null
            if (!handler && (Node.isArrowFunction(argument) || Node.isFunctionExpression(argument))) {
              const handlerType = argument === args.at(-1) ? 'routeHandler' : 'middleware'
              handler = slug('route-handler', relativePath, argument.getStartLineNumber(), handlerType)
              nodes.push({ id: handler, type: handlerType, label: `${method.toUpperCase()} handler`, path: relativePath, line: argument.getStartLineNumber(), surface: 'backend', group: id, details: { inline: true } })
              indexedDeclarations.set(argument, handler)
            }
            if (handler) addEdge(edges, id, handler, argument === args.at(-1) ? 'handled_by' : 'middleware')
          }
          backendRoutes.set(apiMatchKey(httpMethod, fullPath), id)
        }
      }

      if ((method === 'request' && !object) || ['apiRequest', 'requestJson'].includes(method)) {
        const apiPath = expressionPath(args[0])
        if (apiPath && (apiPath.startsWith('/api/') || apiPath.startsWith('/internal/'))) {
          const httpMethod = methodFromOptions(args[1])
          const loc = location(repoRoot, call)
          const owner = nearestOwner(call, indexedDeclarations, repoRoot)
          const id = slug('client-endpoint', surface, httpMethod, apiPath, relativePath, loc.line)
          nodes.push({ id, type: 'clientEndpoint', label: `${httpMethod} ${apiPath}`, ...loc, surface, group: 'api', details: { method: httpMethod, path: apiPath } })
          addEdge(edges, owner, id, 'calls_api')
          clientEndpoints.push({ id, method: httpMethod, path: apiPath, relativePath, line: loc.line })
        }
      }

      const prismaMatch = call.getExpression().getText().match(/^(?:prisma|tx|db)\.([a-z]\w*)\.([a-z]\w*)$/i)
      if (prismaMatch) {
        const modelName = prismaMatch[1][0].toUpperCase() + prismaMatch[1].slice(1)
        addEdge(edges, nearestOwner(call, indexedDeclarations, repoRoot), slug('prisma-model', modelName), 'prisma_access', 'confirmed', prismaMatch[2])
      }
    }

    // Non-call symbol uses provide a lightweight "find references" view. Keep
    // declaration names and call targets out because they already have clearer
    // declares/calls relationships.
    for (const identifier of source.getDescendantsOfKind(SyntaxKind.Identifier)) {
      const parent = identifier.getParent()
      if (Node.isImportSpecifier(parent) || Node.isImportClause(parent) || Node.isVariableDeclaration(parent) && parent.getNameNode() === identifier || Node.isFunctionDeclaration(parent) && parent.getNameNode() === identifier) continue
      if ((Node.isCallExpression(parent) && parent.getExpression() === identifier) || (Node.isPropertyAccessExpression(parent) && parent.getNameNode() === identifier && Node.isCallExpression(parent.getParent()))) continue
      const target = quickTarget(source, identifier)
      if (target) addEdge(edges, nearestOwner(identifier, indexedDeclarations, repoRoot), target, 'references')
    }

    // Contexts and Zustand stores, including their top-level state keys.
    for (const declaration of source.getVariableDeclarations()) {
      const initializer = declaration.getInitializer()
      if (!initializer || !Node.isCallExpression(initializer)) continue
      const callName = initializer.getExpression().getText()
      const name = declaration.getName()
      if (callName !== 'createContext' && callName !== 'create' && !callName.startsWith('create(')) continue
      const stateType = callName === 'createContext' ? 'context' : 'zustandStore'
      const id = slug('state', relativePath, name)
      const keys = initializer.getDescendantsOfKind(SyntaxKind.PropertyAssignment).map(item => item.getName()).filter(Boolean)
      nodes.push({ id, type: stateType, label: name, path: relativePath, line: declaration.getStartLineNumber(), surface, group: 'state', details: { keys: [...new Set(keys)].sort() } })
      addEdge(edges, fileId(relativePath), id, 'declares_state')
    }

    // JSX <Route> declarations.
    for (const jsx of source.getDescendants().filter(node => Node.isJsxSelfClosingElement(node) || Node.isJsxElement(node))) {
      const opening = Node.isJsxElement(jsx) ? jsx.getOpeningElement() : jsx
      if (opening.getTagNameNode().getText() !== 'Route') continue
      const pathAttr = opening.getAttribute('path')
      const indexAttr = opening.getAttribute('index')
      const routePath = pathAttr?.getInitializer()?.getText().replace(/^['"]|['"]$/g, '') || (indexAttr ? '(index)' : null)
      if (!routePath) continue
      const id = slug('ui-route', surface, routePath, relativePath, opening.getStartLineNumber())
      nodes.push({ id, type: 'uiRoute', label: routePath, path: relativePath, line: opening.getStartLineNumber(), surface, group: 'routes', details: { path: routePath } })
      addEdge(edges, fileId(relativePath), id, 'declares_route')
      const element = opening.getAttribute('element')?.getInitializer()
      const elementName = findElementName(element)
      const component = elementName && nameToIds.get(elementName)?.[0]
      if (component) addEdge(edges, id, component, 'renders')
    }

    // createBrowserRouter object routes.
    for (const object of source.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression)) {
      const pathProperty = object.getProperty('path')
      if (!Node.isPropertyAssignment(pathProperty)) continue
      const routePath = expressionPath(pathProperty.getInitializer())
      if (!routePath) continue
      const id = slug('ui-route', surface, routePath, relativePath, object.getStartLineNumber())
      nodes.push({ id, type: 'uiRoute', label: routePath, path: relativePath, line: object.getStartLineNumber(), surface, group: 'routes', details: { path: routePath } })
      addEdge(edges, fileId(relativePath), id, 'declares_route')
      const element = object.getProperty('element')
      const elementName = Node.isPropertyAssignment(element) ? findElementName(element.getInitializer()) : null
      const component = elementName && nameToIds.get(elementName)?.[0]
      if (component) addEdge(edges, id, component, 'renders')
    }
  }

  const schemaPath = path.join(repoRoot, 'backend/prisma/schema.prisma')
  let prismaModels = new Map()
  try { prismaModels = parsePrismaSchema(await fs.readFile(schemaPath, 'utf8'), 'backend/prisma/schema.prisma', nodes, edges) }
  catch (error) { diagnostics.push({ level: 'error', code: 'PRISMA_SCHEMA_READ', message: `Could not read Prisma schema: ${error.message}`, path: 'backend/prisma/schema.prisma' }) }

  // Remove access edges to non-existent Prisma models, then connect clients to server endpoints.
  const modelIds = new Set(prismaModels.values())
  const filteredEdges = edges.filter(edge => edge.type !== 'prisma_access' || modelIds.has(edge.target))
  for (const client of clientEndpoints) {
    const server = backendRoutes.get(apiMatchKey(client.method, client.path))
    if (server) addEdge(filteredEdges, client.id, server, 'matches_endpoint', 'inferred')
    else diagnostics.push({ level: 'warning', code: 'UNMATCHED_CLIENT_ENDPOINT', message: `No backend route matched ${client.method} ${client.path}`, path: client.relativePath, line: client.line })
  }

  const finalNodes = stableUnique(nodes)
  const finalEdges = stableUnique(filteredEdges)
  const totals = finalNodes.reduce((result, node) => { result[node.type] = (result[node.type] || 0) + 1; return result }, { nodes: finalNodes.length, edges: finalEdges.length })
  return {
    meta: { generatedAt: new Date().toISOString(), projectName: 'RCS Travels', totals, scanDurationMs: Date.now() - started, surfaces: [...new Set(finalNodes.map(node => node.surface))].sort() },
    nodes: finalNodes,
    edges: finalEdges,
    diagnostics: diagnostics.sort((a, b) => `${a.level}:${a.path || ''}:${a.line || 0}:${a.code}`.localeCompare(`${b.level}:${b.path || ''}:${b.line || 0}:${b.code}`)),
  }
}

export function defaultRepoRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
}

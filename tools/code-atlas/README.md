# RCS Travels Code Atlas

The Code Atlas is a local, searchable map of the RCS Travels codebase. It helps trace a change from a page or component through client API code, backend routes and services, database models, and related symbols. The map is an aid for debugging and onboarding; it is not a replacement for reading the implementation or running the application.

## What it maps

The atlas combines several useful levels of detail:

- repository files and import/dependency relationships;
- frontend routes, pages, components, hooks, stores, and API calls;
- Express routes and their handler/service relationships;
- Prisma models, relations, and database access sites;
- exported/module symbols, callers, callees, and source locations;
- diagnostics, circular dependencies, and client-to-server endpoint matches where they can be inferred.

Use the overview for architecture, then filter or select a node to inspect its incoming and outgoing relationships. Local variables are indexed in their containing symbol where possible, but are deliberately not all drawn on the overview graph so the graph remains usable.

## Commands

Run these commands from this directory (`tools/code-atlas`):

```sh
npm ci                 # install the atlas tool dependencies
npm run generate       # scan the repository and update src/generated-atlas.js
npm run check          # verify that generated atlas data is current
npm run dev            # watch source files and serve the interactive atlas
npm run build          # generate and bundle a portable single-file atlas
npm test               # run atlas scanner tests
npm run ci             # test, generate, and build (used by CI)
```

`npm run dev` performs an initial scan, starts Vite, and watches relevant JavaScript, TypeScript, JSX/TSX, Prisma, and configuration files. Changes are debounced before a new scan starts. Open the URL printed by Vite (normally `http://127.0.0.1:4178`). Stop it with Ctrl+C; both the watcher and server are shut down cleanly.

The portable build is written to [`dist/index.html`](dist/index.html). It contains the UI and atlas data in one file, so it can be opened or shared as a build artifact without a running application server. `src/generated-atlas.js` is generated input and should not be edited by hand.

## CI and pushed code

`.github/workflows/code-atlas.yml` runs on every `push` and `pull_request`. It uses Node.js 22, installs with `npm ci`, runs `npm run ci`, and uploads the resulting `tools/code-atlas/dist/index.html` as the `code-atlas-<commit>` workflow artifact. Jobs for superseded commits on the same ref are cancelled, and the workflow has read-only repository contents permission.

The artifact is a snapshot of the commit that produced it. Download it from the completed workflow run to inspect the atlas for a pull request or pushed branch.

## Relationship confidence

Edges are labelled according to how they were found:

- **Confirmed** — resolved from an import, export, symbol reference, or parsed schema relationship.
- **Inferred** — matched using project conventions, such as a client endpoint string and an Express route.
- **Dynamic/uncertain** — the relationship may depend on runtime values, computed properties, aliases, or framework behaviour.
- **Diagnostic/unknown** — the scanner found a construct it could not resolve; inspect the source at the linked location.

Static analysis cannot observe every runtime path. Dynamic imports, generated code, reflection, dependency injection, callbacks passed through libraries, and environment-dependent routing can produce missing or approximate edges. A relationship in the atlas is evidence for investigation, not proof that a path executes in production.

## Security and scope

The atlas is intended to run against source code only. It excludes dependency trees, build output, generated atlas output, migrations, and static assets from its graph and live watcher. It does not intentionally ingest `.env` files, credentials, tokens, private keys, or production customer/captain data. Keep secrets and data out of source files and never commit generated reports containing them.

The generated HTML can include source paths and symbol names. Treat a downloaded artifact as internal development documentation and share it only with people who are allowed to see the repository structure. Review scanner changes before widening its input globs or adding runtime tracing.

## Troubleshooting

### `npm ci` fails

Run the command from `tools/code-atlas` and make sure the committed `package-lock.json` matches `package.json`. `npm ci` intentionally refuses to repair a stale or missing lockfile. Use the repository's normal dependency-update process to regenerate and review the lockfile.

### The atlas is empty or stale

Run `npm run generate` and look at the diagnostics printed by the scanner. Confirm that the changed file has a supported extension and is not under an excluded directory. Then refresh the browser; the Vite page loads the regenerated module through its normal development reload.

### A scan reports parse diagnostics

The atlas can still show the parts of the repository it parsed successfully. Open the diagnostic's source location, fix syntax/configuration problems, and run `npm run generate` again. Unsupported or highly dynamic constructs should be treated as uncertain rather than manually “fixed” in generated output.

### Vite cannot bind its port

Stop another atlas process using port 4178, or temporarily pass a different Vite port when starting the dev server. If the browser was left on an old snapshot, reload after the server reports that the new scan completed.

### CI fails while local generation works

Use the same Node major version as CI (22), run `npm ci` rather than an old `node_modules` directory, and run `npm run ci` from `tools/code-atlas`. Check that the generated output is reproducible and that no ignored local file is required for scanning.

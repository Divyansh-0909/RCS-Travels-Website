# The RCS API, as Cloud Run runs it.
#
# Debian slim rather than Alpine, and that is a decision rather than a habit.
# sharp ships prebuilt native binaries per C library, and package-lock.json
# carries @img/sharp-linux-x64 + @img/sharp-libvips-linux-x64 — the glibc build.
# Alpine is musl, so it would need the linuxmusl variants and would silently fall
# back to the wasm build if they were missing: same API, a fraction of the speed,
# on the one code path that re-encodes every document a captain uploads.
#
# Two stages, because `prisma` (the generator CLI) is a devDependency and the
# Prisma client cannot exist without it — but shipping the whole dev tree to
# production is 200 MB of eslint and typescript nobody runs. The builder
# generates, the runtime installs production dependencies only, and the generated
# client is grafted across.

# ---------------------------------------------------------------------------
# Stage 1 — generate the Prisma client
# ---------------------------------------------------------------------------
FROM node:24-slim AS builder

WORKDIR /app

# Only what `prisma generate` reads, so this layer is cached until the schema or
# the lockfile actually changes — not on every source edit.
COPY package.json package-lock.json prisma.config.js ./
COPY prisma ./prisma

RUN npm ci

# NOT a real connection string, and nothing connects to it. schema.prisma
# declares no `url` at all (db/prisma.js supplies one through the pg adapter at
# runtime), but prisma.config.js reads DIRECT_URL/DATABASE_URL for the migrate
# and studio commands — so `generate` wants the variable to exist even though it
# never opens a socket. A placeholder keeps the build hermetic: no database has
# to be reachable, and no real credential is ever present in a build layer.
ENV DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/placeholder"

RUN npx prisma generate --config ./prisma.config.js

# ---------------------------------------------------------------------------
# Stage 2 — the image that actually runs
# ---------------------------------------------------------------------------
FROM node:24-slim AS runtime

WORKDIR /app

# Read by db/prisma.js (which skips the global singleton cache outside dev),
# lib/supabase.js (which refuses to boot without its keys rather than answering
# 503), and middleware/internalAuth.js — where it is what makes the development
# shared secret unreachable. Setting it here rather than in the Cloud Run service
# config means the image is production by construction and cannot be deployed
# into the wrong mode by a missing environment variable.
ENV NODE_ENV=production

# The sweeps do not run on timers here. Cloud Run throttles the CPU to near zero
# between requests, so a setInterval never fires; Cloud Scheduler POSTs
# /internal/jobs/:name instead. See lib/jobs.js.
ENV JOBS_MODE=scheduler

COPY package.json package-lock.json ./

# Production dependencies only. This is what pulls the LINUX sharp binary — it
# must happen inside the image and never be copied from a developer's machine.
RUN npm ci --omit=dev

# The generated client, and only that. `npm prune --omit=dev` in the builder
# would have been shorter, but npm has historically treated node_modules/.prisma
# as extraneous and removed it — a failure that shows up as a runtime "did you
# forget prisma generate?" rather than a failed build. Grafting the directory
# across is explicit about the one thing stage 1 existed to produce.
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# The application. .dockerignore is doing real work here and is not an
# optimisation: without `node_modules` in it, this line would paste the host's
# @img/sharp-win32-x64 over the Linux binaries installed two lines above, and
# sharp would throw on import. It also keeps .env out, so no secret is ever
# baked into a layer.
COPY . .

# Nothing here writes to disk except tsx's transform cache, so the whole tree can
# be owned by root and read by an unprivileged user — except that tsx wants
# somewhere to cache. Giving node ownership is cheaper than reasoning about it.
RUN chown -R node:node /app
USER node

# Documentation only — Cloud Run injects PORT (8080 by default) and index.js
# already reads process.env.PORT with a 5000 fallback for local use.
EXPOSE 8080

# Invoked directly rather than through `npm start`, for two reasons. The prestart
# hook runs scripts/free-port.js, which shells out to netstat/lsof — neither
# exists in a slim image, and freeing a port inside a fresh container is
# meaningless anyway. And npm in front of node swallows signals: SIGTERM would
# reach npm and not the server, so the graceful shutdown in index.js would never
# run and Cloud Run would hard-kill the instance mid-request.
#
# --import tsx because the .ts route files are type-stripped at runtime; there is
# no build output to run. Same mechanism as the `test` script.
CMD ["node", "--import", "tsx", "index.js"]

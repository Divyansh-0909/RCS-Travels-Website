# Firebase Hosting, used as nothing but a proxy

This directory exists so `firebase.json` has a `public` folder to point at. **It
serves no files and is not a website.**

## Why any of this exists

The captain app reads its API URL from `EXPO_PUBLIC_API_BASE_URL`, and
`EXPO_PUBLIC_*` values are inlined into the JavaScript bundle at build time. So
whatever URL the first captain build carries is baked into every installed copy —
changing it later is a rebuild and a redistribution to every driver, not a config
change. The backend therefore needs a hostname that will outlive any move between
platforms, and `https://rcs-api-197642164526.asia-south1.run.app` is not one.

The obvious answer is a Cloud Run domain mapping, which is free. It is not
available in `asia-south1`:

```
501 UNIMPLEMENTED — "Creating domain mappings is not allowed in asia-south1."
```

The usual fallback is a Global External Application Load Balancer, whose
forwarding rule alone costs roughly $18/month whether or not anybody uses it —
more than the entire rest of this stack combined, for a hostname.

Firebase Hosting does the same job for nothing: it terminates TLS on a custom
domain, provisions and renews the certificate automatically, and rewrites every
path to a Cloud Run service. `asia-south1` is on its supported list.

## How it is wired

`firebase.json` maps `**` to the `rcs-api` service. There are no static files, so
nothing is ever served from here and every request reaches Cloud Run — a file
placed in this folder would shadow that path, which is why it is deliberately
empty.

The rewrite carries no project field, and cannot: Hosting can only reach a Cloud
Run service **in its own project**. That is the whole reason Firebase was added to
`project-0c9e66c4-03f9-4cc0-b53` rather than reusing `rcs-travels-b0d04`.

## What this project is NOT for

`rcs-travels-b0d04` is a separate Firebase project, and it owns **push
notifications** — the captain app's `google-services.json` and
`FIREBASE_SERVICE_ACCOUNT_BASE64` both point at it, and every captain's
registration token belongs to its sender ID.

**Do not add an app, and do not enable Cloud Messaging, in this project.** A
second FCM sender is the one way these two can genuinely collide. Hosting only.

## Deploying

```
npx -p firebase-tools firebase deploy --only hosting
```

Only needed when `firebase.json` changes. Deploying the backend itself is
`gcloud run deploy` — see backend/DEPLOY.md. Hosting holds no copy of the API.

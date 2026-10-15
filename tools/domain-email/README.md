# Domain DNS migration and email forwarding

Run commands from `D:\Downloads\Repos\RCS-Travels-Website` with Node 20.12+.
The project-root `.env` must define `CLOUDFLARE_API_TOKEN` and
`HOSTINGER_API_TOKEN`. The script reads credentials only from environment
variables; Node's `--env-file` option loads the local file into the environment.
Never put these tokens in the frontend environment or commit them.

```powershell
node --env-file=.env tools/domain-email/setup.mjs --mode plan
node --env-file=.env tools/domain-email/setup.mjs --mode prepare
node --env-file=.env tools/domain-email/setup.mjs --mode apply --wait-seconds 300
node --env-file=.env tools/domain-email/setup.mjs --mode verify
node --test tools/domain-email/setup.test.mjs
```

- `plan` performs only API reads and writes local backups/reports.
- `prepare` validates the plan, creates the free Cloudflare zone if missing,
  copies required DNS records with proxying disabled, then verifies equivalence.
  It does not change Hostinger nameservers.
- `migrate` prepares DNS, sets Hostinger nameservers, and polls activation.
- `email` configures Email Routing on an active zone and stops for destination
  verification if needed.
- `apply` executes the validated stages in order. Re-run it after verifying
  both Gmail destinations or after nameserver propagation finishes.
- `verify` audits the registrar, Cloudflare state, original DNS records, both
  routes, disabled catch-all, NS/MX/SPF on both assigned authoritative nameservers,
  and cached public NS/MX/SPF through Cloudflare and Google. The report separates
  `configuration_complete` from `public_dns_propagated`; exit code 1 remains
  expected while old public DNS caches are expiring.

The preferred domain is `rcstravels.co.in`; fallback to `rcstravels.com` occurs
only when Hostinger confirms that the preferred domain is absent and the fallback
is owned. Nothing is purchased or transferred to another registrar.
Routes are `business@DOMAIN` to `rcstravels.business@gmail.com` and
`support@DOMAIN` to `rcstravels.support@gmail.com`. No catch-all is enabled.

The first `dns-backup.json` is never overwritten. Timestamped snapshots and the
latest plan, migration, status, and verification reports live in
`.dns-email-state/`. Both are git-ignored. Existing conflicting DNS/routing records,
unsupported DNS types/TTLs, external DNS providers, or old DNSSEC DS records stop
changes instead of deleting/overwriting configuration. No automatic rollback is
attempted after nameserver changes; inspect live state and use the backup's old
nameservers for a deliberate recovery if required.

Exit codes: `0` success, `1` blocked/error/propagation pending, `2` Gmail destination
verification required. Public DNS verification cannot establish actual inbox
delivery: after setup, send a test message to each address from an unrelated inbox.

Official API references:
- https://developers.hostinger.com
- https://developers.cloudflare.com/api/resources/zones/
- https://developers.cloudflare.com/api/resources/dns/subresources/records/
- https://developers.cloudflare.com/api/resources/email_routing/

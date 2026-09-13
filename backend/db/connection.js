import { fileURLToPath } from 'node:url'

// pg otherwise opens plaintext connections when a hosted URI omits sslmode.
// Keep certificate and hostname verification even if a copied URI disables it.
export function secureDatabaseUrl(connectionString) {
  if (!connectionString) return connectionString
  let url
  try { url = new URL(connectionString) } catch {
    throw new Error('Invalid database connection URL')
  }
  const host = url.searchParams.getAll('host').at(-1) || url.hostname
  if (!['localhost', '127.0.0.1', '[::1]', '::1'].includes(host)) {
    url.searchParams.set('sslmode', 'verify-full')
    // Supabase uses its own public CA. This is a trust certificate, not a key.
    // Preserve an explicitly configured CA for projects with a different chain.
    if ((host.endsWith('.supabase.com') || host.endsWith('.supabase.co')) && !url.searchParams.has('sslrootcert')) {
      url.searchParams.set('sslrootcert', fileURLToPath(new URL('./supabase-ca.crt', import.meta.url)))
    }
  }
  return url.toString()
}

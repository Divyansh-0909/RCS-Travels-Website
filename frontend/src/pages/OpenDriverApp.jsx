import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useWebsiteCopy } from '../hooks/useWebsiteCopy'

const BOOKING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export default function OpenDriverApp() {
  const tr = useWebsiteCopy()
  const { id = '' } = useParams()
  const valid = BOOKING_ID.test(id)
  const appUrl = useMemo(() => valid ? `rcscaptains://rides/${encodeURIComponent(id)}` : null, [id, valid])

  useEffect(() => {
    if (!appUrl) return
    // Try immediately; the visible button remains for browsers that require a
    // second, explicit user gesture before opening an installed application.
    window.location.assign(appUrl)
  }, [appUrl])

  return (
    <main className="min-h-screen bg-canvas text-ink grid place-items-center px-6">
      <section className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ink-muted">RCS Travels</p>
        <h1 className="mt-3 text-3xl font-semibold">{tr("Open RCS Captains")}</h1>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          {valid
            ? tr('Open the assigned ride securely in the Captains app.')
            : tr('This ride link is invalid. Open the Captains app to view your assigned rides.')}
        </p>

        {appUrl && (
          <a
            href={appUrl}
            className="mt-7 block rounded-full bg-primary px-5 py-3 font-semibold text-on-primary"
          >
            {tr("Open driver app")}
          </a>
        )}

        <Link className="mt-4 inline-block text-sm underline" to="/help">
          {tr("Get help")}
        </Link>
      </section>
    </main>
  )
}

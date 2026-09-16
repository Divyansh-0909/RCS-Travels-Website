import { Link } from 'react-router-dom';
import { supportEmail, supportPhoneDisplay, emailSupport, openSupportWhatsApp } from '../constants/support';

const CaptainAccountDeletion = () => (
  <main className="min-h-[100dvh] bg-surface px-5 py-8 text-ink sm:px-10 sm:py-12">
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-2xl opacity-85 transition-opacity hover:opacity-100">
          <span className="font-semibold">RCS</span> travels
        </Link>
        <span className="text-xl text-ink-muted/50">/</span>
        <span className="text-xl text-ink-muted">RCS Captains</span>
      </div>

      <section className="rounded-3xl bg-surface-muted p-6 sm:p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.12em] text-ink-muted">Account deletion</p>
        <h1 className="mt-2 text-4xl font-semibold leading-tight tracking-[-0.04em] sm:text-5xl">Delete your RCS Captains account</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-ink-muted sm:text-lg">
          Captains can delete their account directly from the RCS Captains app. This removes access to the account and deletes or anonymizes direct account identifiers used to operate the captain profile.
        </p>
      </section>

      <section className="rounded-3xl bg-tone-primary p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Delete in the app</h2>
        <ol className="mt-4 list-decimal space-y-3 pl-5 text-base leading-7 text-ink-muted">
          <li>Open <strong className="text-ink">RCS Captains</strong> and sign in.</li>
          <li>Open <strong className="text-ink">Account</strong>.</li>
          <li>Choose <strong className="text-ink">Manage account</strong>.</li>
          <li>Tap <strong className="text-ink">Delete account</strong> and confirm.</li>
        </ol>
        <p className="mt-4 text-sm leading-6 text-ink-muted">You cannot delete the account while an active ride is still in progress. Finish the active ride first, then submit the deletion again.</p>
      </section>

      <section className="rounded-3xl bg-tone-sand p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">What happens to your data</h2>
        <p className="mt-3 text-base leading-7 text-ink-muted">
          The captain account is deactivated and direct identifiers such as the captain name, phone number, profile photo, login identity, push token, and current live location are removed or anonymized. Some ride, payment, tax, safety, fraud-prevention, dispute, vehicle, and driver-verification records (including documents where applicable) may be retained where required or reasonably necessary for those purposes. They are not kept as an active captain profile.
        </p>
      </section>

      <section className="rounded-3xl border border-border bg-surface p-6 sm:p-8">
        <h2 className="text-2xl font-semibold">Cannot access the app?</h2>
        <p className="mt-3 text-base leading-7 text-ink-muted">Contact RCS Travels and ask for deletion of your RCS Captains account. Include the phone number used for the captain account so we can verify the request.</p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button type="button" onClick={() => openSupportWhatsApp('Hi, I want to delete my RCS Captains account.')} className="cursor-pointer rounded-full bg-strong px-5 py-3 font-semibold text-on-strong transition-opacity hover:opacity-90">WhatsApp {supportPhoneDisplay()}</button>
          <button type="button" onClick={emailSupport} className="cursor-pointer rounded-full border border-border px-5 py-3 font-semibold transition-colors hover:bg-surface-muted">Email {supportEmail()}</button>
        </div>
      </section>

      <p className="pb-4 text-sm text-ink-muted">See the <Link to="/driver-privacy" className="underline underline-offset-2 hover:text-ink">Driver Privacy Policy</Link> for more information about how RCS Travels handles captain data.</p>
    </div>
  </main>
);

export default CaptainAccountDeletion;

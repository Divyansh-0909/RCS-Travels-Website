# Gmail backup-alert sender handoff

21 October 2026 IST. Additive to the [key/alert handoff](phase9d-1-key-alert-recovery-handoff-2026-10-21.md). The owner explicitly confirmed the corrected sender spelling.

| Setting | Confirmed choice / current status |
| --- | --- |
| Sender and SMTP login | `rcstravels.support@gmail.com` |
| Recipient | `rcstravels.business@gmail.com` |
| SMTP host / transport | `smtp.gmail.com`, port 587, certificate-verified STARTTLS |
| First responder | Divyansh Singh |
| Sender authentication | NOT_CONFIGURED / account access and authentication not verified |
| Actual email delivery and acknowledgement | NOT_TESTED |
| Production workflow activation | DISABLED; no remote settings changed |

The [non-secret settings example](../../tools/backups/gmail-alert.env.example) records the choices and keeps email sending disabled. It is not automatically loaded and contains no password. The existing backup workflows already accept these named settings; they have not been pushed, deployed or enabled. The application's `backend/.env` is unchanged.

## Owner step

Sign in to **the support account**, enable 2-Step Verification if needed, then create a dedicated app password named `RCS Proofloop backup alerts` at [Google App passwords](https://myaccount.google.com/apppasswords). Keep the generated credential private; do not put it in chat, the settings example or a tracked file. Google requires 2-Step Verification for app passwords and documents account configurations where they are unavailable. If unavailable, report that condition so OAuth or a different authorized sender can be considered without weakening account security. See [Google's app-password guidance](https://support.google.com/accounts/answer/185833) and [Gmail SMTP settings](https://support.google.com/mail/answer/7104828).

The support Gmail credential is separate from Google Cloud CLI login and from the database password. A Cloud CLI login does not establish Gmail SMTP authentication. Do not change the account's ordinary password merely to configure this route.

## Prepared private Windows intake

[save_gmail_credential.ps1](../../tools/backups/save_gmail_credential.ps1) prompts with hidden input, checks the app-password format, and stores only current-user DPAPI ciphertext in a fresh current-user/SYSTEM ACL-protected folder under `%LOCALAPPDATA%\RCSProofloop\private-alerts`. It accepts displayed grouping spaces, preserves previous credentials, and writes a non-secret saved status. This local staging is tied to the Windows account; it is not an offline recovery copy or CI secret installation. It never connects to SMTP or sends a message.

PowerShell parsing returned zero syntax errors. The assistant's combined prompt/browser launch command was rejected before execution by automatic approval review with only `blocked by policy` supplied as the reason. No prompt/browser launch or credential capture is claimed. The owner can open the script in their local PowerShell without changing global execution policy:

```powershell
& 'D:\Downloads\Repos\RCS-proofloop-local-20261016\tools\backups\save_gmail_credential.ps1' -IntakeId ([guid]::NewGuid().ToString('N'))
```

If Windows refuses script execution, report the refusal without pasting a password. Runtime ACL, credential save, SMTP authentication and delivery checks remain pending; syntax parsing does not establish them.

## Remaining verification

1. Receive the dedicated app password using a protected local input and secret store; no secret capture is performed by this document.
2. Run the existing configuration-only check with credentials supplied only to the owned process. `--check` opens no connection and cannot prove authentication or inbox delivery.
3. After explicit authorization for a synthetic email, exercise the actual sender, confirm receipt in the business inbox/spam folders and record the responder's acknowledgement. SMTP acceptance alone is not delivery proof.
4. Configure protected CI credentials and monitored response coverage separately. Keep production backup/restore workflows disabled until their destination, key ownership, restore and other activation prerequisites are satisfied.

No email was sent, no credential was requested in chat, and no cloud resource, SQL, application policy, historical evidence or production setting was changed. No tests were run for this documentation/settings-example update. Production remains OFF; P8 remains NOT_STARTED.

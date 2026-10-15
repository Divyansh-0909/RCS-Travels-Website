export function redactBrowserTrace(entries) {
  const result = { ...entries };
  for (const [key, value] of Object.entries(entries)) {
    const text = Buffer.from(value).toString('utf8');
    if (!Buffer.from(text).equals(Buffer.from(value))) continue;
    const redacted = text.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[synthetic-session-redacted]')
      .replace(/fixture_actor=\w+/g, 'fixture_actor=[redacted]')
      .replace(/("name"\s*:\s*"(?:cookie|authorization|set-cookie|fixture_actor|__session|__clerk_db_jwt)"\s*,\s*"value"\s*:\s*")[^"]*/gi, '$1[redacted]')
      .replace(/(razorpay_signature(?:\\[nrt]|[\\\s"])*:(?:\\[nrt]|[\\\s"])*)[a-f0-9]{64}/gi, '$1[synthetic-payment-signature-redacted]');
    result[key] = new Uint8Array(Buffer.from(redacted));
  }
  return result;
}

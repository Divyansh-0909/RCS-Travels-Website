// Synthetic authentication provider. Used only by the dedicated isolated UI runner.
// Application Clerk hooks and backend JWT/role verification remain real.
import { generateKeyPairSync, sign } from 'node:crypto';

export const browserPublishableKey = `pk_test_${Buffer.from('phase9.clerk.accounts.dev$').toString('base64')}`;

export function createBrowserAuth(actors) {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwtKey = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const actorFor = req => actors[req.headers.cookie?.match(/(?:^|;\s*)fixture_actor=(\w+)/)?.[1]];
  const sessionId = actor => actor.sessionId ?? `sess_${actor.id}`;
  const token = (actor, overrides = {}) => {
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: 'https://phase9.clerk.accounts.dev', sub: actor.clerkId,
      sid: sessionId(actor), iat: now, nbf: now - 1, exp: now + 3600,
      metadata: { role: actor.role ?? 'customer' }, ...overrides };
    const input = [ { alg: 'RS256', typ: 'JWT' }, claims ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    return `${input}.${sign('RSA-SHA256', Buffer.from(input), keys.privateKey).toString('base64url')}`;
  };
  const session = actor => {
    const now = Date.now();
    const user = { object: 'user', id: actor.clerkId, first_name: actor.name, last_name: null,
      username: null, image_url: '', has_image: false, email_addresses: [], phone_numbers: [],
      external_accounts: [], enterprise_accounts: [], saml_accounts: [], web3_wallets: [], passkeys: [],
      organization_memberships: [], public_metadata: { role: actor.role ?? 'customer' }, unsafe_metadata: {},
      created_at: now, updated_at: now, password_enabled: false, two_factor_enabled: false };
    return { object: 'session', id: sessionId(actor), status: 'active', user,
      public_user_data: { first_name: actor.name, last_name: null, image_url: '', has_image: false, identifier: actor.clerkId },
      created_at: now, updated_at: now, last_active_at: now, expire_at: now + 3600000,
      abandon_at: now + 3600000, last_active_organization_id: null, factor_verification_age: [0, -1], tasks: [],
      last_active_token: { object: 'token', jwt: token(actor) } };
  };
  const client = actor => ({ object: 'client', id: 'client_phase9', sessions: actor ? [session(actor)] : [],
    sign_in: null, sign_up: null, last_active_session_id: actor ? sessionId(actor) : null,
    created_at: Date.now(), updated_at: Date.now(), cookie_expires_at: Date.now() + 3600000 });
  const environment = { object: 'environment', id: 'env_phase9', maintenance_mode: false,
    auth_config: { object: 'auth_config', id: 'auth_phase9', single_session_mode: true },
    display_config: { object: 'display_config', id: 'display_phase9', instance_environment_type: 'development',
      application_name: 'RCS isolated verification', home_url: '/', sign_in_url: '/login', sign_up_url: '/signup',
      user_profile_url: '/', after_sign_in_url: '/', after_sign_up_url: '/', captcha_public_key: null,
      captcha_oauth_bypass: [], theme: {}, show_devmode_warning: false },
    user_settings: { attributes: {}, social: {}, actions: {}, sign_in: {}, sign_up: {},
      password_settings: {}, username_settings: {}, passkey_settings: {} }, organization_settings: {},
    commerce_settings: {}, api_keys_settings: {}, protect_config: {} };
  return { jwtKey, token, middleware(req, res) {
    const actor = actorFor(req);
    res.set('cache-control', 'no-store');
    if (req.path === '/v1/dev_browser' && req.method === 'POST') return res.json({ id: token(actor ?? { id: 'anonymous', clerkId: 'fixture_anonymous' }) });
    if (req.path === '/v1/environment') return res.json({ response: environment, client: client(actor) });
    if (req.path === '/v1/client' || req.path === '/v1/client/touch') return res.json({ response: client(actor) });
    if (/^\/v1\/client\/sessions\/[^/]+\/tokens$/.test(req.path) && actor) return res.json({ response: { object: 'token', jwt: token(actor) } });
    if (/^\/v1\/client\/sessions\/[^/]+\/touch$/.test(req.path) && actor) return res.json({ response: session(actor), client: client(actor) });
    console.log('Unsupported synthetic auth endpoint:', req.method, req.path);
    return res.status(404).json({ errors: [{ code: 'fixture_endpoint_unsupported', message: 'Unsupported synthetic authentication request' }] });
  } };
}

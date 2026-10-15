// Clerk's native resource-cache key includes the publishable key suffix. The
// provider's real keys use unpadded base64; '=' padding is invalid in SecureStore.
export const nativePublishableKey=`pk_test_${Buffer.from('phase9.clerk.accounts.dev$').toString('base64url')}`;

export function nativeClerkEnvironment(payload) {
  const commerce=payload.response.commerce_settings ?? {};
  const billing=commerce.billing ?? {};
  return { ...payload,response:{ ...payload.response,commerce_settings:{ ...commerce,billing:{
    ...billing,stripe_publishable_key:billing.stripe_publishable_key ?? null,
    organization:{ enabled:false,has_paid_plans:false,...billing.organization },
    user:{ enabled:false,has_paid_plans:false,...billing.user },
  } } } };
}

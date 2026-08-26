/**
 * Admin API credential resolution for the Shopify Admin API.
 *
 * Shopify's Admin API is authenticated with a per-shop access token sent as
 * the `X-Shopify-Access-Token` header (the API_KEY auth mode in Composio
 * terms). The token comes from a custom app in the shop's admin
 * (Settings → Apps → Develop apps → Admin API access token) or from an OAuth
 * install of a public/custom app.
 *
 * Credential precedence, per value:
 *   1. literal config value (shopDomain / accessToken)
 *   2. the harness `credentials` service reference named by the config
 *      (shopDomainRef / accessTokenRef / accessTokenRefFallback) — resolves
 *      the process environment, the provider-managed store, and `.env` files
 *   3. the same environment variable read directly from `process.env`
 *
 * Access tokens are treated as immutable configuration — they are never
 * refreshed or written back. OAuth2 / S2S client-credential flows can be added
 * here later without touching the client or tools.
 * @module @shopify/dsh-shopify/auth
 */

import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { authFailure } from './util.js';

/**
 * Resolve one configured secret: literal config first, then the harness
 * credentials service (which layers env / provider store / .env), then the
 * raw process environment as a last resort.
 */
async function resolveSecret(ctx, config, literal, ...refNames) {
  if (typeof literal === 'string' && literal.trim().length > 0) return literal;
  const credentials = ctx.get('credentials');
  for (const refName of refNames) {
    const name = refName || '';
    if (name.trim().length === 0) continue;
    if (credentials !== undefined) {
      try {
        const resolved = await credentials.resolve(credentialRef(name));
        if (resolved !== undefined) return resolved.value;
      } catch (error) {
        // Fall through to the next source; a broken provider must not hide a working env.
        console.error(`shopify: credentials.resolve(${name}) failed:`, error instanceof Error ? error.message : String(error));
      }
    }
    const fromEnv = process.env[name];
    if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) return fromEnv;
  }
  return undefined;
}

/**
 * Normalize a shop domain: strips scheme, path, and trailing dots, and appends
 * `.myshopify.com` when only the subdomain part was provided.
 * @example 'https://my-store.myshopify.com' → 'my-store.myshopify.com'
 * @example 'my-store' → 'my-store.myshopify.com'
 */
export function normalizeShopDomain(domain) {
  if (typeof domain !== 'string' || domain.trim().length === 0) return undefined;
  let value = domain.trim();
  value = value.replace(/^https?:\/\//i, '');
  value = value.split('/')[0];
  value = value.replace(/\.+$/, '');
  if (value.length === 0) return undefined;
  if (!value.includes('.')) return `${value}.myshopify.com`;
  return value;
}

/** Snapshot of the Admin API credentials after resolution. */
export async function resolveAdminCredentials(ctx, config) {
  const rawDomain = await resolveSecret(ctx, config, config.shopDomain, config.shopDomainRef);
  const accessToken = await resolveSecret(ctx, config, config.accessToken, config.accessTokenRef, config.accessTokenRefFallback);
  const shopDomain = normalizeShopDomain(rawDomain);
  return { shopDomain, accessToken };
}

/** Whether the credentials needed to call the Admin API are present. */
export function isConfigured(credentials) {
  return Boolean(credentials.shopDomain && credentials.accessToken);
}

/**
 * Resolve the credentials for one Admin API call and throw {@link authFailure}
 * when they are missing, so every tool fails with actionable guidance.
 */
export async function requireCredentials(ctx, config) {
  const credentials = await resolveAdminCredentials(ctx, config);
  if (!isConfigured(credentials)) {
    throw authFailure('no shop domain or access token configured');
  }
  return credentials;
}

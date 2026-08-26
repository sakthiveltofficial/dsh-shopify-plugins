/**
 * @shopify/dsh-shopify — Shopify plugin for the DeepSeek Harness.
 *
 * A self-contained Cordis plugin: 180+ model-facing tools over the Shopify
 * Admin REST and GraphQL APIs — products, orders, customers, collections,
 * inventory, fulfillments, discounts, content, metafields, webhooks, themes,
 * draft orders, marketing, gift cards, billing, bulk operations and a generic
 * GraphQL escape hatch.
 *
 * Authentication is the Admin API access-token flow (Composio's API_KEY
 * mode): credentials are read from literal config or the harness `credentials`
 * service via env-var references (SHOPIFY_SHOP_DOMAIN / SHOPIFY_ADMIN_API_TOKEN,
 * with SHOPIFY_ACCESS_TOKEN as fallback). See {@link auth}.
 *
 * The plugin publishes no services — it only consumes the host `tools`
 * registry — so it mounts cleanly as a plain row in a host composition or an
 * agent preset, with no isolate realm.
 * @module @shopify/dsh-shopify
 */

import z from '@deepseek-ai/schemastery';
import { ShopifyClient } from './client.js';
import { registerAll } from './tools/index.js';

export const name = 'shopify';

/** Hard dependency: the host tool registry. `credentials` stays optional. */
export const inject = ['tools'];

/** Schemastery config: Admin API credentials + runtime defaults. */
export const Config = z.object({
  // Admin API credentials. Literal values win; otherwise the *Ref names are
  // resolved through the harness credentials service (env / provider store /
  // .env), falling back to the raw process environment.
  shopDomain: z.string().default(''),
  shopDomainRef: z.string().default('SHOPIFY_SHOP_DOMAIN'),
  accessToken: z.string().default(''),
  accessTokenRef: z.string().default('SHOPIFY_ADMIN_API_TOKEN'),
  accessTokenRefFallback: z.string().default('SHOPIFY_ACCESS_TOKEN'),
  /**
   * Admin API version for REST and GraphQL calls, e.g. '2025-01'.
   * Individual tools can override per call via their `api_version` argument.
   */
  apiVersion: z.string().default('2025-01'),
  /** Per-request HTTP timeout for Shopify API calls. */
  timeoutMs: z.number().default(30000),
});

const PROMPT_SECTION = `You have access to the Shopify tools (shopify_*). Key conventions:

- Auth: requests use the Admin API access token from SHOPIFY_ADMIN_API_TOKEN (fallback SHOPIFY_ACCESS_TOKEN) against the shop in SHOPIFY_SHOP_DOMAIN (e.g. 'my-store.myshopify.com'). If calls fail with SHOPIFY_AUTH_FAILED, tell the user which env vars to set.
- IDs: REST tools take numeric resource IDs (e.g. product_id 8313381814466); GraphQL tools take GIDs (gid://shopify/Product/123). Convert with GraphQL's legacyResourceId field when crossing between them.
- Pagination: REST list tools return next_page_info — loop with page_info until it is null; never silently truncate. GraphQL list queries must request pageInfo { hasNextPage endCursor } and paginate with after.
- Rate limits: REST bucket ~40 GET / ~20 write calls per minute; GraphQL ~1000 cost points/min (~50/s refill). On 429 / THROTTLED / X-Shopify-Shop-Api-Call-Limit exhaustion, back off (1s, 2s, 4s) and reduce concurrency. Prefer smaller page sizes (limit 50-100) over huge pages.
- userErrors: mutation failures arrive in the payload's userErrors array with HTTP 200 — always inspect them. Shopify may also return top-level GraphQL errors; both are validation, not transport, failures.
- Deprecated REST endpoints: the REST Admin API is legacy; use the shopify_graphql_* tools for new product-model work (options, media, publishing) and for anything REST does not expose.
- Order 403s: a 403 on order reads/updates usually means the app token lacks read_all_orders / write_orders scopes — reconnect with those scopes rather than retrying.
- Destructive actions (shopify_delete_product, shopify_delete_order, shopify_delete_customer, shopify_delete_custom_collection, ...) are irreversible: confirm with the user before executing.
- Money: amounts are decimal strings (e.g. '19.99'); always pass the shop currency (from shopify_get_shop_details / shopify_query_shop) and never assume USD.
- Date filters: Shopify stores timestamps in UTC but filters evaluate in the shop's local timezone (iana_timezone from shopify_get_shop_details) — adjust boundary-day queries accordingly.
- Refunds: always call shopify_calculate_refund first, then change transaction kind from 'suggested_refund' to 'refund' before shopify_create_refund.`;

/** Apply the Shopify plugin: register tools. */
export function apply(ctx, config) {
  const client = new ShopifyClient(ctx, config);
  const deps = { client, config };

  const count = registerAll(ctx, deps);
  console.log(`shopify: registered ${count} tools`);

  const systemPrompt = ctx.get('systemPrompt');
  if (systemPrompt !== undefined) {
    systemPrompt.section({ name: 'tool:shopify', order: 116, text: PROMPT_SECTION });
  }
}

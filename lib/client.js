/**
 * Minimal Shopify Admin API client over the Node `fetch` global.
 *
 * Supports the REST Admin API (`rest`, `list`) and the GraphQL Admin API
 * (`graphql`) for one shop. Every request is authenticated with the
 * `X-Shopify-Access-Token` header from {@link requireCredentials}; 401
 * responses throw a structured auth failure, and 429/5xx responses are
 * retried with bounded exponential backoff. The `X-Shopify-Shop-Api-Call-Limit`
 * bucket header is tracked so bursts of tool calls self-throttle before
 * hitting the REST bucket ceiling (~40/min GET, ~20/min writes).
 *
 * REST list endpoints expose cursor pagination through the `Link` header;
 * {@link ShopifyClient#list} surfaces the next cursor as `next_page_info`.
 * @module @shopify/dsh-shopify/client
 */

import { requireCredentials } from './auth.js';
import { ShopifyError, authFailure, rateLimitFailure, stripJsonSuffix } from './util.js';

const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function queryString(params) {
  const cleaned = [];
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) cleaned.push([key, String(item)]);
    } else {
      cleaned.push([key, String(value)]);
    }
  }
  if (cleaned.length === 0) return '';
  return '?' + cleaned.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
}

/** Parse `Link: <...?page_info=abc>; rel="next"` and return the next cursor. */
function nextPageInfo(linkHeader) {
  if (typeof linkHeader !== 'string' || linkHeader.length === 0) return undefined;
  const entries = linkHeader.split(',');
  for (const entry of entries) {
    const [urlPart, relPart] = entry.split(';');
    if (!relPart || !relPart.includes('rel="next"')) continue;
    const match = urlPart?.match(/[?&]page_info=([^&>]+)/);
    if (match) return decodeURIComponent(match[1]);
  }
  return undefined;
}

/** Parse `X-Shopify-Shop-Api-Call-Limit: current/max`. */
function parseCallLimit(header) {
  if (typeof header !== 'string') return undefined;
  const match = header.match(/^(\d+)\/(\d+)/);
  if (!match) return undefined;
  const current = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return undefined;
  return { current, max };
}

/** Client bound to one plugin instance; resolves credentials per request. */
export class ShopifyClient {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.config = config;
    this.lastUsage = undefined; // { current, max } from the call-limit bucket
  }

  /** REST Admin API base URL for the configured shop + version. */
  async baseUrl(apiVersion) {
    const creds = await requireCredentials(this.ctx, this.config);
    const version = apiVersion ?? this.config.apiVersion ?? '2025-01';
    return `https://${creds.shopDomain}/admin/api/${version}`;
  }

  /** Headers for one authenticated request (credentials resolved per call). */
  async authHeaders() {
    const creds = await requireCredentials(this.ctx, this.config);
    return { 'X-Shopify-Access-Token': creds.accessToken, Accept: 'application/json' };
  }

  /** Sleep briefly when the REST bucket is nearly exhausted, to avoid 429s. */
  async throttleIfNeeded() {
    const usage = this.lastUsage;
    if (!usage) return;
    const ratio = usage.current / usage.max;
    if (ratio >= 0.85) {
      // Back off roughly proportionally to how full the bucket is (max ~2s).
      const delay = Math.min(2000, Math.round((ratio - 0.85) * 10 * 1000));
      if (delay > 0) await sleep(delay);
    }
  }

  /**
   * One authenticated REST request with bounded backoff.
   * Returns `{ body, headers }` so callers can read Link / bucket headers.
   */
  async restRaw(method, path, { query, body, apiVersion, signal } = {}) {
    await this.throttleIfNeeded();
    const base = await this.baseUrl(apiVersion);
    const headers = await this.authHeaders();
    const url = `${base}${stripJsonSuffix(path)}.json${queryString(query)}`;
    let attempt = 0;
    let response;
    for (;;) {
      attempt += 1;
      response = await fetch(url, {
        method,
        headers: {
          ...headers,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal,
      });
      const usage = parseCallLimit(response.headers.get('x-shopify-shop-api-call-limit'));
      if (usage) this.lastUsage = usage;
      if (!RETRY_STATUSES.has(response.status) || attempt >= MAX_ATTEMPTS) break;
      const retryAfter = Number(response.headers.get('retry-after') ?? 0) * 1000;
      const delay = Math.min(8000, retryAfter || 250 * 2 ** (attempt - 1));
      await sleep(delay);
    }
    if (response.status === 401) {
      throw authFailure(`Admin API rejected the access token (HTTP 401 on ${method} ${path})`);
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') ?? 0) * 1000;
      throw rateLimitFailure(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
    }
    if (response.status === 403 && (path.startsWith('/orders') || path.includes('orders'))) {
      throw new ShopifyError(
        `Shopify returned 403 Forbidden on ${method} ${path}. Order reads/updates commonly need the 'read_all_orders' (and 'write_orders') scope on the app that issued the access token; also confirm the token has not expired and the app is still installed.`,
        'SHOPIFY_FORBIDDEN_ORDER_SCOPE',
        403,
      );
    }
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = undefined;
      }
      throw new ShopifyError(
        `Shopify Admin API ${method} ${path} failed with ${response.status}: ${parsed?.errors ?? parsed?.error ?? text.slice(0, 300)}`,
        'SHOPIFY_API_ERROR',
        response.status,
        parsed ?? text,
      );
    }
    const contentType = response.headers.get('content-type') ?? '';
    const headersOut = Object.fromEntries(response.headers.entries());
    if (contentType.includes('application/json')) {
      return { body: await response.json(), headers: headersOut };
    }
    return { body: { raw: await response.text() }, headers: headersOut };
  }

  /** REST call that returns only the parsed JSON body. */
  async rest(method, path, opts = {}) {
    const { body } = await this.restRaw(method, path, opts);
    return body;
  }

  /**
   * REST list call that extracts the resource array and the next page cursor.
   * `path` is the resource path WITHOUT `.json` (e.g. '/products').
   * `opts` may carry `{ signal, apiVersion }`.
   * Returns `{ items, next_page_info }`; `items` is the first array-valued
   * key of the response body.
   */
  async list(path, query = {}, opts = {}) {
    const { body, headers } = await this.restRaw('GET', path, {
      query,
      signal: opts.signal,
      apiVersion: opts.apiVersion,
    });
    const items = Object.values(body ?? {}).find((value) => Array.isArray(value)) ?? [];
    return { items, next_page_info: nextPageInfo(headers?.link) };
  }

  /**
   * GraphQL Admin API call: POST /admin/api/{version}/graphql.json.
   * Returns the raw body `{ data, errors, extensions }`; callers inspect
   * `errors` and mutation `userErrors` (HTTP 200 can carry validation
   * failures).
   */
  async graphql(document, variables, apiVersion) {
    const base = await this.baseUrl(apiVersion);
    const headers = await this.authHeaders();
    let response;
    try {
      response = await fetch(`${base}/graphql.json`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: document, variables: variables ?? {} }),
      });
    } catch (error) {
      throw new ShopifyError(
        `Shopify GraphQL request failed: ${error instanceof Error ? error.message : String(error)}`,
        'SHOPIFY_GRAPHQL_NETWORK',
      );
    }
    const usage = parseCallLimit(response.headers.get('x-shopify-shop-api-call-limit'));
    if (usage) this.lastUsage = usage;
    if (response.status === 401) {
      throw authFailure('Admin API rejected the access token (HTTP 401 on GraphQL)');
    }
    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('retry-after') ?? 0) * 1000;
      throw rateLimitFailure(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : undefined);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new ShopifyError(
        `Shopify GraphQL failed with ${response.status}: ${JSON.stringify(payload).slice(0, 300)}`,
        'SHOPIFY_GRAPHQL_ERROR',
        response.status,
        payload,
      );
    }
    return payload;
  }
}

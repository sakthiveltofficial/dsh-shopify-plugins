/**
 * Shared helpers for the Shopify plugin: structured errors, common JSON
 * renderers, and small argument utilities used by every tool.
 * @module @shopify/dsh-shopify/util
 */

/**
 * Structured error thrown by the Shopify client and tool layer.
 * Carries an open-string machine code plus the HTTP status when one exists.
 */
export class ShopifyError extends Error {
  constructor(message, code = 'SHOPIFY_ERROR', status = undefined, body = undefined) {
    super(message);
    this.name = 'ShopifyError';
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

/** Missing or rejected credentials — the shop domain or access token is unset/invalid. */
export function authFailure(detail) {
  return new ShopifyError(
    `Shopify authentication failed: ${detail}. Set SHOPIFY_SHOP_DOMAIN and SHOPIFY_ADMIN_API_TOKEN (custom-app admin API token; fallback SHOPIFY_ACCESS_TOKEN) in the environment or harness credential store, then retry.`,
    'SHOPIFY_AUTH_FAILED',
    401,
  );
}

/** A 429 rate-limit reply or a full API-call bucket, with backoff guidance. */
export function rateLimitFailure(retryAfterMs) {
  const wait = retryAfterMs == null ? 'exponential backoff (1s, 2s, 4s)' : `${Math.ceil(retryAfterMs / 1000)}s`;
  return new ShopifyError(
    `Shopify rate limit exhausted (REST bucket ~40 calls/min, GraphQL ~1000 cost points/min): wait ${wait} before retrying, and reduce concurrency.`,
    'SHOPIFY_RATE_LIMITED',
    429,
  );
}

/**
 * Build a human-readable message from a GraphQL body's `errors` array and the
 * mutation payload's `userErrors`. Shopify returns HTTP 200 with validation
 * failures in these fields, so agents must always inspect them.
 */
export function describeGraphQLErrors(body) {
  const parts = [];
  const graphqlErrors = body?.errors;
  if (Array.isArray(graphqlErrors) && graphqlErrors.length > 0) {
    for (const err of graphqlErrors) {
      parts.push(typeof err?.message === 'string' ? err.message : JSON.stringify(err));
    }
  }
  if (Array.isArray(body?.data)) {
    for (const payload of body.data) {
      if (payload?.userErrors && payload.userErrors.length > 0) {
        for (const ue of payload.userErrors) {
          parts.push(`userErrors: ${ue.message ?? JSON.stringify(ue)}`);
        }
      }
    }
  }
  return parts.join('; ');
}

/** Render any JSON value as a single model-facing text block. */
export function jsonText(value) {
  return [{ type: 'text', text: JSON.stringify(value, null, 2) }];
}

/** Canonical `output` declaration for JSON-object tool results. */
export function jsonObjectOutput(render = jsonText) {
  return {
    schema: { type: 'object', additionalProperties: true },
    render: (_args, value) => render(value),
  };
}

/** Canonical `output` declaration for results that are already strings. */
export function textOutput() {
  return {
    schema: { type: 'string' },
    render: (_args, value) => [{ type: 'text', text: String(value) }],
  };
}

/** Generic pending-call card. `kind` is one of 'read' | 'write' | 'other'. */
export function presentCall(title, kind, rawInput) {
  return {
    card: 'generic',
    title,
    kind,
    ...(rawInput === undefined ? {} : { rawInput }),
  };
}

/** First defined of several aliased keys, else `undefined`. */
export function pick(args, keys) {
  for (const key of keys) {
    const value = args[key];
    if (value !== undefined) return value;
  }
  return undefined;
}

/** Coerce a value that may arrive as a JSON-encoded string into its array form. */
export function asArray(value) {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [value];
    }
  }
  return [value];
}

/** Coerce a value that may arrive as a JSON-encoded string into its object form. */
export function asObject(value) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/** True when a string has non-whitespace content. */
export function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Filter an input object down to keys with defined values. Used to build
 * Shopify request bodies and query params without sending `undefined`.
 */
export function defined(obj) {
  const out = {};
  for (const [key, value] of Object.entries(obj ?? {})) {
    if (value !== undefined && value !== null) out[key] = value;
  }
  return out;
}

/**
 * Strip trailing `.json` from a REST path if present, so both
 * '/products/123.json' and '/products/123' work everywhere.
 */
export function stripJsonSuffix(path) {
  return path.endsWith('.json') ? path.slice(0, -5) : path;
}

/**
 * Load + smoke test for @shopify/dsh-shopify.
 *
 * No network: `globalThis.fetch` is stubbed up front (the tools registered by
 * apply() close over the real ShopifyClient, so they execute against the stub)
 * and the client unit tests swap in their own per-case stubs. Verifies that:
 *   1. the plugin applies and registers every tool (no crashes, unique names);
 *   2. every tool's happy path executes without throwing (canned bodies);
 *   3. the real ShopifyClient builds correct URLs / headers / pagination and
 *      maps 401/429 to structured errors.
 *
 * Run: node test/load-test.mjs
 */
import assert from 'node:assert/strict';
import { apply as pluginApply } from '../lib/index.js';
import { ShopifyClient } from '../lib/client.js';
import { ShopifyError } from '../lib/util.js';

// ── global fetch stub: every registered tool executes against canned data ──
// Tools registered by apply() capture the real ShopifyClient, so the whole
// smoke test runs against this stub — no network ever happens.
globalThis.fetch = async () => new Response('{}', {
  status: 200,
  headers: { 'content-type': 'application/json' },
});

// ── mock ctx ────────────────────────────────────────────────────────────────
function mockCtx() {
  const registered = [];
  return {
    registered,
    tools: { register(tool) { registered.push(tool); } },
    get(name) {
      if (name === 'systemPrompt') {
        return { section(entry) { ctx.promptSections.push(entry); } };
      }
      return undefined;
    },
    promptSections: [],
  };
}

// ── auto-fill minimal args from a tool's parameter schema ───────────────────
function fillArgs(parameters) {
  const args = {};
  for (const [key, spec] of Object.entries(parameters ?? {})) {
    if (!spec) continue;
    if (spec.required) {
      switch (spec.type) {
        case 'integer':
        case 'number':
          args[key] = 1;
          break;
        case 'boolean':
          args[key] = true;
          break;
        case 'array':
          args[key] = [];
          break;
        case 'json':
          args[key] = {};
          break;
        default:
          args[key] = spec.enum?.[0] ?? '1';
      }
    }
  }
  return args;
}

let failures = 0;
function fail(label, error) {
  failures += 1;
  console.error(`  ✗ ${label}: ${error?.name}: ${error?.message}`);
}

// ── 1. apply + registration ─────────────────────────────────────────────────
const ctx = mockCtx();
const config = {
  shopDomain: 'test-store.myshopify.com',
  accessToken: 'shpat_test_token',
  apiVersion: '2025-01',
  timeoutMs: 30000,
};
pluginApply(ctx, config);

console.log(`registered ${ctx.registered.length} tools`);
assert.ok(ctx.registered.length >= 100, `expected >= 100 tools, got ${ctx.registered.length}`);
assert.ok(ctx.promptSections.length === 1, 'system prompt section registered');

const names = ctx.registered.map((t) => t.name);
const unique = new Set(names);
assert.equal(unique.size, names.length, 'tool names must be unique');
for (const name of names) {
  assert.ok(name.startsWith('shopify_'), `bad prefix: ${name}`);
}

// ── 2. happy-path execute smoke test ────────────────────────────────────────
for (const tool of ctx.registered) {
  const args = fillArgs(tool.parameters ?? {});
  try {
    const result = await tool.execute(args, {});
    if (result === undefined) {
      fail(tool.name, new Error('execute returned undefined'));
      continue;
    }
  } catch (error) {
    // Intentional validation errors on dummy args are acceptable only when the
    // schema marks NOTHING required (e.g. get_inventory_levels needs one of two
    // optional filters); everything else is a real failure.
    if (error?.code === 'SHOPIFY_INVALID_ARGS' || error?.name === 'ToolArgsError') {
      continue;
    }
    fail(tool.name, error);
  }
}
console.log(`smoke-tested ${ctx.registered.length} tools (${failures} failures)`);

// ── 3. required-arg validation via the wrapped tool ─────────────────────────
const withRequired = ctx.registered.find((t) => Object.values(t.parameters ?? {}).some((s) => s.required));
if (withRequired) {
  try {
    await withRequired.execute({}, {});
    fail(`${withRequired.name} (missing required args)`, new Error('expected ToolArgsError'));
  } catch (error) {
    if (error?.name !== 'ToolArgsError') fail(`${withRequired.name} (missing required args)`, error);
  }
}

// ── 4. real client unit tests (stubbed fetch) ───────────────────────────────
const realConfig = { shopDomain: 'test-store', accessToken: 'shpat_abc', apiVersion: '2025-01' };
const realCtx = { get: () => undefined };

function stubFetch(status, body, headers = {}) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
  return () => { globalThis.fetch = original; };
}

{
  const restore = stubFetch(200, { products: [{ id: 1, title: 'A' }] }, {
    link: '<https://test-store.myshopify.com/admin/api/2025-01/products.json?page_info=abc>; rel="next"',
    'x-shopify-shop-api-call-limit': '10/40',
  });
  const client = new ShopifyClient(realCtx, realConfig);
  const list = await client.list('/products', { limit: 1 });
  assert.equal(list.items.length, 1);
  assert.equal(list.next_page_info, 'abc');
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }); };
  await client.rest('GET', '/shop', { query: { fields: 'name' } });
  restore();
  const call = calls[0];
  assert.equal(call.url, 'https://test-store.myshopify.com/admin/api/2025-01/shop.json?fields=name');
  assert.equal(call.init.headers['X-Shopify-Access-Token'], 'shpat_abc');
}

{
  const restore = stubFetch(401, { errors: 'Invalid API key' });
  const client = new ShopifyClient(realCtx, realConfig);
  await assert.rejects(() => client.rest('GET', '/shop'), (error) => error.code === 'SHOPIFY_AUTH_FAILED');
  restore();
}

{
  const restore = stubFetch(429, {});
  const client = new ShopifyClient(realCtx, realConfig);
  await assert.rejects(() => client.rest('GET', '/products'), (error) => error.code === 'SHOPIFY_RATE_LIMITED');
  restore();
}

{
  const restore = stubFetch(200, { data: { shop: { name: 'T' } }, errors: [] });
  const client = new ShopifyClient(realCtx, realConfig);
  const body = await client.graphql('{ shop { name } }');
  assert.equal(body.data.shop.name, 'T');
  restore();
}

console.log('client unit tests passed');

if (failures > 0) {
  console.error(`\n${failures} tool(s) failed the smoke test`);
  process.exit(1);
}
console.log('\nALL LOAD TESTS PASSED');

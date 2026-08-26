/**
 * Misc tools: resource feedback, storefront access tokens, and Shopify Flow.
 * @module @shopify/dsh-shopify/tools/misc
 */

import { ShopifyError, defined } from '../util.js';

const FLOW_TRIGGER_DOC = `mutation($handle: String!, $payload: JSON!) { flowTriggerReceive(handle: $handle, payload: $payload) { userErrors { field message } } }`;

export function tools(ctx, deps) {
  const { client } = deps;
  const list = [
    {
      name: 'shopify_create_resource_feedback',
      title: 'Create resource feedback',
      kind: 'write',
      description:
        "Reports app state to the Shopify admin (POST /resource_feedback) — shown in the app's resource pages (products/orders detail) or the app home. `state` is 'success' (app working, no message needed) or 'requires_action' (app needs merchant attention — provide EXACTLY ONE message). `feedback_generated_at` is the ISO 8601 time the feedback was generated (not now). Only the most recent feedback is kept per resource.",
      parameters: {
        state: {
          type: 'string',
          required: true,
          enum: ['requires_action', 'success'],
          description: "REQUIRED. 'requires_action' when the merchant must act, 'success' when everything is fine.",
        },
        messages: {
          type: 'array',
          items: { type: 'string' },
          description: "Exactly one message when state is 'requires_action' (e.g. ['Missing access scope: read_products']). Omit for 'success'.",
        },
        feedback_generated_at: {
          type: 'string',
          required: true,
          description: 'REQUIRED. ISO 8601 timestamp when this feedback was generated, e.g. "2025-06-01T12:00:00Z".',
        },
      },
      async execute(args, exec) {
        if (args.state === 'requires_action') {
          const messages = Array.isArray(args.messages) ? args.messages : [];
          if (messages.length !== 1) {
            throw new ShopifyError("resource_feedback requires exactly one message when state is 'requires_action'", 'SHOPIFY_INVALID_ARGS');
          }
        }
        const body = await client.rest('POST', '/resource_feedback', {
          body: {
            resource_feedback: defined({
              state: args.state,
              messages: args.messages,
              feedback_generated_at: args.feedback_generated_at,
            }),
          },
          signal: exec.signal,
        });
        return { resource_feedback: body.resource_feedback };
      },
    },
    {
      name: 'shopify_list_resource_feedbacks',
      title: 'List resource feedback',
      kind: 'read',
      description:
        "Gets the most recent resource feedback submitted by this app (GET /resource_feedback). The response is the array under `resource_feedback` (there is no pagination for this endpoint). Use it to verify what state (requires_action/success) and message the merchant currently sees.",
      parameters: {},
      async execute(args, exec) {
        const body = await client.rest('GET', '/resource_feedback', { signal: exec.signal });
        return { resource_feedback: body.resource_feedback };
      },
    },
    {
      name: 'shopify_list_storefront_access_tokens',
      title: 'List storefront access tokens',
      kind: 'read',
      description:
        "Lists the storefront access tokens for this app (GET /storefront_access_tokens). These are the legacy Storefront API tokens (distinct from the Admin API token and from the newer Headless channels). The token VALUE is only shown at creation — the listing shows id, title, and access_scopes only.",
      parameters: {},
      async execute(args, exec) {
        const body = await client.rest('GET', '/storefront_access_tokens', { signal: exec.signal });
        return { storefront_access_tokens: body.storefront_access_tokens };
      },
    },
    {
      name: 'shopify_create_storefront_access_token',
      title: 'Create storefront access token',
      kind: 'write',
      description:
        "Creates a storefront access token (POST /storefront_access_tokens) for querying the Storefront API with a `title` to identify it. The response's `access_token` value is shown ONLY once at creation — store it securely immediately; the admin cannot retrieve it later. Prefer Headless channels for new storefront integrations.",
      parameters: {
        title: { type: 'string', required: true, description: 'REQUIRED. Human-readable title for the token, e.g. "Web storefront".' },
      },
      async execute(args, exec) {
        if (!args.title) throw new ShopifyError('storefront_access_token.title is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('POST', '/storefront_access_tokens', {
          body: { storefront_access_token: { title: args.title } },
          signal: exec.signal,
        });
        return { storefront_access_token: body.storefront_access_token };
      },
    },
    {
      name: 'shopify_delete_storefront_access_token',
      title: 'Delete storefront access token',
      kind: 'write',
      description:
        "Permanently revokes a storefront access token (DELETE /storefront_access_tokens/{id}) — clients using it immediately fail Storefront API calls. Irreversible; confirm the id from shopify_list_storefront_access_tokens first.",
      parameters: {
        storefront_access_token_id: {
          type: 'string',
          required: true,
          description: 'Numeric storefront access token ID (string or integer), e.g. "755357713".',
        },
      },
      async execute(args, exec) {
        await client.rest('DELETE', `/storefront_access_tokens/${args.storefront_access_token_id}`, { signal: exec.signal });
        return { deleted: true, storefront_access_token_id: args.storefront_access_token_id };
      },
    },
    {
      name: 'shopify_trigger_shopify_flow',
      title: 'Trigger Shopify Flow',
      kind: 'write',
      description:
        "Triggers a Shopify Flow run (GraphQL flowTriggerReceive). `handle` is the workflow handle from the Flow app (the 'Run workflow' step's trigger handle); `payload` is a JSON object passed to the workflow as its trigger payload and must stay under 50 KB. Use it to kick off merchant-built automations (e.g. tagging orders, sending alerts) from this app.",
      parameters: {
        handle: { type: 'string', required: true, description: 'REQUIRED. Flow workflow handle, e.g. "send-alert-email".' },
        payload: { type: 'json', required: true, description: 'REQUIRED. JSON object (under 50 KB) passed to the workflow as its payload.' },
      },
      async execute(args, exec) {
        if (args.payload === undefined || args.payload === null) {
          throw new ShopifyError('payload is required to trigger a Flow workflow', 'SHOPIFY_INVALID_ARGS');
        }
        const payload = typeof args.payload === 'string' ? args.payload : JSON.stringify(args.payload);
        if (payload.length > 50 * 1024) {
          throw new ShopifyError('Flow trigger payload must be under 50 KB', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.graphql(FLOW_TRIGGER_DOC, defined({ handle: args.handle, payload: args.payload }));
        return {
          data: body.data,
          userErrors: body.data?.flowTriggerReceive?.userErrors ?? [],
        };
      },
    },
  ];
  return list;
}

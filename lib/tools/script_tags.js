/**
 * Script tag tools: list, get, create, update, and delete script tags.
 * @module @shopify/dsh-shopify/tools/script_tags
 */

import { ShopifyError, defined } from '../util.js';

export function tools(ctx, deps) {
  const { client } = deps;
  const list = [
    {
      name: 'shopify_list_script_tags',
      title: 'List script tags',
      kind: 'read',
      description:
        "Lists script tags (JavaScript loaded on the storefront). Filter by `src` for exact URL matches. Paginate with `page_info` from next_page_info (limit max 250). Script tags are deprecated in favor of App Blocks, but still work for older apps — use them to add analytics/chat widgets to the online store.",
      parameters: {
        limit: { type: 'integer', description: 'Max script tags per page (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only script tags created after this numeric script_tag_id.' },
        fields: { type: 'string', description: 'Comma-separated fields to return, e.g. "id,src,event,display_scope".' },
        src: { type: 'string', description: 'Filter by the script tag source URL, e.g. "https://example.com/widget.js".' },
        created_at_min: { type: 'string', description: 'ISO 8601 lower bound on creation time, e.g. "2025-01-01T00:00:00Z".' },
        created_at_max: { type: 'string', description: 'ISO 8601 upper bound on creation time.' },
        updated_at_min: { type: 'string', description: 'ISO 8601 lower bound on update time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 upper bound on update time.' },
        page_info: { type: 'string', description: "Cursor from a previous response's next_page_info; when present only `limit` and `fields` may accompany it." },
      },
      async execute(args, exec) {
        const listing = await client.list(
          '/script_tags',
          defined({
            limit: args.limit,
            since_id: args.since_id,
            fields: args.fields,
            src: args.src,
            created_at_min: args.created_at_min,
            created_at_max: args.created_at_max,
            updated_at_min: args.updated_at_min,
            updated_at_max: args.updated_at_max,
            page_info: args.page_info,
          }),
        );
        return { items: listing.items, count: listing.items.length, next_page_info: listing.next_page_info };
      },
    },
    {
      name: 'shopify_get_script_tag',
      title: 'Get script tag',
      kind: 'read',
      description:
        "Gets one script tag by its numeric script_tag_id (e.g. '870402791'). Use `fields` to limit the response, e.g. 'id,src,event,display_scope'.",
      parameters: {
        script_tag_id: { type: 'string', required: true, description: 'Numeric script tag ID (string or integer), e.g. "870402791".' },
        fields: { type: 'string', description: 'Comma-separated fields to return, e.g. "id,src,event,display_scope".' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/script_tags/${args.script_tag_id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { script_tag: body.script_tag };
      },
    },
    {
      name: 'shopify_create_script_tag',
      title: 'Create script tag',
      kind: 'write',
      description:
        "Creates a script tag that loads a JavaScript file on the storefront. `src` MUST be an HTTPS URL (Shopify rejects http://). `event` is always 'onload'. `display_scope` controls where it loads — 'online_store' (recommended: the live theme pages) or 'order_status' (post-checkout thank-you page); 'all' is not commonly needed. `cache=true` (default) lets Shopify cache the file. Script tags are deprecated in favor of App Blocks for new work.",
      parameters: {
        src: { type: 'string', required: true, description: 'REQUIRED. HTTPS URL of the JavaScript file, e.g. "https://example.com/widget.js".' },
        event: { type: 'string', required: true, enum: ['onload'], description: "REQUIRED. Load event; Shopify only supports 'onload'." },
        display_scope: { type: 'string', enum: ['online_store', 'order_status', 'all'], description: "Where the tag loads: 'online_store' (recommended) | 'order_status' | 'all'. Defaults to online_store." },
        cache: { type: 'boolean', description: 'Whether Shopify may cache the script (default true).' },
      },
      async execute(args, exec) {
        if (!args.src) throw new ShopifyError('script_tag.src is required', 'SHOPIFY_INVALID_ARGS');
        if (!/^https:\/\//i.test(args.src)) throw new ShopifyError('script_tag.src must be an HTTPS URL', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('POST', '/script_tags', {
          body: {
            script_tag: defined({
              src: args.src,
              event: args.event,
              display_scope: args.display_scope,
              cache: args.cache,
            }),
          },
          signal: exec.signal,
        });
        return { script_tag: body.script_tag };
      },
    },
    {
      name: 'shopify_update_script_tag',
      title: 'Update script tag',
      kind: 'write',
      description:
        "Updates an existing script tag: change `src` (must stay HTTPS), `event`, `display_scope`, or `cache`. Only provided fields are changed. Note script tags are deprecated in favor of App Blocks for new work.",
      parameters: {
        script_tag_id: { type: 'string', required: true, description: 'Numeric script tag ID (string or integer), e.g. "870402791".' },
        src: { type: 'string', description: 'New HTTPS URL of the JavaScript file, e.g. "https://example.com/widget.js".' },
        event: { type: 'string', enum: ['onload'], description: "Load event; Shopify only supports 'onload'." },
        display_scope: { type: 'string', enum: ['online_store', 'order_status', 'all'], description: "Where the tag loads: 'online_store' | 'order_status' | 'all'." },
        cache: { type: 'boolean', description: 'Whether Shopify may cache the script.' },
      },
      async execute(args, exec) {
        if (args.src !== undefined && !/^https:\/\//i.test(args.src)) {
          throw new ShopifyError('script_tag.src must be an HTTPS URL', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('PUT', `/script_tags/${args.script_tag_id}`, {
          body: {
            script_tag: defined({
              src: args.src,
              event: args.event,
              display_scope: args.display_scope,
              cache: args.cache,
            }),
          },
          signal: exec.signal,
        });
        return { script_tag: body.script_tag };
      },
    },
    {
      name: 'shopify_delete_script_tag',
      title: 'Delete script tag',
      kind: 'write',
      description:
        "Deletes a script tag by its numeric script_tag_id. Irreversible — the JavaScript stops loading on the storefront immediately. Use shopify_list_script_tags first to confirm the id.",
      parameters: {
        script_tag_id: { type: 'string', required: true, description: 'Numeric script tag ID (string or integer), e.g. "870402791".' },
      },
      async execute(args, exec) {
        await client.rest('DELETE', `/script_tags/${args.script_tag_id}`, { signal: exec.signal });
        return { deleted: true, script_tag_id: args.script_tag_id };
      },
    },
  ];
  return list;
}

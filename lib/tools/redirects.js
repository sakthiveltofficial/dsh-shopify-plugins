/**
 * Redirect tools: list, get, create, update, and delete URL redirects.
 * @module @shopify/dsh-shopify/tools/redirects
 */

import { ShopifyError, defined } from '../util.js';

export function tools(ctx, deps) {
  const { client } = deps;
  const list = [
    {
      name: 'shopify_list_redirects',
      title: 'List redirects',
      kind: 'read',
      description:
        "Lists URL redirects (old path → new target). Audit existing redirects before creating or updating: filter with `path` or `target` for exact matches. Paginate with `page_info` from next_page_info (limit max 250). IDs are numeric strings (e.g. '302421').",
      parameters: {
        limit: { type: 'integer', description: 'Max redirects per page (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only redirects created after this numeric redirect_id.' },
        fields: { type: 'string', description: 'Comma-separated fields to return, e.g. "id,path,target".' },
        path: { type: 'string', description: 'Filter by the redirect source path, e.g. "/old-page".' },
        target: { type: 'string', description: 'Filter by the redirect destination, e.g. "/new-page" or a full URL.' },
        page_info: { type: 'string', description: "Cursor from a previous response's next_page_info; when present only `limit` and `fields` may accompany it." },
      },
      async execute(args, exec) {
        const listing = await client.list(
          '/redirects',
          defined({
            limit: args.limit,
            since_id: args.since_id,
            fields: args.fields,
            path: args.path,
            target: args.target,
            page_info: args.page_info,
          }),
        );
        return { items: listing.items, count: listing.items.length, next_page_info: listing.next_page_info };
      },
    },
    {
      name: 'shopify_get_redirect',
      title: 'Get redirect',
      kind: 'read',
      description:
        "Gets one URL redirect by its numeric redirect_id (e.g. '302421'). Use `fields` to limit the response to the columns you need, e.g. 'id,path,target'.",
      parameters: {
        redirect_id: { type: 'string', required: true, description: 'Numeric redirect ID (string or integer), e.g. "302421".' },
        fields: { type: 'string', description: 'Comma-separated fields to return, e.g. "id,path,target".' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/redirects/${args.redirect_id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { redirect: body.redirect };
      },
    },
    {
      name: 'shopify_create_redirect',
      title: 'Create redirect',
      kind: 'write',
      description:
        "Creates a 301 URL redirect. `path` (max 1024 chars) is the old URL path that visitors will hit, e.g. '/products/old-product'; `target` (max 255 chars) is where they land instead, e.g. '/products/new-product' or a full URL. Duplicate paths are rejected by Shopify. Useful after deleting/renaming products, collections, or pages to avoid 404s.",
      parameters: {
        path: { type: 'string', required: true, description: 'REQUIRED. Source URL path (max 1024 chars), e.g. "/old-page".' },
        target: { type: 'string', required: true, description: 'REQUIRED. Destination path or URL (max 255 chars), e.g. "/new-page".' },
      },
      async execute(args, exec) {
        if (!args.path) throw new ShopifyError('redirect.path is required', 'SHOPIFY_INVALID_ARGS');
        if (!args.target) throw new ShopifyError('redirect.target is required', 'SHOPIFY_INVALID_ARGS');
        if (args.path.length > 1024) throw new ShopifyError('redirect.path must be at most 1024 characters', 'SHOPIFY_INVALID_ARGS');
        if (args.target.length > 255) throw new ShopifyError('redirect.target must be at most 255 characters', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('POST', '/redirects', {
          body: { redirect: { path: args.path, target: args.target } },
          signal: exec.signal,
        });
        return { redirect: body.redirect };
      },
    },
    {
      name: 'shopify_update_redirect',
      title: 'Update redirect',
      kind: 'write',
      description:
        "Updates an existing URL redirect's `path` and/or `target`. At least one of the two must be provided; omitted fields stay unchanged. `path` max 1024 chars, `target` max 255 chars. Changing `path` re-points the old URL — confirm the old path is no longer referenced before updating.",
      parameters: {
        redirect_id: { type: 'string', required: true, description: 'Numeric redirect ID (string or integer), e.g. "302421".' },
        path: { type: 'string', description: 'New source URL path (max 1024 chars), e.g. "/old-page".' },
        target: { type: 'string', description: 'New destination path or URL (max 255 chars), e.g. "/new-page".' },
      },
      async execute(args, exec) {
        if (args.path === undefined && args.target === undefined) {
          throw new ShopifyError('at least one of path or target must be provided to update a redirect', 'SHOPIFY_INVALID_ARGS');
        }
        if (args.path !== undefined && args.path.length > 1024) throw new ShopifyError('redirect.path must be at most 1024 characters', 'SHOPIFY_INVALID_ARGS');
        if (args.target !== undefined && args.target.length > 255) throw new ShopifyError('redirect.target must be at most 255 characters', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('PUT', `/redirects/${args.redirect_id}`, {
          body: { redirect: defined({ path: args.path, target: args.target }) },
          signal: exec.signal,
        });
        return { redirect: body.redirect };
      },
    },
    {
      name: 'shopify_delete_redirect',
      title: 'Delete redirect',
      kind: 'write',
      description:
        "Deletes a URL redirect by its numeric redirect_id. Irreversible — the old path will start 404ing again. Use shopify_list_redirects first to confirm the redirect id and target.",
      parameters: {
        redirect_id: { type: 'string', required: true, description: 'Numeric redirect ID (string or integer), e.g. "302421".' },
      },
      async execute(args, exec) {
        await client.rest('DELETE', `/redirects/${args.redirect_id}`, { signal: exec.signal });
        return { deleted: true, redirect_id: args.redirect_id };
      },
    },
  ];
  return list;
}

/**
 * Metafield tools: REST get/create/update/delete plus GraphQL bulk
 * set/delete on any supported resource.
 * @module @shopify/dsh-shopify/tools/metafields
 */

import { ShopifyError, asObject, defined } from '../util.js';

const RESOURCES = [
  'products', 'customers', 'blogs', 'collections', 'orders', 'pages',
  'variants', 'articles', 'draft_orders', 'locations', 'product_images',
  'smart_collections', 'shop',
];

/** Throw SHOPIFY_INVALID_ARGS when any of `keys` is missing/blank in `args`. */
function required(args, keys) {
  for (const key of keys) {
    if (args[key] === undefined || args[key] === null || args[key] === '') {
      throw new ShopifyError(`${key} is required`, 'SHOPIFY_INVALID_ARGS');
    }
  }
}

/**
 * Convert an owner id to a GraphQL GID: numeric ids become
 * `gid://shopify/{owner}/{id}`; values that already look like a GID
 * (`gid://...`) pass through unchanged.
 */
function toGid(owner, ownerId) {
  const raw = String(ownerId);
  return raw.startsWith('gid://') ? raw : `gid://shopify/${owner}/${raw}`;
}

/** Validate one GraphQL metafield input; returns the clean input object. */
function gqlInput(item, keys, label) {
  const input = asObject(item) ?? {};
  for (const key of keys) {
    if (input[key] === undefined || input[key] === null || input[key] === '') {
      throw new ShopifyError(`metafields[].${key} is required (${label})`, 'SHOPIFY_INVALID_ARGS');
    }
  }
  if (!input.owner) {
    throw new ShopifyError(`metafields[].owner is required (${label})`, 'SHOPIFY_INVALID_ARGS');
  }
  return input;
}

export function tools(ctx, deps) {
  const { client } = deps;
  return [
    {
      name: 'shopify_get_metafields',
      title: 'List metafields',
      kind: 'read',
      description:
        "Lists metafields, optionally filtered by owner (metafield_owner_resource e.g. 'product' plus metafield_owner_id), namespace and key. Metafield ids are long numeric REST ids — always fetch fresh ones before update/delete, since recreating a metafield assigns a new id. Prefer shopify_get_resource_metafields when you already know the owner resource, and shopify_set_metafields for bulk writes.",
      parameters: {
        metafield_owner_id: { type: 'integer', description: 'Only metafields owned by this resource id (numeric REST id).' },
        metafield_owner_resource: { type: 'string', description: "Only metafields owned by this resource type, e.g. 'product', 'variant', 'order'." },
        namespace: { type: 'string', description: 'Filter by namespace (3-255 chars).' },
        key: { type: 'string', description: 'Filter by key (3-64 chars).' },
        limit: { type: 'integer', description: 'Maximum metafields per page (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only metafields with id greater than this numeric REST id.' },
        fields: { type: 'string', description: 'Comma-separated subset of metafield fields, e.g. "id,namespace,key,value,type".' },
        created_at_min: { type: 'string', description: 'ISO 8601 — only metafields created at or after this time.' },
        created_at_max: { type: 'string', description: 'ISO 8601 — only metafields created at or before this time.' },
        updated_at_min: { type: 'string', description: 'ISO 8601 — only metafields updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 — only metafields updated at or before this time.' },
        page_info: { type: 'string', description: "Cursor from a previous response's next_page_info; when present, only limit/fields may accompany it." },
      },
      async execute(args, exec) {
        const query = args.page_info
          ? defined({ page_info: args.page_info, limit: args.limit, fields: args.fields })
          : defined({
              metafield_owner_id: args.metafield_owner_id,
              metafield_owner_resource: args.metafield_owner_resource,
              namespace: args.namespace,
              key: args.key,
              limit: args.limit,
              since_id: args.since_id,
              fields: args.fields,
              created_at_min: args.created_at_min,
              created_at_max: args.created_at_max,
              updated_at_min: args.updated_at_min,
              updated_at_max: args.updated_at_max,
            });
        const { items, next_page_info } = await client.list('/metafields', query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_metafield',
      title: 'Get metafield',
      kind: 'read',
      description:
        'Gets a single metafield by its numeric REST id (metafield_id, string or integer). Metafield ids change when a metafield is recreated — always fetch fresh ids (e.g. via shopify_get_metafields) before update/delete. Pass fields to trim the response.',
      parameters: {
        metafield_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the metafield.' },
        fields: { type: 'string', description: 'Comma-separated subset of metafield fields to return.' },
      },
      async execute(args, exec) {
        required(args, ['metafield_id']);
        const body = await client.rest('GET', `/metafields/${args.metafield_id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { metafield: body.metafield };
      },
    },
    {
      name: 'shopify_create_metafield',
      title: 'Create metafield',
      kind: 'write',
      description:
        'Creates a metafield on a resource. namespace (3-255 chars) + key (3-64 chars) must be unique per owner — a duplicate on the same owner fails with a 422; use shopify_update_metafield to change an existing one instead. value must be a string matching the type format (e.g. JSON.stringify an object for type json). With resource+resource_id (e.g. resource=products, resource_id=123) it POSTs to /products/123/metafields; without them (or with resource=shop) it POSTs to /metafields.',
      parameters: {
        namespace: { type: 'string', required: true, description: 'REQUIRED. Namespace, 3-255 chars (e.g. "custom"). Unique per key per owner.' },
        key: { type: 'string', required: true, description: 'REQUIRED. Key, 3-64 chars (e.g. "subtitle"). Unique per namespace per owner.' },
        value: { type: 'string', required: true, description: 'REQUIRED. Value as a string matching the type format (JSON.stringify objects for type json).' },
        type: { type: 'string', required: true, description: 'REQUIRED. Metafield type, e.g. single_line_text_field, multi_line_text_field, number_integer, number_decimal, boolean, json, date, date_time, url, product_reference, variant_reference.' },
        resource: { type: 'string', enum: RESOURCES, description: "Owner resource (plural, e.g. 'products', 'variants', 'shop'). With resource_id it POSTs to /{resource}/{resource_id}/metafields; 'shop' or omitted POSTs to /metafields." },
        resource_id: { type: 'string', description: 'Numeric REST id of the owner resource; only used together with resource.' },
        description: { type: 'string', description: 'Optional human-readable description of the metafield.' },
      },
      async execute(args, exec) {
        required(args, ['namespace', 'key', 'value', 'type']);
        const metafield = defined({
          namespace: args.namespace,
          key: args.key,
          value: args.value,
          type: args.type,
          description: args.description,
        });
        let body;
        if (args.resource && args.resource_id !== undefined && args.resource_id !== null && args.resource_id !== '') {
          body = await client.rest('POST', `/${args.resource}/${args.resource_id}/metafields`, {
            body: { metafield },
            signal: exec.signal,
          });
        } else {
          body = await client.rest('POST', '/metafields', { body: { metafield }, signal: exec.signal });
        }
        return { metafield: body.metafield };
      },
    },
    {
      name: 'shopify_update_metafield',
      title: 'Update metafield',
      kind: 'write',
      description:
        'Updates an existing metafield (value, type, description). metafield_id is the numeric REST id — fetch a fresh one first, since recreating a metafield changes its id. The namespace/key of an existing metafield cannot be changed; delete and recreate instead.',
      parameters: {
        metafield_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the metafield to update.' },
        value: { type: 'string', description: 'New value as a string matching the type format.' },
        type: { type: 'string', description: 'New metafield type, e.g. single_line_text_field, number_integer, json.' },
        description: { type: 'string', description: 'New human-readable description.' },
      },
      async execute(args, exec) {
        required(args, ['metafield_id']);
        const body = await client.rest('PUT', `/metafields/${args.metafield_id}`, {
          body: {
            metafield: defined({
              value: args.value,
              type: args.type,
              description: args.description,
            }),
          },
          signal: exec.signal,
        });
        return { metafield: body.metafield };
      },
    },
    {
      name: 'shopify_delete_metafield',
      title: 'Delete metafield',
      kind: 'write',
      description:
        'Permanently deletes a metafield by its numeric REST id. Irreversible — confirm with the user before executing. Requires write_metafields scope.',
      parameters: {
        metafield_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the metafield to delete.' },
      },
      async execute(args, exec) {
        required(args, ['metafield_id']);
        await client.rest('DELETE', `/metafields/${args.metafield_id}`, { signal: exec.signal });
        return { deleted: true, metafield_id: args.metafield_id };
      },
    },
    {
      name: 'shopify_get_resource_metafields',
      title: 'List resource metafields',
      kind: 'read',
      description:
        "Lists the metafields owned by one resource, e.g. GET /products/123/metafields (resource='products', resource_id=123). resource is the plural owner type (products|variants|orders|pages|customers|blogs|collections|draft_orders|locations|product_images|smart_collections|articles|shop). Optionally filter by namespace, key or metafield_type. Loop with page_info until next_page_info is null.",
      parameters: {
        resource: { type: 'string', required: true, enum: RESOURCES, description: 'REQUIRED. Plural owner resource type, e.g. "products", "variants", "shop".' },
        resource_id: { type: 'string', required: true, description: 'REQUIRED. Numeric REST id of the owner resource.' },
        namespace: { type: 'string', description: 'Filter by namespace (3-255 chars).' },
        key: { type: 'string', description: 'Filter by key (3-64 chars).' },
        metafield_type: { type: 'string', description: 'Filter by metafield type, e.g. single_line_text_field, number_integer.' },
        limit: { type: 'integer', description: 'Maximum metafields per page (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only metafields with id greater than this numeric REST id.' },
        fields: { type: 'string', description: 'Comma-separated subset of metafield fields to return.' },
        created_at_min: { type: 'string', description: 'ISO 8601 — only metafields created at or after this time.' },
        created_at_max: { type: 'string', description: 'ISO 8601 — only metafields created at or before this time.' },
        updated_at_min: { type: 'string', description: 'ISO 8601 — only metafields updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 — only metafields updated at or before this time.' },
        page_info: { type: 'string', description: "Cursor from a previous response's next_page_info; when present, only limit/fields may accompany it." },
      },
      async execute(args, exec) {
        required(args, ['resource', 'resource_id']);
        const query = args.page_info
          ? defined({ page_info: args.page_info, limit: args.limit, fields: args.fields })
          : defined({
              namespace: args.namespace,
              key: args.key,
              metafield_type: args.metafield_type,
              limit: args.limit,
              since_id: args.since_id,
              fields: args.fields,
              created_at_min: args.created_at_min,
              created_at_max: args.created_at_max,
              updated_at_min: args.updated_at_min,
              updated_at_max: args.updated_at_max,
            });
        const { items, next_page_info } = await client.list(`/${args.resource}/${args.resource_id}/metafields`, query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_set_metafields',
      title: 'Set metafields (GraphQL)',
      kind: 'write',
      description:
        "Creates or updates up to 25 metafields in one GraphQL metafieldsSet call. Each input: owner (type name, e.g. 'Product', 'Order', 'Variant'), ownerId (GID like gid://shopify/Product/123 or a numeric id, converted automatically), namespace (3-255), key (3-64), value (string matching the type format), type, and optional description. namespace+key must be unique per owner. Returned userErrors carry validation failures (e.g. duplicate namespace/key).",
      parameters: {
        metafields: {
          type: 'array',
          required: true,
          items: { type: 'json' },
          description: 'REQUIRED. Array (max 25) of { owner, ownerId, namespace, key, value, type, description? }. ownerId accepts a GID or a numeric id.',
        },
      },
      async execute(args, exec) {
        if (!Array.isArray(args.metafields) || args.metafields.length === 0) {
          throw new ShopifyError('metafields array is required', 'SHOPIFY_INVALID_ARGS');
        }
        if (args.metafields.length > 25) {
          throw new ShopifyError('metafieldsSet accepts at most 25 metafields per call', 'SHOPIFY_INVALID_ARGS');
        }
        const inputs = args.metafields.map((item) => {
          const input = gqlInput(item, ['owner', 'ownerId', 'namespace', 'key', 'value', 'type'], 'metafieldsSet');
          return defined({
            owner: input.owner,
            ownerId: toGid(input.owner, input.ownerId),
            namespace: input.namespace,
            key: input.key,
            value: input.value,
            type: input.type,
            description: input.description,
          });
        });
        const document = `mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    metafields { id key namespace value type }
    userErrors { field message }
  }
}`;
        const body = await client.graphql(document, { metafields: inputs });
        return { data: body.data, userErrors: body.data?.metafieldsSet?.userErrors ?? [] };
      },
    },
    {
      name: 'shopify_bulk_delete_metafields',
      title: 'Bulk delete metafields (GraphQL)',
      kind: 'write',
      description:
        "Deletes metafields in one GraphQL metafieldsDelete call. Each input: owner (type name, e.g. 'Product'), ownerId (GID or numeric id, converted automatically), namespace and key. Only metafields created by this app can be deleted — others return a userError. Requires write_metafields scope.",
      parameters: {
        metafields: {
          type: 'array',
          required: true,
          items: { type: 'json' },
          description: 'REQUIRED. Array of { owner, ownerId, namespace, key }. ownerId accepts a GID or a numeric id.',
        },
      },
      async execute(args, exec) {
        if (!Array.isArray(args.metafields) || args.metafields.length === 0) {
          throw new ShopifyError('metafields array is required', 'SHOPIFY_INVALID_ARGS');
        }
        const inputs = args.metafields.map((item) => {
          const input = gqlInput(item, ['owner', 'ownerId', 'namespace', 'key'], 'metafieldsDelete');
          return defined({
            owner: input.owner,
            ownerId: toGid(input.owner, input.ownerId),
            namespace: input.namespace,
            key: input.key,
          });
        });
        const document = `mutation metafieldsDelete($metafields: [MetafieldsDeleteInput!]!) {
  metafieldsDelete(metafields: $metafields) {
    deletedMetafields { id }
    userErrors { field message }
  }
}`;
        const body = await client.graphql(document, { metafields: inputs });
        return { data: body.data, userErrors: body.data?.metafieldsDelete?.userErrors ?? [] };
      },
    },
  ];
}

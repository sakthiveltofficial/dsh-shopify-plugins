/**
 * Collection tools: custom (manual) collections, smart (rule-based)
 * collections, and the Collects API that links products to custom
 * collections.
 * @module @shopify/dsh-shopify/tools/collections
 */

import { ShopifyError, defined, asArray, asObject } from '../util.js';

const PAGE_INFO_HINT =
  'Reuse next_page_info from the previous response to fetch the next page; when page_info is present, only limit (and fields where documented) may accompany it.';

const LIMIT_PARAM = { type: 'integer', description: 'Maximum number of results per page (1–250, default 50).' };
const SINCE_ID_PARAM = {
  type: 'string',
  description: 'Return only resources with id greater than this numeric id (offset-style pagination; do not combine with page_info).',
};
const FIELDS_PARAM = {
  type: 'string',
  description: 'Comma-separated list of resource fields to include in the response (e.g. "id,title,handle").',
};
const PUBLISHED_STATUS_PARAM = {
  type: 'string',
  enum: ['published', 'unpublished', 'any'],
  description: 'Filter by storefront publish state: published | unpublished | any (default).',
};
const SORT_ORDER_PARAM = {
  type: 'string',
  enum: ['alpha-asc', 'alpha-desc', 'best-selling', 'created', 'created-desc', 'manual', 'price-asc', 'price-desc', 'updated', 'updated-desc'],
  description: 'How products inside the collection are ordered. "manual" honors the position set via shopify_add_product_to_custom_collection.',
};

function requireArg(args, key, label) {
  const value = args[key];
  if (value === undefined || value === null || value === '') {
    throw new ShopifyError(`${label} is required`, 'SHOPIFY_INVALID_ARGS');
  }
  return value;
}

/** Coerce an array-of-objects arg that may arrive as a JSON string. */
function objectArray(value) {
  return asArray(value)?.map(asObject);
}

export function tools(ctx, deps) {
  const { client } = deps;
  return [
    {
      name: 'shopify_list_custom_collections',
      title: 'List custom collections',
      kind: 'read',
      description:
        'Lists CUSTOM (manual) collections — collections whose product membership is curated by hand via collects, not rules. Returns up to 250 per page with next_page_info for cursor pagination. Filter by ids (comma string), title, handle, product_id (find every custom collection containing a product), published_status, and updated_at/published_at date ranges (ISO 8601). Use shopify_list_smart_collections for rule-based collections. Collection IDs are numeric strings (e.g. \'8313381814466\').',
      parameters: {
        ids: { type: 'string', description: 'Comma-separated list of collection ids to fetch (e.g. "8313381814466,8313381814467").' },
        limit: LIMIT_PARAM,
        since_id: SINCE_ID_PARAM,
        page_info: { type: 'string', description: `Opaque cursor for the next page. ${PAGE_INFO_HINT}` },
        fields: FIELDS_PARAM,
        title: { type: 'string', description: 'Filter by exact collection title.' },
        handle: { type: 'string', description: 'Filter by the collection handle (URL slug).' },
        product_id: { type: 'string', description: 'Return only collections that contain this product id.' },
        published_status: PUBLISHED_STATUS_PARAM,
        updated_at_min: { type: 'string', description: 'ISO 8601 timestamp; return collections updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 timestamp; return collections updated at or before this time.' },
        published_at_min: { type: 'string', description: 'ISO 8601 timestamp; return collections published at or after this time.' },
        published_at_max: { type: 'string', description: 'ISO 8601 timestamp; return collections published at or before this time.' },
      },
      async execute(args, exec) {
        const query = defined({
          ids: args.ids,
          limit: args.limit,
          since_id: args.since_id,
          page_info: args.page_info,
          fields: args.fields,
          title: args.title,
          handle: args.handle,
          product_id: args.product_id,
          published_status: args.published_status,
          updated_at_min: args.updated_at_min,
          updated_at_max: args.updated_at_max,
          published_at_min: args.published_at_min,
          published_at_max: args.published_at_max,
        });
        const { items, next_page_info } = await client.list('/custom_collections', query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_custom_collection',
      title: 'Get custom collection',
      kind: 'read',
      description:
        'Gets a single CUSTOM collection by its numeric id (e.g. \'8313381814466\'); pass fields (comma string) to limit the response. Custom collections hold manually curated products — for rule-based collections use shopify_get_smart_collection.',
      parameters: {
        custom_collection_id: { type: 'string', required: true, description: 'Numeric id of the custom collection to fetch.' },
        fields: FIELDS_PARAM,
      },
      async execute(args, exec) {
        const id = requireArg(args, 'custom_collection_id', 'custom_collection_id');
        const body = await client.rest('GET', `/custom_collections/${id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { custom_collection: body.custom_collection };
      },
    },
    {
      name: 'shopify_create_custom_collection',
      title: 'Create custom collection',
      kind: 'write',
      description:
        'Creates a CUSTOM (manual) collection; title is required. body_html is the description HTML; handle auto-generates from the title if omitted; published controls storefront visibility; published_scope is web | global; sort_order "manual" preserves the order defined by collect positions; collects accepts [{ product_id, position }] to seed membership; metafields seeds custom fields; image is { src, alt, position }. Products can only be added to CUSTOM collections — smart collections are rule-driven and cannot use this endpoint.',
      parameters: {
        title: { type: 'string', required: true, description: 'REQUIRED. Collection title.' },
        body_html: { type: 'string', description: 'Description shown on the storefront, as HTML.' },
        handle: { type: 'string', description: 'URL slug; auto-generated from title when omitted. Changing it later affects storefront URLs/SEO.' },
        image: { type: 'json', description: 'Collection image: { src (public HTTPS URL) or attachment (base64), alt, position }.' },
        published: { type: 'boolean', description: 'Whether the collection is published to the storefront (default false).' },
        published_scope: { type: 'string', enum: ['web', 'global'], description: 'web = online store only; global = all sales channels (default web).' },
        sort_order: SORT_ORDER_PARAM,
        template_suffix: { type: 'string', description: 'Theme template suffix (e.g. "custom") used to render the collection page.' },
        metafields: { type: 'array', items: { type: 'json' }, description: 'Metafields to create on the collection: [{ namespace, key, value, type }].' },
        collects: { type: 'array', items: { type: 'json' }, description: 'Seed product membership: [{ product_id, position }].' },
      },
      async execute(args, exec) {
        const title = requireArg(args, 'title', 'title');
        const body = {
          custom_collection: defined({
            title,
            body_html: args.body_html,
            handle: args.handle,
            image: asObject(args.image),
            published: args.published,
            published_scope: args.published_scope,
            sort_order: args.sort_order,
            template_suffix: args.template_suffix,
            metafields: objectArray(args.metafields),
            collects: objectArray(args.collects),
          }),
        };
        const result = await client.rest('POST', '/custom_collections', { body, signal: exec.signal });
        return { custom_collection: result.custom_collection };
      },
    },
    {
      name: 'shopify_update_custom_collection',
      title: 'Update custom collection',
      kind: 'write',
      description:
        'Updates a CUSTOM collection by its numeric id. Accepts the same body keys as create (title, body_html, handle, image, published, published_scope, sort_order, template_suffix, metafields). Changing handle affects storefront URLs/SEO. Membership is managed separately with shopify_add_product_to_custom_collection / shopify_remove_product_from_collection.',
      parameters: {
        custom_collection_id: { type: 'string', required: true, description: 'Numeric id of the custom collection to update.' },
        title: { type: 'string', description: 'New collection title.' },
        body_html: { type: 'string', description: 'Description shown on the storefront, as HTML.' },
        handle: { type: 'string', description: 'URL slug. WARNING: changing it affects storefront URLs/SEO.' },
        image: { type: 'json', description: 'Collection image: { src or attachment, alt, position }.' },
        published: { type: 'boolean', description: 'Whether the collection is published to the storefront.' },
        published_scope: { type: 'string', enum: ['web', 'global'], description: 'web = online store only; global = all sales channels.' },
        sort_order: SORT_ORDER_PARAM,
        template_suffix: { type: 'string', description: 'Theme template suffix (e.g. "custom") used to render the collection page.' },
        metafields: { type: 'array', items: { type: 'json' }, description: 'Metafields to write on the collection: [{ namespace, key, value, type }].' },
      },
      async execute(args, exec) {
        const id = requireArg(args, 'custom_collection_id', 'custom_collection_id');
        const body = {
          custom_collection: defined({
            title: args.title,
            body_html: args.body_html,
            handle: args.handle,
            image: asObject(args.image),
            published: args.published,
            published_scope: args.published_scope,
            sort_order: args.sort_order,
            template_suffix: args.template_suffix,
            metafields: objectArray(args.metafields),
          }),
        };
        const result = await client.rest('PUT', `/custom_collections/${id}`, { body, signal: exec.signal });
        return { custom_collection: result.custom_collection };
      },
    },
    {
      name: 'shopify_delete_custom_collection',
      title: 'Delete custom collection',
      kind: 'write',
      description:
        'Deletes a CUSTOM collection by its numeric id. Only the collection is removed (its products remain); its collects links are deleted with it. Use shopify_list_custom_collections to confirm the id first.',
      parameters: {
        custom_collection_id: { type: 'string', required: true, description: 'Numeric id of the custom collection to delete.' },
      },
      async execute(args, exec) {
        const id = requireArg(args, 'custom_collection_id', 'custom_collection_id');
        await client.rest('DELETE', `/custom_collections/${id}`, { signal: exec.signal });
        return { deleted: true };
      },
    },
    {
      name: 'shopify_count_custom_collections',
      title: 'Count custom collections',
      kind: 'read',
      description:
        'Counts CUSTOM collections matching the filters (title, product_id, published_status, updated_at/published_at date ranges). Cheap way to size a collection set before paging; returns { count }.',
      parameters: {
        title: { type: 'string', description: 'Count only collections with this exact title.' },
        product_id: { type: 'string', description: 'Count only collections that contain this product id.' },
        published_status: PUBLISHED_STATUS_PARAM,
        updated_at_min: { type: 'string', description: 'ISO 8601 timestamp; count collections updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 timestamp; count collections updated at or before this time.' },
        published_at_min: { type: 'string', description: 'ISO 8601 timestamp; count collections published at or after this time.' },
        published_at_max: { type: 'string', description: 'ISO 8601 timestamp; count collections published at or before this time.' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', '/custom_collections/count', {
          query: defined({
            title: args.title,
            product_id: args.product_id,
            published_status: args.published_status,
            updated_at_min: args.updated_at_min,
            updated_at_max: args.updated_at_max,
            published_at_min: args.published_at_min,
            published_at_max: args.published_at_max,
          }),
          signal: exec.signal,
        });
        return { count: body.count };
      },
    },
    {
      name: 'shopify_list_smart_collections',
      title: 'List smart collections',
      kind: 'read',
      description:
        'Lists SMART (rule-based) collections — membership is auto-computed from rules (title, price, tag, vendor, etc.), so there are no manual product links. Same filters as custom collections: ids, title, handle, product_id, published_status, date ranges, plus limit/since_id/page_info. Use shopify_add_product_to_custom_collection / shopify_get_collects only for CUSTOM collections.',
      parameters: {
        ids: { type: 'string', description: 'Comma-separated list of collection ids to fetch (e.g. "8313381814466,8313381814467").' },
        limit: LIMIT_PARAM,
        since_id: SINCE_ID_PARAM,
        page_info: { type: 'string', description: `Opaque cursor for the next page. ${PAGE_INFO_HINT}` },
        fields: FIELDS_PARAM,
        title: { type: 'string', description: 'Filter by exact collection title.' },
        handle: { type: 'string', description: 'Filter by the collection handle (URL slug).' },
        product_id: { type: 'string', description: 'Return only collections whose rules match this product id.' },
        published_status: PUBLISHED_STATUS_PARAM,
        updated_at_min: { type: 'string', description: 'ISO 8601 timestamp; return collections updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 timestamp; return collections updated at or before this time.' },
        published_at_min: { type: 'string', description: 'ISO 8601 timestamp; return collections published at or after this time.' },
        published_at_max: { type: 'string', description: 'ISO 8601 timestamp; return collections published at or before this time.' },
      },
      async execute(args, exec) {
        const query = defined({
          ids: args.ids,
          limit: args.limit,
          since_id: args.since_id,
          page_info: args.page_info,
          fields: args.fields,
          title: args.title,
          handle: args.handle,
          product_id: args.product_id,
          published_status: args.published_status,
          updated_at_min: args.updated_at_min,
          updated_at_max: args.updated_at_max,
          published_at_min: args.published_at_min,
          published_at_max: args.published_at_max,
        });
        const { items, next_page_info } = await client.list('/smart_collections', query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_smart_collection',
      title: 'Get smart collection',
      kind: 'read',
      description:
        "Gets a single SMART collection by its numeric id (e.g. '8313381814466'); pass fields (comma string) to limit the response. Smart collections use rules rather than manual product lists — to see which products currently match, use shopify_list_products with collection_id.",
      parameters: {
        smart_collection_id: { type: 'string', required: true, description: 'Numeric id of the smart collection to fetch.' },
        fields: FIELDS_PARAM,
      },
      async execute(args, exec) {
        const id = requireArg(args, 'smart_collection_id', 'smart_collection_id');
        const body = await client.rest('GET', `/smart_collections/${id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { smart_collection: body.smart_collection };
      },
    },
    {
      name: 'shopify_create_smart_collection',
      title: 'Create smart collection',
      kind: 'write',
      description:
        'Creates a SMART (rule-based) collection; title AND rules are required. rules is an array of { column, relation, condition } objects, e.g. [{ column: "tag", relation: "equals", condition: "sale" }]; column: title|type|vendor|price|tag|inventory_total|inventory_available|variant_*; relation: equals|not_equals|greater_than|less_than|starts_with|ends_with|contains|not_contains. disjunctive=true makes rules OR-combined (default AND). Also accepts body_html, image, published, sort_order, template_suffix.',
      parameters: {
        title: { type: 'string', required: true, description: 'REQUIRED. Collection title.' },
        rules: { type: 'array', required: true, items: { type: 'json' }, description: 'REQUIRED. Non-empty array of { column, relation, condition } rule objects (see description for valid values).' },
        disjunctive: { type: 'boolean', description: 'true = match any rule (OR); false = match all rules (AND, default).' },
        body_html: { type: 'string', description: 'Description shown on the storefront, as HTML.' },
        image: { type: 'json', description: 'Collection image: { src (public HTTPS URL) or attachment (base64), alt, position }.' },
        published: { type: 'boolean', description: 'Whether the collection is published to the storefront (default false).' },
        sort_order: SORT_ORDER_PARAM,
        template_suffix: { type: 'string', description: 'Theme template suffix (e.g. "custom") used to render the collection page.' },
      },
      async execute(args, exec) {
        const title = requireArg(args, 'title', 'title');
        const rules = objectArray(args.rules);
        if (!rules || rules.length === 0 || rules.some((rule) => !rule || typeof rule !== 'object')) {
          throw new ShopifyError(
            'rules is required and must be a non-empty array of { column, relation, condition } objects',
            'SHOPIFY_INVALID_ARGS',
          );
        }
        const body = {
          smart_collection: defined({
            title,
            rules,
            disjunctive: args.disjunctive,
            body_html: args.body_html,
            image: asObject(args.image),
            published: args.published,
            sort_order: args.sort_order,
            template_suffix: args.template_suffix,
          }),
        };
        const result = await client.rest('POST', '/smart_collections', { body, signal: exec.signal });
        return { smart_collection: result.smart_collection };
      },
    },
    {
      name: 'shopify_update_smart_collection',
      title: 'Update smart collection',
      kind: 'write',
      description:
        'Updates a SMART collection by its numeric id. Replace rules to change membership — products are re-matched immediately. Accepts the same body keys as create (title, rules, disjunctive, body_html, image, published, sort_order, template_suffix). Products cannot be manually added to smart collections; adjust rules instead.',
      parameters: {
        smart_collection_id: { type: 'string', required: true, description: 'Numeric id of the smart collection to update.' },
        title: { type: 'string', description: 'New collection title.' },
        rules: { type: 'array', items: { type: 'json' }, description: 'Replacement rules: [{ column, relation, condition }] (see shopify_create_smart_collection for valid values).' },
        disjunctive: { type: 'boolean', description: 'true = match any rule (OR); false = match all rules (AND).' },
        body_html: { type: 'string', description: 'Description shown on the storefront, as HTML.' },
        image: { type: 'json', description: 'Collection image: { src or attachment, alt, position }.' },
        published: { type: 'boolean', description: 'Whether the collection is published to the storefront.' },
        sort_order: SORT_ORDER_PARAM,
        template_suffix: { type: 'string', description: 'Theme template suffix (e.g. "custom") used to render the collection page.' },
      },
      async execute(args, exec) {
        const id = requireArg(args, 'smart_collection_id', 'smart_collection_id');
        const rules = objectArray(args.rules);
        if (rules !== undefined && (rules.length === 0 || rules.some((rule) => !rule || typeof rule !== 'object'))) {
          throw new ShopifyError(
            'rules must be a non-empty array of { column, relation, condition } objects when provided',
            'SHOPIFY_INVALID_ARGS',
          );
        }
        const body = {
          smart_collection: defined({
            title: args.title,
            rules,
            disjunctive: args.disjunctive,
            body_html: args.body_html,
            image: asObject(args.image),
            published: args.published,
            sort_order: args.sort_order,
            template_suffix: args.template_suffix,
          }),
        };
        const result = await client.rest('PUT', `/smart_collections/${id}`, { body, signal: exec.signal });
        return { smart_collection: result.smart_collection };
      },
    },
    {
      name: 'shopify_delete_smart_collection',
      title: 'Delete smart collection',
      kind: 'write',
      description:
        'Deletes a SMART collection by its numeric id. Only the collection is removed; its products are unaffected. Use shopify_list_smart_collections to confirm the id first.',
      parameters: {
        smart_collection_id: { type: 'string', required: true, description: 'Numeric id of the smart collection to delete.' },
      },
      async execute(args, exec) {
        const id = requireArg(args, 'smart_collection_id', 'smart_collection_id');
        await client.rest('DELETE', `/smart_collections/${id}`, { signal: exec.signal });
        return { deleted: true };
      },
    },
    {
      name: 'shopify_count_smart_collections',
      title: 'Count smart collections',
      kind: 'read',
      description:
        'Counts SMART collections matching the filters (title, product_id, published_status, updated_at/published_at date ranges). Returns { count }.',
      parameters: {
        title: { type: 'string', description: 'Count only collections with this exact title.' },
        product_id: { type: 'string', description: 'Count only collections whose rules match this product id.' },
        published_status: PUBLISHED_STATUS_PARAM,
        updated_at_min: { type: 'string', description: 'ISO 8601 timestamp; count collections updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 timestamp; count collections updated at or before this time.' },
        published_at_min: { type: 'string', description: 'ISO 8601 timestamp; count collections published at or after this time.' },
        published_at_max: { type: 'string', description: 'ISO 8601 timestamp; count collections published at or before this time.' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', '/smart_collections/count', {
          query: defined({
            title: args.title,
            product_id: args.product_id,
            published_status: args.published_status,
            updated_at_min: args.updated_at_min,
            updated_at_max: args.updated_at_max,
            published_at_min: args.published_at_min,
            published_at_max: args.published_at_max,
          }),
          signal: exec.signal,
        });
        return { count: body.count };
      },
    },
    {
      name: 'shopify_add_product_to_custom_collection',
      title: 'Add product to custom collection',
      kind: 'write',
      description:
        'Adds a product to a CUSTOM (manual) collection via the Collects API. Smart collections CANNOT use this endpoint — they are rule-based, so adjust their rules instead. Both product_id and collection_id are required (numeric ids as strings). position is honored only when the collection\'s sort_order is "manual"; otherwise it is ignored. Returns the created collect record.',
      parameters: {
        product_id: { type: 'string', required: true, description: 'REQUIRED. Numeric id of the product to add.' },
        collection_id: { type: 'string', required: true, description: 'REQUIRED. Numeric id of the CUSTOM collection to add the product to.' },
        position: { type: 'integer', description: 'Sort position of the product inside the collection. Honored only when the collection sort_order is "manual".' },
      },
      async execute(args, exec) {
        const product_id = requireArg(args, 'product_id', 'product_id');
        const collection_id = requireArg(args, 'collection_id', 'collection_id');
        const body = {
          collect: defined({
            product_id,
            collection_id,
            position: args.position,
          }),
        };
        const result = await client.rest('POST', '/collects', { body, signal: exec.signal });
        return { collect: result.collect };
      },
    },
    {
      name: 'shopify_get_collects',
      title: 'Get collects',
      kind: 'read',
      description:
        'Lists Collect records — the links between products and CUSTOM (manual) collections. Filter by product_id and/or collection_id (either or both). Each collect has { id, product_id, collection_id, position, sort_value }. Use this to find a collect_id for shopify_remove_product_from_collection. Smart collections produce no collect records.',
      parameters: {
        product_id: { type: 'string', description: 'Return only collects for this product id.' },
        collection_id: { type: 'string', description: 'Return only collects for this custom collection id.' },
        limit: LIMIT_PARAM,
        since_id: SINCE_ID_PARAM,
        page_info: { type: 'string', description: `Opaque cursor for the next page. ${PAGE_INFO_HINT}` },
        fields: FIELDS_PARAM,
      },
      async execute(args, exec) {
        const query = defined({
          product_id: args.product_id,
          collection_id: args.collection_id,
          limit: args.limit,
          since_id: args.since_id,
          page_info: args.page_info,
          fields: args.fields,
        });
        const { items, next_page_info } = await client.list('/collects', query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_remove_product_from_collection',
      title: 'Remove product from collection',
      kind: 'write',
      description:
        'Removes a product from a CUSTOM collection by deleting its collect record; collect_id is required. Find it via shopify_get_collects filtered by product_id/collection_id. Smart collections are unaffected (they are rule-based — edit their rules instead).',
      parameters: {
        collect_id: { type: 'string', required: true, description: 'REQUIRED. Numeric id of the collect record to delete (from shopify_get_collects).' },
      },
      async execute(args, exec) {
        const collect_id = requireArg(args, 'collect_id', 'collect_id');
        await client.rest('DELETE', `/collects/${collect_id}`, { signal: exec.signal });
        return { deleted: true, collect_id };
      },
    },
  ];
}

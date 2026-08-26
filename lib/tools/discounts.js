/**
 * Discount tools: price rules (the discount math) and their discount codes
 * (the codes customers enter at checkout), including bulk code creation.
 * @module @shopify/dsh-shopify/tools/discounts
 */

import { ShopifyError, defined, asArray } from '../util.js';

/** Price-rule body keys shared by create and update tools. */
function priceRuleBody(args) {
  return defined({
    title: args.title,
    value_type: args.value_type,
    value: args.value,
    target_type: args.target_type,
    target_selection: args.target_selection,
    allocation_method: args.allocation_method,
    customer_selection: args.customer_selection,
    starts_at: args.starts_at,
    ends_at: args.ends_at,
    usage_limit: args.usage_limit,
    allocation_limit: args.allocation_limit,
    once_per_customer: args.once_per_customer,
    entitled_product_ids: asArray(args.entitled_product_ids),
    entitled_variant_ids: asArray(args.entitled_variant_ids),
    entitled_collection_ids: asArray(args.entitled_collection_ids),
    entitled_country_ids: asArray(args.entitled_country_ids),
    prerequisite_product_ids: asArray(args.prerequisite_product_ids),
    prerequisite_variant_ids: asArray(args.prerequisite_variant_ids),
    prerequisite_collection_ids: asArray(args.prerequisite_collection_ids),
    prerequisite_customer_ids: asArray(args.prerequisite_customer_ids),
    prerequisite_quantity_range: args.prerequisite_quantity_range,
    prerequisite_subtotal_range: args.prerequisite_subtotal_range,
    prerequisite_shipping_price_range: args.prerequisite_shipping_price_range,
    prerequisite_to_entitlement_quantity_ratio: args.prerequisite_to_entitlement_quantity_ratio,
    customer_segment_prerequisite_ids: asArray(args.customer_segment_prerequisite_ids),
  });
}

/** Shared price-rule parameters for create and update tools. */
const PRICE_RULE_PARAMS = {
  title: { type: 'string', description: 'REQUIRED (create). Title of the price rule (max 255 chars), e.g. "Summer Sale 20% off".' },
  value_type: { type: 'string', enum: ['fixed_amount', 'percentage'], description: 'REQUIRED (create). Whether value is a fixed amount or a percentage: fixed_amount|percentage.' },
  value: { type: 'string', description: "REQUIRED (create). NEGATIVE decimal string, e.g. '-20.0' for $20 off or '-10.0' for 10% off. Must be negative." },
  target_type: { type: 'string', enum: ['line_item', 'shipping_line'], description: 'REQUIRED (create). What the discount applies to: line_item|shipping_line.' },
  target_selection: { type: 'string', enum: ['all', 'entitled'], description: 'REQUIRED (create). Whether the discount applies to all items or only entitled ones: all|entitled.' },
  allocation_method: { type: 'string', enum: ['each', 'across'], description: 'REQUIRED (create). How the discount is allocated: each (per line item) or across (split across items).' },
  customer_selection: { type: 'string', enum: ['all', 'prerequisite'], description: 'REQUIRED (create). Whether the discount applies to all customers or only prerequisites: all|prerequisite.' },
  starts_at: { type: 'string', description: "REQUIRED (create). ISO 8601 datetime the discount becomes active, e.g. '2025-02-01T00:00:00-05:00' (use the shop timezone from shopify_get_shop_details iana_timezone)." },
  ends_at: { type: 'string', description: 'Optional ISO 8601 datetime the discount stops being active.' },
  usage_limit: { type: 'integer', description: 'Optional max number of times the discount can be used (per customer when once_per_customer is set).' },
  allocation_limit: { type: 'integer', description: 'Optional max number of line items the discount can be applied to.' },
  once_per_customer: { type: 'boolean', description: 'Whether the discount can be used only once per customer.' },
  entitled_product_ids: { type: 'array', items: { type: 'string' }, description: 'Product ids the discount applies to (when target_selection=entitled).' },
  entitled_variant_ids: { type: 'array', items: { type: 'string' }, description: 'Variant ids the discount applies to (when target_selection=entitled).' },
  entitled_collection_ids: { type: 'array', items: { type: 'string' }, description: 'Collection ids the discount applies to (when target_selection=entitled).' },
  entitled_country_ids: { type: 'array', items: { type: 'string' }, description: 'Country ids (from shopify_list_countries) the discount applies to.' },
  prerequisite_product_ids: { type: 'array', items: { type: 'string' }, description: 'Product ids the customer must have in the cart for the discount to apply (when customer_selection=prerequisite).' },
  prerequisite_variant_ids: { type: 'array', items: { type: 'string' }, description: 'Variant ids the customer must have in the cart for the discount to apply.' },
  prerequisite_collection_ids: { type: 'array', items: { type: 'string' }, description: 'Collection ids the customer must have in the cart for the discount to apply.' },
  prerequisite_customer_ids: { type: 'array', items: { type: 'string' }, description: 'Customer ids eligible for the discount.' },
  prerequisite_quantity_range: { type: 'json', description: 'Required cart quantity range as { greater_than_or_equal_to?, less_than_or_equal_to? }.' },
  prerequisite_subtotal_range: { type: 'json', description: 'Required cart subtotal range as { greater_than_or_equal_to?, less_than_or_equal_to? }.' },
  prerequisite_shipping_price_range: { type: 'json', description: 'Required shipping price range as { greater_than_or_equal_to?, less_than_or_equal_to? }.' },
  prerequisite_to_entitlement_quantity_ratio: { type: 'json', description: 'Required buy X get Y quantity ratio as { prerequisite_quantity, entitled_quantity }.' },
  customer_segment_prerequisite_ids: { type: 'array', items: { type: 'string' }, description: 'Customer segment ids eligible for the discount.' },
};

export function tools(ctx, deps) {
  const { client } = deps;
  return [
    {
      name: 'shopify_list_price_rules',
      title: 'List price rules',
      kind: 'read',
      description:
        "Lists the shop's price rules (discount rules). A price rule defines the discount math; its discount codes (see shopify_list_discount_codes) are the codes customers enter at checkout — the two are separate resources. Supports limit, since_id, created_at/updated_at date-range filters, starts_at_min/max, ends_at_min/max, and times_used (exact usage count). Returns items, count, and next_page_info — loop with page_info until null.",
      parameters: {
        limit: { type: 'integer', description: 'Maximum number of price rules to return (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only price rules with id greater than this value.' },
        created_at_min: { type: 'string', description: 'ISO 8601 datetime — return price rules created at or after this time.' },
        created_at_max: { type: 'string', description: 'ISO 8601 datetime — return price rules created at or before this time.' },
        updated_at_min: { type: 'string', description: 'ISO 8601 datetime — return price rules updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 datetime — return price rules updated at or before this time.' },
        starts_at_min: { type: 'string', description: 'ISO 8601 datetime — return price rules that start at or after this time.' },
        starts_at_max: { type: 'string', description: 'ISO 8601 datetime — return price rules that start at or before this time.' },
        ends_at_min: { type: 'string', description: 'ISO 8601 datetime — return price rules that end at or after this time.' },
        ends_at_max: { type: 'string', description: 'ISO 8601 datetime — return price rules that end at or before this time.' },
        times_used: { type: 'integer', description: 'Return only price rules used exactly this many times.' },
      },
      async execute(args, exec) {
        const { items, next_page_info } = await client.list('/price_rules', defined({
          limit: args.limit,
          since_id: args.since_id,
          created_at_min: args.created_at_min,
          created_at_max: args.created_at_max,
          updated_at_min: args.updated_at_min,
          updated_at_max: args.updated_at_max,
          starts_at_min: args.starts_at_min,
          starts_at_max: args.starts_at_max,
          ends_at_min: args.ends_at_min,
          ends_at_max: args.ends_at_max,
          times_used: args.times_used,
        }));
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_price_rule',
      title: 'Get price rule',
      kind: 'read',
      description:
        "Gets a single price rule by price_rule_id, including its value, value_type, target_type, eligibility prerequisites, and usage summary (times_used). price_rule_id is the numeric id from shopify_list_price_rules.",
      parameters: {
        price_rule_id: { type: 'string', required: true, description: "REQUIRED. Numeric price rule id (e.g. '1213056978524')." },
      },
      async execute(args, exec) {
        if (!args.price_rule_id) throw new ShopifyError('price_rule_id is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('GET', `/price_rules/${args.price_rule_id}`, { signal: exec.signal });
        return { price_rule: body.price_rule };
      },
    },
    {
      name: 'shopify_create_price_rule',
      title: 'Create price rule',
      kind: 'write',
      description:
        "Creates a price rule (the discount definition). Required: title, value_type (fixed_amount|percentage), value (a NEGATIVE decimal string, e.g. '-20.0' for $20 off or 20% off — positive values are rejected), target_type (line_item|shipping_line), target_selection (all|entitled), allocation_method (each|across), customer_selection (all|prerequisite), and starts_at (ISO 8601). Optional: ends_at, usage_limit, allocation_limit, once_per_customer, entitled_*/prerequisite_* id arrays, and prerequisite range jsons. IMPORTANT: the price rule itself is not customer-facing — after creating it, generate codes with shopify_create_discount_code or shopify_create_discount_code_batch. Returns the created price_rule.",
      parameters: PRICE_RULE_PARAMS,
      async execute(args, exec) {
        for (const key of ['title', 'value_type', 'value', 'target_type', 'target_selection', 'allocation_method', 'customer_selection', 'starts_at']) {
          if (!args[key]) throw new ShopifyError(`${key} is required`, 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('POST', '/price_rules', {
          body: { price_rule: priceRuleBody(args) },
          signal: exec.signal,
        });
        return { price_rule: body.price_rule };
      },
    },
    {
      name: 'shopify_update_price_rule',
      title: 'Update price rule',
      kind: 'write',
      description:
        "Updates an existing price rule by price_rule_id. Only the provided fields are changed; at least one field besides price_rule_id should be supplied. value must remain a NEGATIVE decimal string, and changing value_type/value/target_* affects how the discount is applied. Returns the updated price_rule.",
      parameters: {
        price_rule_id: { type: 'string', required: true, description: "REQUIRED. Numeric price rule id to update (e.g. '1213056978524')." },
        ...PRICE_RULE_PARAMS,
      },
      async execute(args, exec) {
        if (!args.price_rule_id) throw new ShopifyError('price_rule_id is required', 'SHOPIFY_INVALID_ARGS');
        const rule = priceRuleBody(args);
        if (Object.keys(rule).length === 0) {
          throw new ShopifyError('at least one price rule field must be provided to update', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('PUT', `/price_rules/${args.price_rule_id}`, {
          body: { price_rule: rule },
          signal: exec.signal,
        });
        return { price_rule: body.price_rule };
      },
    },
    {
      name: 'shopify_delete_price_rule',
      title: 'Delete price rule',
      kind: 'write',
      description:
        "Deletes a price rule by price_rule_id. WARNING: deleting a price rule ALSO permanently deletes all of its discount codes — this is irreversible. Confirm with the user before running.",
      parameters: {
        price_rule_id: { type: 'string', required: true, description: "REQUIRED. Numeric price rule id to delete (e.g. '1213056978524')." },
      },
      async execute(args, exec) {
        if (!args.price_rule_id) throw new ShopifyError('price_rule_id is required', 'SHOPIFY_INVALID_ARGS');
        await client.rest('DELETE', `/price_rules/${args.price_rule_id}`, { signal: exec.signal });
        return { deleted: true, price_rule_id: args.price_rule_id };
      },
    },
    {
      name: 'shopify_count_price_rules',
      title: 'Count price rules',
      kind: 'read',
      description: 'Counts the price rules on the shop. Returns { count }.',
      parameters: {},
      async execute(args, exec) {
        const body = await client.rest('GET', '/price_rules/count', { signal: exec.signal });
        return { count: body.count ?? 0 };
      },
    },
    {
      name: 'shopify_list_discount_codes',
      title: 'List discount codes',
      kind: 'read',
      description:
        "Lists the discount codes for a price rule — the codes customers actually enter at checkout. price_rule_id is required (numeric). Supports limit, since_id, and page_info for pagination. Returns items, count, and next_page_info — loop with page_info until null.",
      parameters: {
        price_rule_id: { type: 'string', required: true, description: "REQUIRED. Numeric price rule id the codes belong to (e.g. '1213056978524')." },
        limit: { type: 'integer', description: 'Maximum number of discount codes to return (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only discount codes with id greater than this value.' },
        page_info: { type: 'string', description: 'Cursor for the next page, from a previous response next_page_info.' },
      },
      async execute(args, exec) {
        if (!args.price_rule_id) throw new ShopifyError('price_rule_id is required', 'SHOPIFY_INVALID_ARGS');
        const { items, next_page_info } = await client.list(`/price_rules/${args.price_rule_id}/discount_codes`, defined({
          limit: args.limit,
          since_id: args.since_id,
          page_info: args.page_info,
        }));
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_discount_code',
      title: 'Get discount code',
      kind: 'read',
      description:
        "Gets a single discount code by price_rule_id and discount_code_id (both numeric). Returns the discount_code with its code value, usage count, and id.",
      parameters: {
        price_rule_id: { type: 'string', required: true, description: "REQUIRED. Numeric price rule id the code belongs to (e.g. '1213056978524')." },
        discount_code_id: { type: 'string', required: true, description: "REQUIRED. Numeric discount code id (e.g. '1005655390588')." },
      },
      async execute(args, exec) {
        if (!args.price_rule_id) throw new ShopifyError('price_rule_id is required', 'SHOPIFY_INVALID_ARGS');
        if (!args.discount_code_id) throw new ShopifyError('discount_code_id is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('GET', `/price_rules/${args.price_rule_id}/discount_codes/${args.discount_code_id}`, { signal: exec.signal });
        return { discount_code: body.discount_code };
      },
    },
    {
      name: 'shopify_create_discount_code',
      title: 'Create discount code',
      kind: 'write',
      description:
        "Creates a single discount code under a price rule (the parent price rule must already exist — see shopify_create_price_rule). code is REQUIRED, unique across the shop, and max 255 chars (e.g. 'SUMMER20'); it is stored case-insensitively and cannot contain spaces. The code is only usable once its price rule is active (starts_at passed). Returns the created discount_code.",
      parameters: {
        price_rule_id: { type: 'string', required: true, description: "REQUIRED. Numeric price rule id to add the code to (e.g. '1213056978524')." },
        code: { type: 'string', required: true, description: 'REQUIRED. The discount code value, unique and max 255 chars (e.g. "SUMMER20").' },
      },
      async execute(args, exec) {
        if (!args.price_rule_id) throw new ShopifyError('price_rule_id is required', 'SHOPIFY_INVALID_ARGS');
        if (!args.code) throw new ShopifyError('code is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('POST', `/price_rules/${args.price_rule_id}/discount_codes`, {
          body: { discount_code: defined({ code: args.code }) },
          signal: exec.signal,
        });
        return { discount_code: body.discount_code };
      },
    },
    {
      name: 'shopify_update_discount_code',
      title: 'Update discount code',
      kind: 'write',
      description:
        "Updates an existing discount code's value by price_rule_id and discount_code_id. code is the only editable field — it must remain unique across the shop and max 255 chars. Returns the updated discount_code.",
      parameters: {
        price_rule_id: { type: 'string', required: true, description: "REQUIRED. Numeric price rule id the code belongs to (e.g. '1213056978524')." },
        discount_code_id: { type: 'string', required: true, description: "REQUIRED. Numeric discount code id (e.g. '1005655390588')." },
        code: { type: 'string', required: true, description: 'REQUIRED. New code value, unique and max 255 chars (e.g. "SUMMER20").' },
      },
      async execute(args, exec) {
        if (!args.price_rule_id) throw new ShopifyError('price_rule_id is required', 'SHOPIFY_INVALID_ARGS');
        if (!args.discount_code_id) throw new ShopifyError('discount_code_id is required', 'SHOPIFY_INVALID_ARGS');
        if (!args.code) throw new ShopifyError('code is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('PUT', `/price_rules/${args.price_rule_id}/discount_codes/${args.discount_code_id}`, {
          body: { discount_code: defined({ code: args.code }) },
          signal: exec.signal,
        });
        return { discount_code: body.discount_code };
      },
    },
    {
      name: 'shopify_delete_discount_code',
      title: 'Delete discount code',
      kind: 'write',
      description:
        "Deletes a single discount code from a price rule by price_rule_id and discount_code_id. Irreversible — customers can no longer use the code.",
      parameters: {
        price_rule_id: { type: 'string', required: true, description: "REQUIRED. Numeric price rule id the code belongs to (e.g. '1213056978524')." },
        discount_code_id: { type: 'string', required: true, description: "REQUIRED. Numeric discount code id (e.g. '1005655390588')." },
      },
      async execute(args, exec) {
        if (!args.price_rule_id) throw new ShopifyError('price_rule_id is required', 'SHOPIFY_INVALID_ARGS');
        if (!args.discount_code_id) throw new ShopifyError('discount_code_id is required', 'SHOPIFY_INVALID_ARGS');
        await client.rest('DELETE', `/price_rules/${args.price_rule_id}/discount_codes/${args.discount_code_id}`, { signal: exec.signal });
        return { deleted: true, discount_code_id: args.discount_code_id };
      },
    },
    {
      name: 'shopify_lookup_discount_code',
      title: 'Lookup discount code',
      kind: 'read',
      description:
        "Looks up a discount code across the whole shop by its exact code value (e.g. 'SUMMER20') — returns the discount_code with its price_rule_id. Use this to find which price rule a code belongs to without knowing either id. The code must match exactly as entered.",
      parameters: {
        code: { type: 'string', required: true, description: "REQUIRED. Exact discount code value to look up (e.g. 'SUMMER20')." },
      },
      async execute(args, exec) {
        if (!args.code) throw new ShopifyError('code is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('GET', '/discount_codes/lookup', {
          query: defined({ code: args.code }),
          signal: exec.signal,
        });
        return { discount_code: body.discount_code };
      },
    },
    {
      name: 'shopify_count_discount_codes',
      title: 'Count discount codes',
      kind: 'read',
      description:
        "Counts discount codes across the shop (all price rules). Optional filters: times_used (exact usage count), times_used_min, and times_used_max. Returns { count }.",
      parameters: {
        times_used: { type: 'integer', description: 'Count only codes used exactly this many times.' },
        times_used_min: { type: 'integer', description: 'Count only codes used at least this many times.' },
        times_used_max: { type: 'integer', description: 'Count only codes used at most this many times.' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', '/discount_codes/count', {
          query: defined({
            times_used: args.times_used,
            times_used_min: args.times_used_min,
            times_used_max: args.times_used_max,
          }),
          signal: exec.signal,
        });
        return { count: body.count ?? 0 };
      },
    },
    {
      name: 'shopify_create_discount_code_batch',
      title: 'Create discount code batch',
      kind: 'write',
      description:
        "Creates discount codes in bulk for a price rule as an asynchronous job. discount_codes is REQUIRED, an array of up to 100 objects, each at least { code } (extra fields like usage_limit/once_per_customer are passed through). LIMITS: max 100 codes per batch, and only ONE active batch job per shop at a time — creating another while one is queued or running fails. Returns a discount_code_creation_job; poll it with shopify_get_discount_code_batch_job until status is 'completed', then read the created codes with shopify_get_batch_discount_codes.",
      parameters: {
        price_rule_id: { type: 'string', required: true, description: "REQUIRED. Numeric price rule id to add the codes to (e.g. '1213056978524')." },
        discount_codes: { type: 'array', items: { type: 'json' }, required: true, description: "REQUIRED. Array of up to 100 code objects, each at least { code: 'WELCOME10' } (optionally with usage_limit, once_per_customer, etc.)." },
      },
      async execute(args, exec) {
        if (!args.price_rule_id) throw new ShopifyError('price_rule_id is required', 'SHOPIFY_INVALID_ARGS');
        const codes = asArray(args.discount_codes);
        if (!codes || codes.length === 0) throw new ShopifyError('discount_codes is required (non-empty array)', 'SHOPIFY_INVALID_ARGS');
        if (codes.length > 100) throw new ShopifyError(`a batch supports at most 100 discount codes, got ${codes.length}`, 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('POST', `/price_rules/${args.price_rule_id}/batch`, {
          body: { discount_codes: codes },
          signal: exec.signal,
        });
        return { discount_code_creation_job: body.discount_code_creation_job };
      },
    },
    {
      name: 'shopify_get_discount_code_batch_job',
      title: 'Get discount code batch job',
      kind: 'read',
      description:
        "Gets the status of a discount code creation batch job: queued, running, or completed. batch_id comes from shopify_create_discount_code_batch (which only allows one active batch per shop at a time). Poll until status is 'completed' before reading results with shopify_get_batch_discount_codes.",
      parameters: {
        price_rule_id: { type: 'string', required: true, description: "REQUIRED. Numeric price rule id the batch belongs to (e.g. '1213056978524')." },
        batch_id: { type: 'string', required: true, description: "REQUIRED. Numeric batch job id from shopify_create_discount_code_batch." },
      },
      async execute(args, exec) {
        if (!args.price_rule_id) throw new ShopifyError('price_rule_id is required', 'SHOPIFY_INVALID_ARGS');
        if (!args.batch_id) throw new ShopifyError('batch_id is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('GET', `/price_rules/${args.price_rule_id}/batch/${args.batch_id}`, { signal: exec.signal });
        return { discount_code_creation_job: body.discount_code_creation_job };
      },
    },
    {
      name: 'shopify_get_batch_discount_codes',
      title: 'Get batch discount codes',
      kind: 'read',
      description:
        "Lists the discount codes created by a completed batch job. batch_id comes from shopify_create_discount_code_batch; only call this after shopify_get_discount_code_batch_job reports status 'completed'. Returns the codes array under 'discount_codes'.",
      parameters: {
        price_rule_id: { type: 'string', required: true, description: "REQUIRED. Numeric price rule id the batch belongs to (e.g. '1213056978524')." },
        batch_id: { type: 'string', required: true, description: "REQUIRED. Numeric batch job id from shopify_create_discount_code_batch." },
      },
      async execute(args, exec) {
        if (!args.price_rule_id) throw new ShopifyError('price_rule_id is required', 'SHOPIFY_INVALID_ARGS');
        if (!args.batch_id) throw new ShopifyError('batch_id is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('GET', `/price_rules/${args.price_rule_id}/batch/${args.batch_id}/discount_codes`, { signal: exec.signal });
        return { discount_codes: body.discount_codes ?? [] };
      },
    },
  ];
}

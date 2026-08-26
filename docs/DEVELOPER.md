# dsh-shopify — tool module contract

This document is the implementation contract for every tool module in
`lib/tools/`. Read it fully, then read the reference implementation at
`/home/sakthivel/Workspace/RnD/Deepseek/GoogleWorkspace/gmail` (especially
`lib/tools.js`, `lib/tools/labels.js`, `lib/util.js`, `lib/client.js`) and
mirror its style exactly.

## Files you produce

Write **only** the module file(s) listed in your task, e.g. `lib/tools/products.js`.
Do NOT touch `lib/tools/index.js`, `lib/index.js`, `lib/client.js`, or any other
module — the integrator wires them.

## Shared infrastructure (already written — use it, do not recreate)

### `deps` passed to your `tools(ctx, deps)` function

```js
{ client, config }
```

- `config` — plugin config: `{ apiVersion: '2025-01', timeoutMs: 30000, ... }`.
- `client` — `ShopifyClient` with:
  - `client.rest(method, path, { query, body, signal })` → parsed JSON body.
    - `path` is the resource path WITHOUT `.json` (e.g. `'/products/123'`).
    - `query` is a plain object; `undefined`/`null` values are skipped; arrays repeat.
    - `body` is a plain object (sent as JSON).
  - `client.list(path, query, opts?)` → `{ items, next_page_info }` where `items` is the
    first array-valued key of the response. Use for every REST list endpoint.
    `opts` may carry `{ signal, apiVersion }` — pass `signal: exec.signal`.
  - `client.graphql(document, variables, apiVersion?)` → raw GraphQL body
    `{ data, errors, extensions }`. Use for every GraphQL call.
  - ALWAYS pass `signal: exec.signal` on `rest`/`list`/`graphql` calls.
- `config.apiVersion` is the default API version — never hardcode `'2025-01'`
  in URLs; the client already appends it. Tools that expose an `api_version`
  parameter pass it through to `client.rest`/`client.graphql` as `apiVersion`.

### Tool factory (`lib/tools.js`)

Modules export:

```js
export function tools(ctx, deps) {
  const { client } = deps;
  return [
    {
      name: 'shopify_list_products',
      title: 'List products',
      kind: 'read',            // 'read' | 'write'
      description: '...',
      parameters: { ... },
      async execute(args, exec) { ... return { ... }; },
    },
    // ...
  ];
}
```

- `name` MUST be `shopify_<verb>_<resource>` snake_case, globally unique.
- `parameters`: plain object, keys are snake_case argument names:
  - `{ type: 'string'|'integer'|'number'|'boolean'|'json'|'array', required: true, items: { type: 'string' }, enum: [...], description: '...' }`
  - Every parameter needs a `description`. Required params set `required: true`.
  - Use `'json'` for object inputs (bodies that are themselves objects).
- `execute(args, exec)` is async. Return a plain JSON object (the canonical
  result — pick the useful resource fields, not raw giant dumps).
  - REST list tools return `{ items, count: items.length, next_page_info }`.
  - REST get/create/update tools return the resource object under its key,
    e.g. `{ product }` — extract the single resource from the body.
  - GraphQL tools return `{ data: body.data, errors: body.errors ?? [], extensions: body.extensions, userErrors: <extracted> }`.
- Throw `ShopifyError` (from `'../util.js'`) for argument validation and API
  failures. Never let a raw fetch error escape.
- Use `defined({...})` (from `'../util.js'`) to build request bodies/query
  objects so `undefined` keys are dropped.

### Helpers in `lib/util.js` (import what you need)

`ShopifyError`, `defined`, `pick(args, keys)`, `asArray(value)`, `asObject(value)`,
`hasText(value)`, `jsonObjectOutput`, `presentCall`.

## Common conventions (apply to every tool)

1. **IDs**: REST numeric IDs arrive as strings (`product_id: '8313381814466'`).
   Accept string or integer; pass through as-is in the URL path.
2. **Pagination**: list tools accept `limit`, `since_id` (REST offset-style) and
   `page_info` (cursor). When `page_info` is present, only `limit` (and
   `fields` where documented) may accompany it — mirror the Shopify docs. Use
   `client.list` which returns `next_page_info`.
3. **Filters**: date params are ISO 8601 strings passed to `created_at_min`,
   `created_at_max`, `updated_at_min`, `updated_at_max`, `published_at_min`,
   `published_at_max` etc. `published_status` enum: `published|unpublished|any`.
4. **Deprecated endpoints**: use the CURRENT endpoint names. Where the Composio
   reference lists a deprecated duplicate, implement the modern one (e.g.
   `GET /products.json` not `/products.json` variants; no `SHOPIFY_CREATE_PRODUCT`
   legacy shapes). GraphQL-only capabilities go through `client.graphql`.
5. **Descriptions**: write helpful, agent-facing descriptions that include
   required-arg hints, ID formats, and pitfalls (mirror the Composio doc tone).
   Mention "use shopify_get_shop_details for the shop's iana_timezone" where
   relevant. Keep them ≤ ~600 chars.
6. **Do not implement** `shopify_graphql_admin_execute` (another module owns
   the generic GraphQL escape hatch). If a spec says "GraphQL custom document",
   implement the listed presets only.

## Module specs

### Module: products (lib/tools/products.js) — 15 tools

All REST unless noted. `product` body keys: title, body_html, vendor, product_type,
tags (comma string), status (active|archived|draft), handle, template_suffix,
published, published_scope, images, options, variants, metafields.

1. `shopify_list_products` — GET `/products` via `client.list`. Query: ids
   (comma string), limit (1-250, default 50), since_id, page_info, fields,
   status, vendor, product_type, collection_id, handle, created_at_min/max,
   updated_at_min/max, published_at_min/max, published_status. Return
   `{ items, count, next_page_info }`.
2. `shopify_get_product` — GET `/products/{product_id}`. Params: product_id
   (required), fields. Return `{ product }` (body.product).
3. `shopify_create_product` — POST `/products` body `{ product: {...} }`.
   title required. Return `{ product }`.
4. `shopify_update_product` — PUT `/products/{product_id}` body `{ product: {...} }`.
   Return `{ product }`.
5. `shopify_delete_product` — DELETE `/products/{product_id}`. Return
   `{ deleted: true, product_id }`.
6. `shopify_count_products` — GET `/products/count`. Query: status, vendor,
   product_type, collection_id, created_at_min/max, updated_at_min/max,
   published_at_min/max, published_status. Return `{ count }`.
7. `shopify_list_product_variants` — GET `/products/{product_id}/variants` via
   `client.list`. Query: limit, since_id, fields, presentment_currencies.
   Return `{ items, count, next_page_info }`.
8. `shopify_get_product_variant` — GET `/variants/{variant_id}`. Params:
   variant_id (required), fields. Return `{ variant }`.
9. `shopify_create_product_variant` — POST `/products/{product_id}/variants`
   body `{ variant: {...} }` (price, option1..3, sku, barcode, weight,
   weight_unit, taxable, requires_shipping, inventory_management,
   inventory_policy, compare_at_price). Return `{ variant }`.
10. `shopify_update_product_variant` — PUT `/variants/{variant_id}` body
    `{ variant: {...} }` (same keys as create). Return `{ variant }`.
11. `shopify_delete_product_variant` — DELETE `/variants/{variant_id}`. Return
    `{ deleted: true, variant_id }`.
12. `shopify_list_product_images` — GET `/products/{product_id}/images` via
    `client.list`. Query: limit, since_id, fields. Return `{ items, count, next_page_info }`.
13. `shopify_create_product_image` — POST `/products/{product_id}/images` body
    `{ image: { src | attachment, position, alt, variant_ids } }`. Return `{ image }`.
    src must be a public HTTPS URL; attachment is base64.
14. `shopify_update_product_image` — PUT `/products/{product_id}/images/{image_id}`
    body `{ image: { position, alt, variant_ids, src } }`. Return `{ image }`.
15. `shopify_delete_product_image` — DELETE `/products/{product_id}/images/{image_id}`.
    Return `{ deleted: true, image_id }`.

### Module: collections (lib/tools/collections.js) — 15 tools

1. `shopify_list_custom_collections` — GET `/custom_collections` via
   `client.list`. Query: ids, limit, since_id, fields, title, handle, product_id,
   published_status, updated_at_min/max, published_at_min/max.
2. `shopify_get_custom_collection` — GET `/custom_collections/{custom_collection_id}`.
   Params: custom_collection_id (required), fields. Return `{ custom_collection }`.
3. `shopify_create_custom_collection` — POST `/custom_collections` body
   `{ custom_collection: { title (required), body_html, handle, image,
   published, published_scope (web|global), sort_order, template_suffix,
   metafields, collects } }`. Return `{ custom_collection }`.
4. `shopify_update_custom_collection` — PUT `/custom_collections/{custom_collection_id}`
   body `{ custom_collection: {...} }`. Return `{ custom_collection }`.
5. `shopify_delete_custom_collection` — DELETE
   `/custom_collections/{custom_collection_id}`. Return `{ deleted: true }`.
6. `shopify_count_custom_collections` — GET `/custom_collections/count`.
7. `shopify_list_smart_collections` — GET `/smart_collections` via
   `client.list`. Same query keys as custom + title/handle/product_id.
8. `shopify_get_smart_collection` — GET `/smart_collections/{smart_collection_id}`.
9. `shopify_create_smart_collection` — POST `/smart_collections` body
   `{ smart_collection: { title (required), rules (required, array of
   { column, relation, condition }), disjunctive, body_html, image, published,
   sort_order, template_suffix } }`. Return `{ smart_collection }`.
10. `shopify_update_smart_collection` — PUT
    `/smart_collections/{smart_collection_id}` body `{ smart_collection: {...} }`.
    Return `{ smart_collection }`.
11. `shopify_delete_smart_collection` — DELETE
    `/smart_collections/{smart_collection_id}`. Return `{ deleted: true }`.
12. `shopify_count_smart_collections` — GET `/smart_collections/count`.
13. `shopify_add_product_to_custom_collection` — POST `/collects` body
    `{ collect: { product_id (required), collection_id (required), position } }`
    (position honored only when sort_order=manual). Return `{ collect }`.
14. `shopify_get_collects` — GET `/collects` via `client.list`. Query:
    product_id, collection_id, limit, since_id, fields.
15. `shopify_remove_product_from_collection` — DELETE `/collects/{collect_id}`.
    Params: collect_id (required). Return `{ deleted: true, collect_id }`.

### Module: orders (lib/tools/orders.js) — 19 tools

1. `shopify_get_order` — GET `/orders/{order_id}`. Params: order_id (required), fields.
2. `shopify_list_orders` — GET `/orders` via `client.list`. Query: ids, name,
   status (open|closed|cancelled|any), financial_status, fulfillment_status,
   created_at_min/max, updated_at_min/max, processed_at_min/max,
   attribution_app_id, since_id, limit, fields, page_info.
3. `shopify_count_orders` — GET `/orders/count`. Same filters minus pagination.
   Return `{ count }`.
4. `shopify_create_order` — POST `/orders` body `{ order: { line_items (required,
   array), customer, email, phone, currency, billing_address, shipping_address,
   financial_status, fulfillment_status, inventory_behaviour
   (bypass|decrement_ignoring_policy|decrement_obeying_policy),
   send_receipt, send_fulfillment_receipt, note, tags, total_tax,
   discount_codes, shipping_lines, transactions } }`. Return `{ order }`.
5. `shopify_update_order` — PUT `/orders/{order_id}` body `{ order: { note, email,
   phone, tags, po_number, metafields, note_attributes, billing_address,
   shipping_address, tax_exempt, buyer_accepts_marketing, send_receipt,
   send_fulfillment_receipt } }`. Return `{ order }`.
6. `shopify_cancel_order` — POST `/orders/{order_id}/cancel` body
   `{ order: { reason (customer|fraud|inventory|declined|other), email, restock,
   refund, amount, currency } }`. Return `{ order }`.
7. `shopify_close_order` — POST `/orders/{order_id}/close`. Return `{ order }`.
8. `shopify_reopen_closed_order` — POST `/orders/{order_id}/open`. Return `{ order }`.
9. `shopify_delete_order` — DELETE `/orders/{order_id}`. Return `{ deleted: true }`.
10. `shopify_get_customer_orders` — GET `/customers/{customer_id}/orders` via
    `client.list`. Query: status, limit, since_id, page_info, fields.
11. `shopify_list_transactions` — GET `/orders/{order_id}/transactions` via
    `client.list`. Query: fields, since_id, in_shop_currency (boolean).
12. `shopify_get_transaction` — GET `/orders/{order_id}/transactions/{transaction_id}`.
    Params: transaction_id (required), fields, in_shop_currency.
13. `shopify_create_order_transaction` — POST `/orders/{order_id}/transactions`
    body `{ transaction: { kind (required:
    authorization|capture|sale|void|refund), amount, currency, gateway,
    parent_id, source_name, authorization, test } }`. Return `{ transaction }`.
14. `shopify_calculate_refund` — POST `/orders/{order_id}/refunds/calculate`
    body `{ refund: { shipping: { full_refund|amount, currency },
    refund_line_items: [{ line_item_id, quantity, restock_type, location_id }],
    currency } }`. Return the full calculated refund body.
15. `shopify_create_refund` — POST `/orders/{order_id}/refunds` body
    `{ refund: { note, notify, currency, shipping, refund_line_items,
    transactions (kind changed from 'suggested_refund' to 'refund'), discrepancy_reason } }`.
    Description must say: call shopify_calculate_refund first. Return `{ refund }`.
16. `shopify_list_order_refunds` — GET `/orders/{order_id}/refunds` via
    `client.list`. Query: limit, fields, in_shop_currency.
17. `shopify_get_order_refund_by_id` — GET `/orders/{order_id}/refunds/{refund_id}`.
18. `shopify_get_order_risks` — GET `/orders/{order_id}/risks` via `client.list`.
    Return `{ items, count }`.
19. `shopify_create_order_risk` — POST `/orders/{order_id}/risks` body
    `{ risk: { recommendation (cancel|investigate|accept), score, source,
    message, display, cause_cancel } }`. Return `{ risk }`.

### Module: draft_orders (lib/tools/draft_orders.js) — 7 tools

1. `shopify_list_draft_orders` — GET `/draft_orders` via `client.list`. Query:
   ids, status (open|invoice_sent|completed), limit, since_id, fields,
   updated_at_min/max.
2. `shopify_get_draft_order` — GET `/draft_orders/{draft_order_id}`. Params:
   draft_order_id (required), fields.
3. `shopify_create_draft_order` — POST `/draft_orders` body
   `{ draft_order: { line_items (required; each has quantity and either
   variant_id or title+price), customer_id, email, note, tags, currency,
   tax_exempt, shipping_line, billing_address, shipping_address,
   use_customer_default_address, note_attributes, applied_discount } }`.
   Return `{ draft_order }`.
4. `shopify_update_draft_order` — PUT `/draft_orders/{draft_order_id}` body
   `{ draft_order: { status, customer, line_items, email, note, tags, currency,
   tax_exempt, taxes_included, customer_id, shipping_line, billing_address,
   shipping_address, use_customer_default_address, note_attributes,
   applied_discount, allow_discount_codes_in_checkout, b2b } }`.
5. `shopify_delete_draft_order` — DELETE `/draft_orders/{draft_order_id}`.
6. `shopify_complete_draft_order` — PUT `/draft_orders/{draft_order_id}/complete`
   body `{ draft_order: { payment_pending } }`. Return `{ draft_order }`.
7. `shopify_send_draft_order_invoice` — POST
   `/draft_orders/{draft_order_id}/send_invoice` body
   `{ draft_order_invoice: { to, from, bcc, subject, custom_message } }`.
   Return `{ draft_order_invoice }`.

### Module: customers (lib/tools/customers.js) — 15 tools

1. `shopify_list_customers` — GET `/customers` via `client.list`. Query: ids,
   limit, since_id, page_info, fields, status (enabled|disabled|invited|declined),
   created_at_min/max, updated_at_min/max.
2. `shopify_get_customer` — GET `/customers/{customer_id}`. Params: customer_id (required), fields.
3. `shopify_search_customers` — GET `/customers/search` via `client.list`. Query:
   query (required, Shopify search syntax e.g. `email:foo@bar.com`),
   limit, fields, order (e.g. `last_order_date DESC`).
4. `shopify_count_customers` — GET `/customers/count`. Query: created_at_min/max, updated_at_min/max.
5. `shopify_create_customer` — POST `/customers` body
   `{ customer: { first_name, last_name, email, phone, verified_email, password,
   password_confirmation, tags, note, addresses, send_email_invite,
   send_email_welcome } }`. Description: at least one of email, phone, or
   (first_name AND last_name) required; errors surface in the body's
   `errors` field (Shopify returns 422 with `errors` object — parse and throw
   ShopifyError with the joined messages when present). Return `{ customer }`.
6. `shopify_update_customer` — PUT `/customers/{customer_id}` body
   `{ customer: { first_name, last_name, email, phone, verified_email, tags,
   note, addresses, tax_exempt, tax_exemptions, multipass_identifier,
   sms_marketing_consent, email_marketing_consent, send_email_invite,
   send_email_welcome } }`. Return `{ customer }`.
7. `shopify_delete_customer` — DELETE `/customers/{customer_id}`. Description:
   cannot delete customers with existing orders. Return `{ deleted: true }`.
8. `shopify_get_customer_addresses` — GET `/customers/{customer_id}/addresses`
   via `client.list`. Query: limit. Return `{ items, count, next_page_info }`.
9. `shopify_get_customer_address` — GET `/customers/{customer_id}/addresses/{address_id}`.
10. `shopify_create_customer_address` — POST `/customers/{customer_id}/addresses`
    body `{ address: { first_name, last_name, company, address1, address2, city,
    province, country, zip, phone } }`. Return `{ customer_address }`.
11. `shopify_update_customer_address` — PUT
    `/customers/{customer_id}/addresses/{address_id}` body `{ address: {...} }`.
    Return `{ customer_address }`.
12. `shopify_delete_customer_address` — DELETE
    `/customers/{customer_id}/addresses/{address_id}`. Return `{ deleted: true }`.
13. `shopify_set_default_customer_address` — PUT
    `/customers/{customer_id}/addresses/{address_id}/default`. Return `{ customer_address }`.
14. `shopify_bulk_delete_customer_addresses` — DELETE
    `/customers/{customer_id}/addresses/set` body
    `{ address: { operation: 'destroy', address_ids: [...] } }`.
    Params: customer_id (required), address_ids (array, required), operation
    (string, default 'destroy'). Return `{ deleted: true, address_ids }`.
15. `shopify_create_customer_account_activation_url` — POST
    `/customers/{customer_id}/account_activation_url`. Return
    `{ account_activation_url }`.

### Module: shop (lib/tools/shop.js) — 9 tools

1. `shopify_get_shop_details` — GET `/shop` (client.rest). Params: fields.
   Return `{ shop }`. Description: iana_timezone is critical for date-based
   filters in other tools; also a connection validity check.
2. `shopify_get_policies` — GET `/policies`. Return `{ policies }`.
3. `shopify_list_currencies` — GET `/currencies`. Return `{ currencies }`.
4. `shopify_get_shipping_zones` — GET `/shipping_zones`. Params: fields.
   Return `{ shipping_zones }`.
5. `shopify_list_countries` — GET `/countries` via `client.list`. Query:
   fields, since_id. Return `{ items, count, next_page_info }`.
6. `shopify_get_country` — GET `/countries/{country_id}`. Params:
   country_id (required), fields. Return `{ country }`.
7. `shopify_get_country_provinces` — GET `/countries/{country_id}/provinces`
   via `client.list`. Query: fields, since_id.
8. `shopify_get_access_scopes` — GET `/oauth/access_scopes`. Return `{ scopes }`.
9. `shopify_query_shop` — GraphQL. Params: fields (string, GraphQL field
   selection, e.g. `name email myshopifyDomain currencyCode`). Default query:
   `{ shop { id name email myshopifyDomain currencyCode ianaTimezone timezoneOffset } }`.
   Return `{ data: body.data }`.

### Module: inventory (lib/tools/inventory.js) — 12 tools

1. `shopify_list_locations` — GET `/locations` via `client.list`. Query: limit.
2. `shopify_get_location` — GET `/locations/{location_id}`. Return `{ location }`.
3. `shopify_get_locations_count` — GET `/locations/count`. Return `{ count }`.
4. `shopify_get_inventory_items` — GET `/inventory_items` via `client.list`.
   Query: ids (required, comma string, max 100), limit.
5. `shopify_get_inventory_item` — GET `/inventory_items/{inventory_item_id}`.
   Return `{ inventory_item }`.
6. `shopify_update_inventory_item` — PUT `/inventory_items/{inventory_item_id}`
   body `{ inventory_item: { sku, cost, country_code_of_origin,
   harmonized_system_code, tracked, requires_shipping } }`.
7. `shopify_get_inventory_levels` — GET `/inventory_levels` via `client.list`.
   Query: inventory_item_ids (comma string, max 50), location_ids (comma
   string, max 50), limit, updated_at_min. At least one of item/location ids
   required (validate and throw ShopifyError('...', 'SHOPIFY_INVALID_ARGS')
   when neither is given).
8. `shopify_get_inventory_levels_for_location` — GET `/inventory_levels` via
   `client.list`. Params: location_id (required), inventory_item_ids, limit,
   updated_at_min. Query: location_ids=[location_id], inventory_item_ids.
9. `shopify_set_inventory_level` — POST `/inventory_levels/set` body
   `{ location_id (required), inventory_item_id (required), available (required,
   integer), disconnect_if_necessary }`. Return `{ inventory_level }`.
10. `shopify_adjust_inventory_level` — POST `/inventory_levels/adjust` body
    `{ location_id (required), inventory_item_id (required),
    available_adjustment (required, integer) }`. Return `{ inventory_level }`.
11. `shopify_connect_inventory_level` — POST `/inventory_levels/connect` body
    `{ location_id (required), inventory_item_id (required),
    relocate_if_necessary }`. Return `{ inventory_level }`.
12. `shopify_delete_inventory_level` — DELETE `/inventory_levels` query
    `{ inventory_item_id (required), location_id (required) }`.
    Return `{ deleted: true }`.

### Module: fulfillments (lib/tools/fulfillments.js) — 15 tools

1. `shopify_get_fulfillment_orders_for_order` — GET
   `/orders/{order_id}/fulfillment_orders`. Params: order_id (required),
   include_financial_summaries (boolean), include_order_reference_fields
   (boolean). Return `{ fulfillment_orders }`.
2. `shopify_get_fulfillment_order` — GET `/fulfillment_orders/{fulfillment_order_id}`.
   Params: fulfillment_order_id (required), include_financial_summaries,
   include_order_reference_fields. Return `{ fulfillment_order }`.
3. `shopify_get_fulfillment_order_locations_for_move` — GET
   `/fulfillment_orders/{fulfillment_order_id}/locations_for_move`.
   Return `{ locations_for_move }`.
4. `shopify_move_fulfillment_order` — POST
   `/fulfillment_orders/{fulfillment_order_id}/move` body
   `{ move: { new_location_id (required), fulfillment_order_line_items:
   [{ id, quantity }] } }`. Return `{ fulfillment_order, moved_fulfillment_order }`.
5. `shopify_apply_fulfillment_hold` — POST
   `/fulfillment_orders/{fulfillment_order_id}/hold` body
   `{ fulfillment_hold: { reason (required, enum
   awaiting_payment|high_risk_of_fraud|incorrect_address|inventory_out_of_stock|other),
   reason_notes, notify_merchant } }`. Return `{ fulfillment_order }`.
6. `shopify_release_fulfillment_hold` — POST
   `/fulfillment_orders/{fulfillment_order_id}/release_hold`.
   Return `{ fulfillment_order }`.
7. `shopify_set_fulfillment_orders_deadline` — POST `/fulfillment_orders/deadline`
   body `{ fulfillment_orders_deadline: { fulfillment_deadline (required, ISO
   8601), fulfillment_order_ids (required, array) } }`.
   Return `{ fulfillment_order_deadline }`.
8. `shopify_create_fulfillment` — POST `/fulfillments` body
   `{ fulfillment: { line_items_by_fulfillment_order (required, array of
   { fulfillment_order_id, fulfillment_order_line_items: [{ id, quantity }] }),
   notify_customer, tracking_info: { company, number, url, notify_customer },
   message, origin_address } }`. Return `{ fulfillment }`.
9. `shopify_cancel_fulfillment` — POST `/fulfillments/{fulfillment_id}/cancel`.
   Return `{ fulfillment }`.
10. `shopify_update_fulfillment_tracking` — POST
    `/fulfillments/{fulfillment_id}/update_tracking` body
    `{ fulfillment: { tracking_info: { company, number, url, notify_customer } } }`.
    Return `{ fulfillment }`.
11. `shopify_list_order_fulfillments` — GET `/orders/{order_id}/fulfillments`
    via `client.list`. Query: limit, since_id, fields, created_at_min/max,
    updated_at_min/max.
12. `shopify_get_fulfillment` — GET
    `/orders/{order_id}/fulfillments/{fulfillment_id}`. Params: fulfillment_id (required), fields.
13. `shopify_list_fulfillment_events` — GET
    `/orders/{order_id}/fulfillments/{fulfillment_id}/events`.
    Return `{ fulfillment_events }`.
14. `shopify_create_fulfillment_event` — POST
    `/orders/{order_id}/fulfillments/{fulfillment_id}/events` body
    `{ event: { status (required, enum
    attempted_delivery|carrier_picked_up|confirmed|delayed|delivered|failure|in_transit|label_printed|label_purchased|out_for_delivery|ready_for_pickup),
    message, city, province, country, zip, address1, latitude, longitude,
    happened_at } }`. Return `{ fulfillment_event }`.
15. `shopify_list_fulfillment_services` — GET `/fulfillment_services`. Query:
    scope (current_client|all). Return `{ fulfillment_services }`.

### Module: discounts (lib/tools/discounts.js) — 16 tools

Price-rule body keys: title (required), value_type (required,
fixed_amount|percentage), value (required, negative string e.g. '-20.0'),
target_type (required, line_item|shipping_line), target_selection (required,
all|entitled), allocation_method (required, each|across), customer_selection
(required, all|prerequisite), starts_at (required ISO 8601), ends_at,
usage_limit, allocation_limit, once_per_customer, entitled_product_ids,
entitled_variant_ids, entitled_collection_ids, entitled_country_ids,
prerequisite_product_ids, prerequisite_variant_ids, prerequisite_collection_ids,
prerequisite_customer_ids, prerequisite_quantity_range,
prerequisite_subtotal_range, prerequisite_shipping_price_range,
prerequisite_to_entitlement_quantity_ratio, customer_segment_prerequisite_ids.

1. `shopify_list_price_rules` — GET `/price_rules` via `client.list`. Query:
   limit, since_id, created_at_min/max, updated_at_min/max, starts_at_min/max,
   ends_at_min/max, times_used.
2. `shopify_get_price_rule` — GET `/price_rules/{price_rule_id}`. Return `{ price_rule }`.
3. `shopify_create_price_rule` — POST `/price_rules` body `{ price_rule: {...} }`.
   Return `{ price_rule }`. Description: after creating, use
   shopify_create_discount_code to generate codes.
4. `shopify_update_price_rule` — PUT `/price_rules/{price_rule_id}` body
   `{ price_rule: {...} }`. Return `{ price_rule }`.
5. `shopify_delete_price_rule` — DELETE `/price_rules/{price_rule_id}`.
   Description: also deletes its discount codes. Return `{ deleted: true }`.
6. `shopify_count_price_rules` — GET `/price_rules/count`. Return `{ count }`.
7. `shopify_list_discount_codes` — GET `/price_rules/{price_rule_id}/discount_codes`
   via `client.list`. Return `{ items, count }`.
8. `shopify_get_discount_code` — GET
   `/price_rules/{price_rule_id}/discount_codes/{discount_code_id}`.
9. `shopify_create_discount_code` — POST
   `/price_rules/{price_rule_id}/discount_codes` body
   `{ discount_code: { code (required, unique, max 255 chars) } }`.
   Return `{ discount_code }`.
10. `shopify_update_discount_code` — PUT
    `/price_rules/{price_rule_id}/discount_codes/{discount_code_id}` body
    `{ discount_code: { code } }`. Return `{ discount_code }`.
11. `shopify_delete_discount_code` — DELETE
    `/price_rules/{price_rule_id}/discount_codes/{discount_code_id}`.
12. `shopify_lookup_discount_code` — GET `/discount_codes/lookup` query `{ code
    (required) }`. Return `{ discount_code }`.
13. `shopify_count_discount_codes` — GET `/discount_codes/count` query
    `{ times_used, times_used_min, times_used_max }`. Return `{ count }`.
14. `shopify_create_discount_code_batch` — POST
    `/price_rules/{price_rule_id}/batch` body
    `{ discount_codes: [ { code, ... } ] }` (max 100). Return
    `{ discount_code_creation_job }`.
15. `shopify_get_discount_code_batch_job` — GET
    `/price_rules/{price_rule_id}/batch/{batch_id}`. Return
    `{ discount_code_creation_job }`.
16. `shopify_get_batch_discount_codes` — GET
    `/price_rules/{price_rule_id}/batch/{batch_id}/discount_codes`.
    Return `{ discount_codes }`.

### Module: content (lib/tools/content.js) — 20 tools

Blogs:
1. `shopify_list_blogs` — GET `/blogs` via `client.list`. Query: limit, since_id,
   fields, handle.
2. `shopify_get_blog` — GET `/blogs/{blog_id}`. Params: blog_id (required), fields.
3. `shopify_create_blog` — POST `/blogs` body `{ blog: { title (required,
   max 255), handle, commentable (no|moderate|yes), template_suffix,
   metafields } }`. Return `{ blog }`.
4. `shopify_update_blog` — PUT `/blogs/{blog_id}` body `{ blog: { title, handle,
   commentable, template_suffix, feedburner, feedburner_location, metafields } }`.
   WARNING in description: changing handle affects URLs/SEO.
5. `shopify_delete_blog` — DELETE `/blogs/{blog_id}`. Return `{ deleted: true }`.
6. `shopify_count_blogs` — GET `/blogs/count`. Return `{ count }`.

Articles:
7. `shopify_list_blog_articles` — GET `/blogs/{blog_id}/articles` via
   `client.list`. Query: limit, since_id, fields, author, handle,
   created_at_min/max, updated_at_min/max, published_at_min/max,
   published_status.
8. `shopify_get_article` — GET `/blogs/{blog_id}/articles/{article_id}`.
   Params: article_id (required), fields.
9. `shopify_create_article` — POST `/blogs/{blog_id}/articles` body
   `{ article: { title (required), body_html, summary_html, author, tags,
   image: { src }, published, published_at, metafields } }`. Return `{ article }`.
10. `shopify_update_article` — PUT `/blogs/{blog_id}/articles/{article_id}` body
    `{ article: {...} }`. Return `{ article }`.
11. `shopify_delete_article` — DELETE `/blogs/{blog_id}/articles/{article_id}`.
12. `shopify_count_articles` — GET `/blogs/{blog_id}/articles/count` query
    `{ created_at_min/max, updated_at_min/max, published_at_min/max,
    published_status }`. Return `{ count }`.
13. `shopify_list_article_tags` — GET `/articles/tags` query `{ limit, popular }`.
    Return `{ tags }`.

Comments:
14. `shopify_list_comments` — GET `/comments` via `client.list`. Query: limit,
    since_id, fields, status (pending|published|unapproved), blog_id,
    article_id, created_at/updated_at/published_at min/max, published_status.
15. `shopify_create_article_comment` — POST `/comments` body
    `{ comment: { body (required), email (required), author (required),
    blog_id (required, integer), article_id (required, integer), ip,
    user_agent } }`. Return `{ comment }`.
16. `shopify_approve_comment` — POST `/comments/{comment_id}/approve`.
17. `shopify_remove_comment` — POST `/comments/{comment_id}/remove`.
18. `shopify_mark_comment_as_spam` — POST `/comments/{comment_id}/spam`.
19. `shopify_mark_comment_as_not_spam` — POST `/comments/{comment_id}/not_spam`.

Pages:
20. `shopify_list_pages` — GET `/pages` via `client.list`. Query: limit,
    since_id, fields, title, handle, created_at/updated_at/published_at min/max,
    published_status.
21. `shopify_get_page` — GET `/pages/{page_id}`. Params: page_id (required), fields.
22. `shopify_create_page` — POST `/pages` body `{ page: { title (required),
    body_html, author, handle, published, published_at, template_suffix,
    metafields } }`. Return `{ page }`.
23. `shopify_update_page` — PUT `/pages/{page_id}` body `{ page: {...} }`.
24. `shopify_delete_page` — DELETE `/pages/{page_id}`.
25. `shopify_count_pages` — GET `/pages/count` query `{ title, created_at_min/max,
    updated_at_min/max, published_at_min/max, published_status }`. Return `{ count }`.

### Module: metafields (lib/tools/metafields.js) — 8 tools

1. `shopify_get_metafields` — GET `/metafields` via `client.list`. Query:
   metafield_owner_id (integer), metafield_owner_resource (string e.g.
   'product'), namespace, key, limit, since_id, fields, created_at_min/max,
   updated_at_min/max.
2. `shopify_get_metafield` — GET `/metafields/{metafield_id}`. Params:
   metafield_id (required), fields. Return `{ metafield }`.
3. `shopify_create_metafield` — POST. Params: namespace (required, 3-255),
   key (required, 3-64), value (required), type (required, e.g.
   single_line_text_field), resource (optional enum products|customers|blogs|
   collections|orders|pages|variants|articles|draft_orders|locations|
   product_images|smart_collections|shop), resource_id (optional), description.
   Behavior: when resource AND resource_id are provided → POST
   `/{resource}/{resource_id}/metafields` body `{ metafield: {...} }`; when
   resource === 'shop' or neither → POST `/metafields` body
   `{ metafield: { namespace, key, value, type, description, owner_id,
   owner_resource } }` (owner_id = shop id — omit owner fields when unknown;
   Shopify creates shop-level when owner omitted? — no: require resource or
   owner; if resource is 'shop', use `/metafields` with owner_resource 'shop'
   and owner_id=shop id — in practice POST /metafields.json with
   owner_id/owner_resource works). Implement: resource+resource_id →
   resource endpoint; resource 'shop' → POST /metafields with
   `{ metafield: { namespace, key, value, type, description } }`.
   Return `{ metafield }`.
4. `shopify_update_metafield` — PUT `/metafields/{metafield_id}` body
   `{ metafield: { value, type, description } }`. Return `{ metafield }`.
5. `shopify_delete_metafield` — DELETE `/metafields/{metafield_id}`.
   Return `{ deleted: true, metafield_id }`.
6. `shopify_get_resource_metafields` — GET
   `/{resource}/{resource_id}/metafields` via `client.list`. Params: resource
   (required), resource_id (required), namespace, key, metafield_type, limit,
   since_id, fields, created_at_min/max, updated_at_min/max.
7. `shopify_set_metafields` — GraphQL `metafieldsSet` (max 25 inputs). Params:
   metafields (array, required; each `{ owner (e.g. 'Product'), ownerId (GID
   or numeric), namespace, key, value, type, description? }`). Convert numeric
   ownerId to GID: `gid://shopify/${owner}/${ownerId}` when not already a GID.
   Return `{ data: body.data, userErrors: body.data?.metafieldsSet?.userErrors ?? [] }`.
8. `shopify_bulk_delete_metafields` — GraphQL `metafieldsDelete`. Params:
   metafields (array, required; each `{ owner, ownerId, namespace, key }`).
   Same GID conversion. Return `{ data, userErrors }`.

### Module: webhooks (lib/tools/webhooks.js) — 7 tools

1. `shopify_list_webhook_subscriptions` — GET `/webhooks` via `client.list`.
   Query: topic, address, limit, since_id, fields, created_at_min/max,
   updated_at_min/max.
2. `shopify_get_webhook_subscription` — GET `/webhooks/{webhook_id}`. Params:
   webhook_id (required), fields.
3. `shopify_create_webhook_subscription` — POST `/webhooks` body
   `{ webhook: { topic (required, e.g. 'orders/create'), address (required,
   HTTPS URL, pubsub://project:topic, or aws eventbridge arn), format
   (json|xml), fields (array), metafield_namespaces (array) } }`.
   Return `{ webhook }`.
4. `shopify_update_webhook_subscription` — PUT `/webhooks/{webhook_id}` body
   `{ webhook: { address, format, fields, metafield_namespaces } }`.
   Description: topic cannot be changed. Return `{ webhook }`.
5. `shopify_delete_webhook_subscription` — DELETE `/webhooks/{webhook_id}`.
   Return `{ deleted: true }`.
6. `shopify_count_webhook_subscriptions` — GET `/webhooks/count` query
   `{ topic, address }`. Return `{ count }`.
7. `shopify_graphql_webhooks` — GraphQL preset tool. Params: operation
   (enum list_webhookSubscriptions|get_webhookSubscription|
   count_webhookSubscriptions, required), variables (json), first, after,
   fields, custom_document, api_version, raise_on_graphql_errors. Implement
   the three presets with documents; when custom_document given, use it with
   variables. Return `{ data: body.data, errors: body.errors ?? [] }`.

### Module: themes (lib/tools/themes.js) — 9 tools

1. `shopify_list_themes` — GET `/themes`. Params: fields. Return `{ themes }`.
2. `shopify_get_theme` — GET `/themes/{theme_id}`. Params: theme_id (required), fields.
3. `shopify_create_theme` — POST `/themes` body `{ theme: { name (required,
   max 50), src (public zip URL), role (main|unpublished|development) } }`.
   WARNING: role=main publishes immediately. Return `{ theme }`.
4. `shopify_update_theme` — PUT `/themes/{theme_id}` body `{ theme: { name, role } }`.
5. `shopify_delete_theme` — DELETE `/themes/{theme_id}`. Description: cannot
   delete the last published theme or one being processed.
6. `shopify_list_theme_assets` — GET `/themes/{theme_id}/assets`. Params:
   theme_id (required), fields, asset_key. Return `{ assets }`.
7. `shopify_get_theme_asset` — GET `/themes/{theme_id}/assets` query
   `{ asset_key (required), fields }`. Return `{ asset }`.
8. `shopify_create_or_update_theme_asset` — PUT `/themes/{theme_id}/assets`
   body `{ asset: { key (required, e.g. 'templates/index.liquid'), value (text
   content) | src (public URL) | attachment (base64) | source_key (existing
   asset to duplicate) } }`. Exactly one of value/src/attachment/source_key.
   Return `{ asset }`.
9. `shopify_delete_theme_asset` — DELETE `/themes/{theme_id}/assets` query
   `{ asset_key (required) }`. Return `{ deleted: true }`.

### Module: marketing (lib/tools/marketing.js) — 6 tools

1. `shopify_list_marketing_events` — GET `/marketing_events` via `client.list`.
   Query: limit.
2. `shopify_get_marketing_event` — GET `/marketing_events/{marketing_event_id}`.
3. `shopify_create_marketing_event` — POST `/marketing_events` body
   `{ marketing_event: { event_type (required, enum ad|post|message|
   retargeting|transactional|affiliate|loyalty|newsletter|abandoned_cart),
   marketing_channel (required, enum search|display|social|email|referral|
   chat|receipt), started_at (required ISO 8601), budget, currency,
   budget_type (daily|lifetime), ended_at, scheduled_to_end_at, description,
   remote_id, paid, referring_domain, utm_campaign, utm_source, utm_medium,
   preview_url, manage_url, marketed_resources } }`. Return `{ marketing_event }`.
4. `shopify_update_marketing_event` — PUT
   `/marketing_events/{marketing_event_id}` body `{ marketing_event: { remote_id,
   budget, currency, budget_type, started_at, ended_at, scheduled_to_end_at } }`.
   Description: only those fields are updatable; others are read-only.
5. `shopify_delete_marketing_event` — DELETE
   `/marketing_events/{marketing_event_id}`.
6. `shopify_create_marketing_engagements` — POST
   `/marketing_events/{marketing_event_id}/engagements` body
   `{ engagements: [...] }` (array required). Return `{ engagements }`.

### Module: gift_cards (lib/tools/gift_cards.js) — 6 tools

1. `shopify_list_gift_cards` — GET `/gift_cards` via `client.list`. Query:
   limit, since_id, fields, status (enabled|disabled).
2. `shopify_get_gift_card` — GET `/gift_cards/{gift_card_id}`. Description:
   full code only visible at creation. Return `{ gift_card }`.
3. `shopify_create_gift_card` — POST `/gift_cards` body
   `{ gift_card: { initial_value (required), note, expires_on, template_suffix,
   customer_id, currency } }`. Return `{ gift_card }`.
4. `shopify_update_gift_card` — PUT `/gift_cards/{gift_card_id}` body
   `{ gift_card: { expires_on, note, template_suffix, customer_id } }`.
   Description: balance/initial value not modifiable.
5. `shopify_disable_gift_card` — POST `/gift_cards/{gift_card_id}/disable`.
   Description: irreversible. Return `{ gift_card }`.
6. `shopify_search_gift_cards` — GET `/gift_cards/search` via `client.list`.
   Query: query (e.g. `last_characters:abcd` or `email:...`), limit, fields,
   order, page_info, created_at_min/max, updated_at_min/max.

### Module: redirects (lib/tools/redirects.js) — 5 tools

1. `shopify_list_redirects` — GET `/redirects` via `client.list`. Query:
   limit, since_id, fields, path, target.
2. `shopify_get_redirect` — GET `/redirects/{redirect_id}`. Params: redirect_id (required), fields.
3. `shopify_create_redirect` — POST `/redirects` body `{ redirect: { path
   (required, max 1024), target (required, max 255) } }`.
4. `shopify_update_redirect` — PUT `/redirects/{redirect_id}` body
   `{ redirect: { path, target } }`. At least one required (validate).
5. `shopify_delete_redirect` — DELETE `/redirects/{redirect_id}`.

### Module: script_tags (lib/tools/script_tags.js) — 5 tools

1. `shopify_list_script_tags` — GET `/script_tags` via `client.list`. Query:
   limit, since_id, fields, src, created_at_min/max, updated_at_min/max.
2. `shopify_get_script_tag` — GET `/script_tags/{script_tag_id}`. Params: script_tag_id (required), fields.
3. `shopify_create_script_tag` — POST `/script_tags` body `{ script_tag: { src
   (required, HTTPS), event (required, 'onload'), display_scope
   (online_store|order_status|all), cache } }`. Return `{ script_tag }`.
4. `shopify_update_script_tag` — PUT `/script_tags/{script_tag_id}` body
   `{ script_tag: { src, event, display_scope, cache } }`.
5. `shopify_delete_script_tag` — DELETE `/script_tags/{script_tag_id}`.

### Module: billing (lib/tools/billing.js) — 6 tools

1. `shopify_create_app_subscription` — GraphQL `appSubscriptionCreate`. Params:
   name (required), returnUrl (required), lineItems (array, required; each
   `{ plan: { appRecurringPricingDetails: { price: { amount, currencyCode },
   interval: 'EVERY_30_DAYS' } } }` or usage details), trialDays (integer),
   test (boolean), replacementBehavior (STANDARD|APPLY_IMMEDIATELY|
   APPLY_ON_NEXT_BILLING_CYCLE). Return
   `{ data, userErrors, confirmationUrl: body.data?.appSubscriptionCreate?.confirmationUrl }`.
2. `shopify_cancel_app_subscription` — GraphQL `appSubscriptionCancel`. Params:
   id (required, GID gid://shopify/AppSubscription/...), prorate (boolean).
   Return `{ data, userErrors }`.
3. `shopify_update_app_subscription_line_item` — GraphQL
   `appSubscriptionLineItemUpdate`. Params: id (required,
   gid://shopify/AppSubscriptionLineItem/...), cappedAmount (json, required:
   `{ amount, currencyCode }`). Return `{ data, userErrors, confirmationUrl }`.
4. `shopify_create_one_time_charge` — POST `/application_charges` body
   `{ application_charge: { name (required), price (required, 0.50-10000),
   return_url (required), test } }`. Return `{ application_charge }`.
5. `shopify_get_application_charges` — GET `/application_charges` via
   `client.list`. Query: fields, since_id.
6. `shopify_get_application_charge_by_id` — GET
   `/application_charges/{application_charge_id}`. Params: application_charge_id (required), fields.

### Module: misc (lib/tools/misc.js) — 6 tools

1. `shopify_create_resource_feedback` — POST `/resource_feedback` body
   `{ resource_feedback: { state (required, requires_action|success), messages
   (array, exactly one message when requires_action), feedback_generated_at
   (required ISO 8601) } }`. Return `{ resource_feedback }`.
2. `shopify_list_resource_feedbacks` — GET `/resource_feedback`.
   Return `{ resource_feedback }`.
3. `shopify_list_storefront_access_tokens` — GET `/storefront_access_tokens`.
   Return `{ storefront_access_tokens }`.
4. `shopify_create_storefront_access_token` — POST `/storefront_access_tokens`
   body `{ storefront_access_token: { title (required) } }`.
   Return `{ storefront_access_token }`.
5. `shopify_delete_storefront_access_token` — DELETE
   `/storefront_access_tokens/{storefront_access_token_id}`.
6. `shopify_trigger_shopify_flow` — GraphQL `flowTriggerReceive`. Params:
   handle (required), payload (json, required, must be under 50 KB).
   Return `{ data, userErrors }`.

### Module: graphql (lib/tools/graphql.js) — 2 tools

1. `shopify_graphql_admin_execute` — generic GraphQL escape hatch. Params:
   document (string, required, full query/mutation), variables (json),
   api_version (string), operation_name (string), raise_on_user_errors
   (boolean, default false), raise_on_graphql_errors (boolean, default false).
   Implementation: `body = await client.graphql(document, variables,
   args.api_version)`. Collect userErrors from `body.data` values
   (each mutation payload with a userErrors array). When
   raise_on_graphql_errors and `body.errors` has entries → throw ShopifyError
   with joined messages. When raise_on_user_errors and userErrors found →
   throw. Return `{ data: body.data, errors: body.errors ?? [], extensions:
   body.extensions, userErrors, pageInfo: extracted from data if present }`.
2. `shopify_graphql_write_operations` — preset mutation dispatch. Params:
   operation (string, required, one of: orderCreate, orderUpdate, refundCreate,
   orderEditBegin, orderEditCommit, draftOrderCreate, draftOrderUpdate,
   draftOrderComplete, customerCreate, customerUpdate, customerDelete,
   metafieldsSet, metafieldsDelete, metaobjectUpsert, collectionCreate,
   collectionUpdate, collectionDelete, collectionAddProducts,
   collectionRemoveProducts, inventoryAdjustQuantities, inventorySetQuantities,
   discountCodeBasicCreate, discountCodeBasicUpdate, discountCodeDelete,
   webhookSubscriptionCreate, webhookSubscriptionUpdate,
   webhookSubscriptionDelete, fulfillmentCreate, fulfillmentTrackingInfoUpdate,
   bulkOperationRunQuery, bulkOperationRunMutation), variables (json),
   custom_document (string, overrides preset), api_version,
   raise_on_user_errors, raise_on_graphql_errors.
   Build each preset document as
   `mutation { operationName(input: $input) { ...payloadFields } }` with
   variables `{ input }` — use standard Shopify input types ($input). For
   mutations without input (e.g. bulkOperationRunQuery takes query + groupObjects
   directly), use dedicated variable names. Return same envelope as
   `shopify_graphql_admin_execute`. For an unknown operation → throw
   ShopifyError('unknown write operation ...', 'SHOPIFY_UNSUPPORTED_OPERATION')
   suggesting shopify_graphql_admin_execute.

### Module: bulk (lib/tools/bulk.js) — 5 tools

1. `shopify_run_bulk_operation_query` — GraphQL `bulkOperationRunQuery`. Params:
   query (string, required, inner query WITHOUT mutation wrapper; must include
   at least one connection field using edges { node { ... } }), groupObjects
   (boolean). Document:
   `mutation bulk($query: String!, $groupObjects: Boolean) { bulkOperationRunQuery(query: $query, groupObjects: $groupObjects) { bulkOperation { id status } userErrors { field message } } }`.
   Return `{ data, userErrors, bulkOperation }`.
2. `shopify_get_bulk_operation` — GraphQL `bulkOperation` (by id). Params:
   id (required GID). Document:
   `query bulk($id: ID!) { bulkOperation(id: $id) { id status errorCode url partialDataUrl createdAt completedAt objectCount fileSize } }`.
   Return `{ data }`. Description: results URL valid ~7 days; poll status until COMPLETED.
3. `shopify_list_bulk_operations` — GraphQL `bulkOperations`. Params: first,
   last, after, before, reverse, sortKey (CREATED_AT), query (string filter).
   Return `{ data, pageInfo }`.
4. `shopify_cancel_bulk_operation` — GraphQL `bulkOperationCancel`. Params:
   id (required GID). Document:
   `mutation bulk($id: ID!) { bulkOperationCancel(id: $id) { bulkOperation { id status } userErrors { field message } } }`.
   Return `{ data, userErrors }`.
5. `shopify_query_current_bulk_operation` — GraphQL `currentBulkOperation`.
   Params: type (QUERY|MUTATION). Document:
   `query bulk($type: BulkOperationType!) { currentBulkOperation(type: $type) { id status errorCode url createdAt completedAt } }`.
   Return `{ data }`.

## Quality bar

- Every module imports only from `'../util.js'` and `'../client.js'` (client
  not needed if unused) and uses the shared deps.
- No `import` of other tool modules. No unused imports.
- Descriptions are concrete and agent-useful (include examples, ID formats,
  pitfalls). Match the tone of the Composio Shopify reference.
- No `console.log` inside tools.
- All client calls pass `signal: exec.signal`.
- After writing your file(s), run `node --check <file>` to verify syntax.

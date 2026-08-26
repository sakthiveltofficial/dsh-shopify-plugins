/**
 * Order tools: get/list/count/create/update/cancel/close/reopen/delete orders,
 * customer-order lookups, payment transactions, refunds (calculate + create),
 * and order risk assessments.
 * @module @shopify/dsh-shopify/tools/orders
 */

import { ShopifyError, defined, asArray, asObject } from '../util.js';

const ORDER_ID_HINT =
  'Order ids are the numeric Admin API ids (e.g. \'5448658052\'), NOT the admin order_number/name like \'#1001\'. Use shopify_list_orders with the name filter to translate a name into an id.';

const PAGE_INFO_HINT =
  'Reuse next_page_info from the previous response to fetch the next page; when page_info is present, only limit (and fields where documented) may accompany it.';

const LIMIT_PARAM = { type: 'integer', description: 'Maximum number of results per page (1–250, default 50).' };
const SINCE_ID_PARAM = {
  type: 'string',
  description: 'Return only resources with id greater than this numeric id (offset-style pagination; do not combine with page_info).',
};
const FIELDS_PARAM = {
  type: 'string',
  description: 'Comma-separated list of resource fields to include in the response (e.g. "id,name,total_price,financial_status").',
};
const IN_SHOP_CURRENCY_PARAM = {
  type: 'boolean',
  description: 'When true, monetary amounts in the response are converted to the shop\'s currency (the shop\'s iana_timezone/currency is available via shopify_get_shop_details).',
};
const CREATED_AT_MIN = { type: 'string', description: 'ISO 8601 timestamp; return orders created at or after this time.' };
const CREATED_AT_MAX = { type: 'string', description: 'ISO 8601 timestamp; return orders created at or before this time.' };
const UPDATED_AT_MIN = { type: 'string', description: 'ISO 8601 timestamp; return orders updated at or after this time.' };
const UPDATED_AT_MAX = { type: 'string', description: 'ISO 8601 timestamp; return orders updated at or before this time.' };
const PROCESSED_AT_MIN = { type: 'string', description: 'ISO 8601 timestamp; return orders processed at or after this time.' };
const PROCESSED_AT_MAX = { type: 'string', description: 'ISO 8601 timestamp; return orders processed at or before this time.' };

const STATUS_PARAM = {
  type: 'string',
  enum: ['open', 'closed', 'cancelled', 'any'],
  description: 'Filter by order state: open (default) | closed | cancelled | any.',
};
const FINANCIAL_STATUS_PARAM = {
  type: 'string',
  enum: ['pending', 'authorized', 'partially_paid', 'paid', 'partially_refunded', 'refunded', 'voided'],
  description: 'Filter by payment state, e.g. paid, authorized, refunded.',
};
const FULFILLMENT_STATUS_PARAM = {
  type: 'string',
  enum: ['shipped', 'partial', 'unshipped', 'any', 'unfulfilled'],
  description: 'Filter by fulfillment state: shipped | partial | unshipped | any | unfulfilled.',
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
      name: 'shopify_get_order',
      title: 'Get order',
      kind: 'read',
      description:
        `Gets a single order. ${ORDER_ID_HINT} A 403 response on this endpoint usually means the app token is missing the \'read_all_orders\' scope (and \'write_orders\' for updates). Pass fields (comma string) to limit the response; the full order includes line_items, customer, addresses, and totals.`,
      parameters: {
        order_id: { type: 'string', required: true, description: `REQUIRED. Numeric Admin API order id. ${ORDER_ID_HINT}` },
        fields: FIELDS_PARAM,
      },
      async execute(args, exec) {
        const orderId = requireArg(args, 'order_id', 'order_id');
        const body = await client.rest('GET', `/orders/${orderId}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { order: body.order };
      },
    },
    {
      name: 'shopify_list_orders',
      title: 'List orders',
      kind: 'read',
      description:
        'Lists orders (default: open orders only — pass status=any to include closed and cancelled). Filter by ids (comma string), name (e.g. "#1001"), financial_status, fulfillment_status, attribution_app_id, and created_at/updated_at/processed_at date ranges (ISO 8601; use shopify_get_shop_details for the shop iana_timezone). Pagination: limit (1–250) with since_id, or cursor page_info from a previous next_page_info. A 403 usually means the \'read_all_orders\' scope is missing.',
      parameters: {
        ids: { type: 'string', description: 'Comma-separated list of order ids to fetch (e.g. "5448658052,5448658053").' },
        name: { type: 'string', description: 'Filter by the order name as shown in admin, e.g. "#1001".' },
        status: STATUS_PARAM,
        financial_status: FINANCIAL_STATUS_PARAM,
        fulfillment_status: FULFILLMENT_STATUS_PARAM,
        created_at_min: CREATED_AT_MIN,
        created_at_max: CREATED_AT_MAX,
        updated_at_min: UPDATED_AT_MIN,
        updated_at_max: UPDATED_AT_MAX,
        processed_at_min: PROCESSED_AT_MIN,
        processed_at_max: PROCESSED_AT_MAX,
        attribution_app_id: { type: 'string', description: 'Filter by the app that created the order (its numeric app id).' },
        since_id: SINCE_ID_PARAM,
        limit: LIMIT_PARAM,
        fields: FIELDS_PARAM,
        page_info: { type: 'string', description: `Opaque cursor for the next page. ${PAGE_INFO_HINT}` },
      },
      async execute(args, exec) {
        const query = defined({
          ids: args.ids,
          name: args.name,
          status: args.status,
          financial_status: args.financial_status,
          fulfillment_status: args.fulfillment_status,
          created_at_min: args.created_at_min,
          created_at_max: args.created_at_max,
          updated_at_min: args.updated_at_min,
          updated_at_max: args.updated_at_max,
          processed_at_min: args.processed_at_min,
          processed_at_max: args.processed_at_max,
          attribution_app_id: args.attribution_app_id,
          since_id: args.since_id,
          limit: args.limit,
          fields: args.fields,
          page_info: args.page_info,
        });
        const { items, next_page_info } = await client.list('/orders', query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_count_orders',
      title: 'Count orders',
      kind: 'read',
      description:
        'Counts orders matching the same filters as shopify_list_orders (ids, name, status, financial_status, fulfillment_status, date ranges, attribution_app_id) minus pagination. Cheap way to size an order set before paging; returns { count }.',
      parameters: {
        ids: { type: 'string', description: 'Comma-separated list of order ids to count.' },
        name: { type: 'string', description: 'Count only orders with this name, e.g. "#1001".' },
        status: STATUS_PARAM,
        financial_status: FINANCIAL_STATUS_PARAM,
        fulfillment_status: FULFILLMENT_STATUS_PARAM,
        created_at_min: CREATED_AT_MIN,
        created_at_max: CREATED_AT_MAX,
        updated_at_min: UPDATED_AT_MIN,
        updated_at_max: UPDATED_AT_MAX,
        processed_at_min: PROCESSED_AT_MIN,
        processed_at_max: PROCESSED_AT_MAX,
        attribution_app_id: { type: 'string', description: 'Count only orders created by this app id.' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', '/orders/count', {
          query: defined({
            ids: args.ids,
            name: args.name,
            status: args.status,
            financial_status: args.financial_status,
            fulfillment_status: args.fulfillment_status,
            created_at_min: args.created_at_min,
            created_at_max: args.created_at_max,
            updated_at_min: args.updated_at_min,
            updated_at_max: args.updated_at_max,
            processed_at_min: args.processed_at_min,
            processed_at_max: args.processed_at_max,
            attribution_app_id: args.attribution_app_id,
          }),
          signal: exec.signal,
        });
        return { count: body.count };
      },
    },
    {
      name: 'shopify_create_order',
      title: 'Create order',
      kind: 'write',
      description:
        'Creates a LIVE order — this is not a draft: including transactions charges/authorizes payment and send_receipt emails the customer a receipt. For an editable draft use the draft_orders tools (shopify_create_draft_order) instead. line_items is required: each item needs variant_id (or title + price) plus quantity. inventory_behaviour: bypass (no stock change), decrement_ignoring_policy, or decrement_obeying_policy (respects inventory policy). financial_status: pending, authorized, partially_paid, paid, partially_refunded, refunded, voided. Requires the \'write_orders\' scope.',
      parameters: {
        line_items: { type: 'array', required: true, items: { type: 'json' }, description: 'REQUIRED. Non-empty array of line items, e.g. [{ variant_id: "43123456789", quantity: 2, price: "19.99" }] or [{ title: "Custom item", price: "5.00", quantity: 1 }].' },
        customer: { type: 'json', description: 'Customer reference: { id } for an existing customer (from shopify_list_customers) or { first_name, last_name, email } to create one inline.' },
        email: { type: 'string', description: "Customer's email address." },
        phone: { type: 'string', description: "Customer's phone number." },
        currency: { type: 'string', description: 'ISO 4217 currency code (defaults to the shop currency), e.g. "USD".' },
        billing_address: { type: 'json', description: 'Billing address: { first_name, last_name, address1, city, province, country, zip, phone }.' },
        shipping_address: { type: 'json', description: 'Shipping address (same shape as billing_address).' },
        financial_status: FINANCIAL_STATUS_PARAM,
        fulfillment_status: FULFILLMENT_STATUS_PARAM,
        inventory_behaviour: { type: 'string', enum: ['bypass', 'decrement_ignoring_policy', 'decrement_obeying_policy'], description: 'How creating the order affects inventory: bypass (no decrement), decrement_ignoring_policy, or decrement_obeying_policy (respects inventory policy; default bypass).' },
        send_receipt: { type: 'boolean', description: 'Send the customer an order confirmation email (default false).' },
        send_fulfillment_receipt: { type: 'boolean', description: 'Send the customer a fulfillment confirmation email (default false).' },
        note: { type: 'string', description: 'Order note visible to staff (not the customer).' },
        tags: { type: 'string', description: 'Comma-separated tags, e.g. "wholesale,urgent".' },
        total_tax: { type: 'string', description: 'Total tax as a string, e.g. "2.50" (required when taxes are included via shipping_lines/tax_lines).' },
        discount_codes: { type: 'array', items: { type: 'json' }, description: 'Discounts applied: [{ code, amount }] (amount is a string).' },
        shipping_lines: { type: 'array', items: { type: 'json' }, description: 'Shipping costs: [{ title, price, code, source }] (price is a string).' },
        transactions: { type: 'array', items: { type: 'json' }, description: 'Payment transactions to create with the order: [{ kind, amount, status, gateway }] — kind is one of authorization, capture, sale, void, refund.' },
      },
      async execute(args, exec) {
        const lineItems = objectArray(args.line_items);
        if (!lineItems || lineItems.length === 0 || lineItems.some((item) => !item || typeof item !== 'object')) {
          throw new ShopifyError(
            'line_items is required and must be a non-empty array of line-item objects (each with variant_id or title + price, plus quantity)',
            'SHOPIFY_INVALID_ARGS',
          );
        }
        const body = {
          order: defined({
            line_items: lineItems,
            customer: asObject(args.customer),
            email: args.email,
            phone: args.phone,
            currency: args.currency,
            billing_address: asObject(args.billing_address),
            shipping_address: asObject(args.shipping_address),
            financial_status: args.financial_status,
            fulfillment_status: args.fulfillment_status,
            inventory_behaviour: args.inventory_behaviour,
            send_receipt: args.send_receipt,
            send_fulfillment_receipt: args.send_fulfillment_receipt,
            note: args.note,
            tags: args.tags,
            total_tax: args.total_tax,
            discount_codes: objectArray(args.discount_codes),
            shipping_lines: objectArray(args.shipping_lines),
            transactions: objectArray(args.transactions),
          }),
        };
        const result = await client.rest('POST', '/orders', { body, signal: exec.signal });
        return { order: result.order };
      },
    },
    {
      name: 'shopify_update_order',
      title: 'Update order',
      kind: 'write',
      description:
        `Updates mutable fields on a live order: note, email, phone, tags, po_number, metafields, note_attributes, billing/shipping addresses, tax_exempt, buyer_accepts_marketing, send_receipt, send_fulfillment_receipt. Line items, prices, and payments CANNOT be changed here — use shopify_create_order_transaction / shopify_create_refund for money movement, or draft orders for editable carts. ${ORDER_ID_HINT}`,
      parameters: {
        order_id: { type: 'string', required: true, description: `REQUIRED. Numeric Admin API order id. ${ORDER_ID_HINT}` },
        note: { type: 'string', description: 'Order note visible to staff.' },
        email: { type: 'string', description: "Customer's email address." },
        phone: { type: 'string', description: "Customer's phone number." },
        tags: { type: 'string', description: 'Comma-separated tags, e.g. "wholesale,urgent".' },
        po_number: { type: 'string', description: "Purchase order number on the order (\"PO\" field shown in admin)." },
        metafields: { type: 'array', items: { type: 'json' }, description: 'Metafields to write on the order: [{ namespace, key, value, type }].' },
        note_attributes: { type: 'array', items: { type: 'json' }, description: 'Custom checkout attributes: [{ name, value }].' },
        billing_address: { type: 'json', description: 'Billing address: { first_name, last_name, address1, city, province, country, zip, phone }.' },
        shipping_address: { type: 'json', description: 'Shipping address (same shape as billing_address).' },
        tax_exempt: { type: 'boolean', description: 'Whether the customer is exempt from tax on this order.' },
        buyer_accepts_marketing: { type: 'boolean', description: 'Whether the customer agreed to marketing emails.' },
        send_receipt: { type: 'boolean', description: 'Send the customer an updated order confirmation email (default false).' },
        send_fulfillment_receipt: { type: 'boolean', description: 'Send the customer a fulfillment confirmation email (default false).' },
      },
      async execute(args, exec) {
        const orderId = requireArg(args, 'order_id', 'order_id');
        const body = {
          order: defined({
            note: args.note,
            email: args.email,
            phone: args.phone,
            tags: args.tags,
            po_number: args.po_number,
            metafields: objectArray(args.metafields),
            note_attributes: objectArray(args.note_attributes),
            billing_address: asObject(args.billing_address),
            shipping_address: asObject(args.shipping_address),
            tax_exempt: args.tax_exempt,
            buyer_accepts_marketing: args.buyer_accepts_marketing,
            send_receipt: args.send_receipt,
            send_fulfillment_receipt: args.send_fulfillment_receipt,
          }),
        };
        const result = await client.rest('PUT', `/orders/${orderId}`, { body, signal: exec.signal });
        return { order: result.order };
      },
    },
    {
      name: 'shopify_cancel_order',
      title: 'Cancel order',
      kind: 'write',
      description:
        'Cancels an order. reason enum: customer | fraud | inventory | declined | other. restock: true returns items to inventory. refund: true refunds the payment (amount limits the refund, currency sets its currency). email sends the customer a cancellation email. Cancelling an order that already captured payment also voids/captures-reverses the transaction. Requires the \'write_orders\' scope.',
      parameters: {
        order_id: { type: 'string', required: true, description: `REQUIRED. Numeric Admin API order id. ${ORDER_ID_HINT}` },
        reason: { type: 'string', enum: ['customer', 'fraud', 'inventory', 'declined', 'other'], description: 'Cancellation reason (default other).' },
        email: { type: 'boolean', description: 'Send the customer a cancellation email (default false).' },
        restock: { type: 'boolean', description: 'Return cancelled line items to inventory (default false).' },
        refund: { type: 'boolean', description: 'Refund the payment for the order (default false).' },
        amount: { type: 'string', description: 'Amount to refund, as a string e.g. "19.99" (defaults to the full order total when refund is true).' },
        currency: { type: 'string', description: 'ISO 4217 currency code for the refund amount, e.g. "USD".' },
      },
      async execute(args, exec) {
        const orderId = requireArg(args, 'order_id', 'order_id');
        const body = {
          order: defined({
            reason: args.reason,
            email: args.email,
            restock: args.restock,
            refund: args.refund,
            amount: args.amount,
            currency: args.currency,
          }),
        };
        const result = await client.rest('POST', `/orders/${orderId}/cancel`, { body, signal: exec.signal });
        return { order: result.order };
      },
    },
    {
      name: 'shopify_close_order',
      title: 'Close order',
      kind: 'write',
      description:
        'Closes (archives) an open order so it no longer appears in the open-orders list. Closing is NOT cancelling: payments are untouched and the order can be reopened with shopify_reopen_closed_order. Typically used after fulfilling an order that was paid outside Shopify.',
      parameters: {
        order_id: { type: 'string', required: true, description: `REQUIRED. Numeric Admin API order id. ${ORDER_ID_HINT}` },
      },
      async execute(args, exec) {
        const orderId = requireArg(args, 'order_id', 'order_id');
        const result = await client.rest('POST', `/orders/${orderId}/close`, { signal: exec.signal });
        return { order: result.order };
      },
    },
    {
      name: 'shopify_reopen_closed_order',
      title: 'Reopen closed order',
      kind: 'write',
      description:
        'Reopens a previously closed order so it appears in the open-orders list again. The inverse of shopify_close_order; the order must be in the closed state.',
      parameters: {
        order_id: { type: 'string', required: true, description: `REQUIRED. Numeric Admin API order id. ${ORDER_ID_HINT}` },
      },
      async execute(args, exec) {
        const orderId = requireArg(args, 'order_id', 'order_id');
        const result = await client.rest('POST', `/orders/${orderId}/open`, { signal: exec.signal });
        return { order: result.order };
      },
    },
    {
      name: 'shopify_delete_order',
      title: 'Delete order',
      kind: 'write',
      description:
        'Permanently deletes an order — irreversible, no trash. Prefer shopify_cancel_order for normal reversals. Requires the \'write_orders\' scope.',
      parameters: {
        order_id: { type: 'string', required: true, description: `REQUIRED. Numeric Admin API order id. ${ORDER_ID_HINT}` },
      },
      async execute(args, exec) {
        const orderId = requireArg(args, 'order_id', 'order_id');
        await client.rest('DELETE', `/orders/${orderId}`, { signal: exec.signal });
        return { deleted: true, order_id: orderId };
      },
    },
    {
      name: 'shopify_get_customer_orders',
      title: 'Get customer orders',
      kind: 'read',
      description:
        'Lists the orders belonging to one customer. customer_id is the numeric customer id (from shopify_list_customers / shopify_get_customer). status filters by order state (open | closed | cancelled | any); paginate with limit + since_id or the cursor page_info from next_page_info; fields limits the returned attributes.',
      parameters: {
        customer_id: { type: 'string', required: true, description: 'REQUIRED. Numeric customer id (e.g. \'7064055072931\').' },
        status: STATUS_PARAM,
        limit: LIMIT_PARAM,
        since_id: SINCE_ID_PARAM,
        page_info: { type: 'string', description: `Opaque cursor for the next page. ${PAGE_INFO_HINT}` },
        fields: FIELDS_PARAM,
      },
      async execute(args, exec) {
        const customerId = requireArg(args, 'customer_id', 'customer_id');
        const query = defined({
          status: args.status,
          limit: args.limit,
          since_id: args.since_id,
          page_info: args.page_info,
          fields: args.fields,
        });
        const { items, next_page_info } = await client.list(`/customers/${customerId}/orders`, query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_list_transactions',
      title: 'List order transactions',
      kind: 'read',
      description:
        `Lists the payment transactions recorded against an order (authorizations, captures, sales, voids, refunds). ${ORDER_ID_HINT} in_shop_currency=true converts amounts to the shop's currency.`,
      parameters: {
        order_id: { type: 'string', required: true, description: `REQUIRED. Numeric Admin API order id. ${ORDER_ID_HINT}` },
        fields: FIELDS_PARAM,
        since_id: SINCE_ID_PARAM,
        in_shop_currency: IN_SHOP_CURRENCY_PARAM,
      },
      async execute(args, exec) {
        const orderId = requireArg(args, 'order_id', 'order_id');
        const query = defined({
          fields: args.fields,
          since_id: args.since_id,
          in_shop_currency: args.in_shop_currency,
        });
        const { items, next_page_info } = await client.list(`/orders/${orderId}/transactions`, query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_transaction',
      title: 'Get transaction',
      kind: 'read',
      description:
        'Gets one payment transaction by its numeric transaction id — the transaction object\'s id from shopify_list_transactions, NOT the order id. order_id is the order the transaction belongs to. in_shop_currency=true converts the amount to the shop\'s currency.',
      parameters: {
        order_id: { type: 'string', required: true, description: `REQUIRED. Numeric Admin API order id. ${ORDER_ID_HINT}` },
        transaction_id: { type: 'string', required: true, description: 'REQUIRED. Numeric transaction id (the transaction object\'s id, e.g. \'1068278485\').' },
        fields: FIELDS_PARAM,
        in_shop_currency: IN_SHOP_CURRENCY_PARAM,
      },
      async execute(args, exec) {
        const orderId = requireArg(args, 'order_id', 'order_id');
        const transactionId = requireArg(args, 'transaction_id', 'transaction_id');
        const body = await client.rest('GET', `/orders/${orderId}/transactions/${transactionId}`, {
          query: defined({ fields: args.fields, in_shop_currency: args.in_shop_currency }),
          signal: exec.signal,
        });
        return { transaction: body.transaction };
      },
    },
    {
      name: 'shopify_create_order_transaction',
      title: 'Create order transaction',
      kind: 'write',
      description:
        'Records a payment transaction on an order. kind is required: authorization | capture | sale | void | refund. A capture must reference the original authorization via parent_id. amount and currency default to the order\'s values. test: true marks a test transaction. For line-item refunds use shopify_calculate_refund + shopify_create_refund instead of kind=refund here. Requires the \'write_orders\' scope.',
      parameters: {
        order_id: { type: 'string', required: true, description: `REQUIRED. Numeric Admin API order id. ${ORDER_ID_HINT}` },
        kind: { type: 'string', required: true, enum: ['authorization', 'capture', 'sale', 'void', 'refund'], description: 'REQUIRED. Transaction kind: authorization, capture, sale, void, or refund.' },
        amount: { type: 'string', description: 'Transaction amount as a string, e.g. "19.99" (defaults to the order total).' },
        currency: { type: 'string', description: 'ISO 4217 currency code, e.g. "USD" (defaults to the order currency).' },
        gateway: { type: 'string', description: 'Payment gateway used, e.g. "shopify_payments", "manual".' },
        parent_id: { type: 'string', description: 'For captures/voids: the id of the parent authorization transaction.' },
        source_name: { type: 'string', description: 'Origin of the transaction, e.g. "web", "pos", "mobile_app".' },
        authorization: { type: 'string', description: 'Authorization code returned by the payment gateway.' },
        test: { type: 'boolean', description: 'Whether this is a test transaction (default false).' },
      },
      async execute(args, exec) {
        const orderId = requireArg(args, 'order_id', 'order_id');
        const kind = requireArg(args, 'kind', 'kind');
        const body = {
          transaction: defined({
            kind,
            amount: args.amount,
            currency: args.currency,
            gateway: args.gateway,
            parent_id: args.parent_id,
            source_name: args.source_name,
            authorization: args.authorization,
            test: args.test,
          }),
        };
        const result = await client.rest('POST', `/orders/${orderId}/transactions`, { body, signal: exec.signal });
        return { transaction: result.transaction };
      },
    },
    {
      name: 'shopify_calculate_refund',
      title: 'Calculate refund',
      kind: 'read',
      description:
        'Calculates a refund for an order WITHOUT applying it. Pass shipping ({ full_refund: true } or { amount, currency }) and/or refund_line_items ([{ line_item_id, quantity, restock_type, location_id }]). Returns the full calculated refund body: suggested refund_line_items, transactions (each kind \'suggested_refund\'), subtotal, total_tax and shipping. Feed this body into shopify_create_refund after changing every transaction\'s kind to \'refund\'.',
      parameters: {
        order_id: { type: 'string', required: true, description: `REQUIRED. Numeric Admin API order id. ${ORDER_ID_HINT}` },
        shipping: { type: 'json', description: 'Shipping refund settings: { full_refund: true } to refund all shipping, or { amount: "5.00", currency: "USD" } for a partial shipping refund.' },
        refund_line_items: { type: 'array', items: { type: 'json' }, description: 'Line items to refund: [{ line_item_id, quantity, restock_type ("no_restock"|"cancel"|"return"), location_id }].' },
        currency: { type: 'string', description: 'ISO 4217 currency code for the refund, e.g. "USD" (defaults to the order currency).' },
      },
      async execute(args, exec) {
        const orderId = requireArg(args, 'order_id', 'order_id');
        const body = {
          refund: defined({
            shipping: asObject(args.shipping),
            refund_line_items: objectArray(args.refund_line_items),
            currency: args.currency,
          }),
        };
        const result = await client.rest('POST', `/orders/${orderId}/refunds/calculate`, { body, signal: exec.signal });
        return result;
      },
    },
    {
      name: 'shopify_create_refund',
      title: 'Create refund',
      kind: 'write',
      description:
        'Applies a refund to an order. IMPORTANT: first call shopify_calculate_refund with the same shipping/refund_line_items to obtain the suggested payload, then change every transaction\'s kind from \'suggested_refund\' to \'refund\' and pass it here (transactions plus refund_line_items; optionally shipping). notify sends the customer a refund email; discrepancy_reason explains any amount difference (e.g. "taxes recalculated"). Requires the \'write_orders\' scope.',
      parameters: {
        order_id: { type: 'string', required: true, description: `REQUIRED. Numeric Admin API order id. ${ORDER_ID_HINT}` },
        note: { type: 'string', description: 'Staff-only note on the refund.' },
        notify: { type: 'boolean', description: 'Send the customer a refund notification email (default false).' },
        currency: { type: 'string', description: 'ISO 4217 currency code for the refund, e.g. "USD".' },
        shipping: { type: 'json', description: 'Shipping refund: { full_refund: true } or { amount, currency } (from the calculation).' },
        refund_line_items: { type: 'array', items: { type: 'json' }, description: 'Refunded line items from the calculation: [{ line_item_id, quantity, restock_type, location_id }].' },
        transactions: { type: 'array', items: { type: 'json' }, description: 'REQUIRED for payment refunds: the transactions from shopify_calculate_refund with kind changed from "suggested_refund" to "refund" (e.g. [{ parent_id, amount, kind: "refund", gateway }]).' },
        discrepancy_reason: { type: 'string', description: 'Explanation when the refunded amount differs from the order total, e.g. "taxes recalculated", "partial refund".' },
      },
      async execute(args, exec) {
        const orderId = requireArg(args, 'order_id', 'order_id');
        const body = {
          refund: defined({
            note: args.note,
            notify: args.notify,
            currency: args.currency,
            shipping: asObject(args.shipping),
            refund_line_items: objectArray(args.refund_line_items),
            transactions: objectArray(args.transactions),
            discrepancy_reason: args.discrepancy_reason,
          }),
        };
        const result = await client.rest('POST', `/orders/${orderId}/refunds`, { body, signal: exec.signal });
        return { refund: result.refund };
      },
    },
    {
      name: 'shopify_list_order_refunds',
      title: 'List order refunds',
      kind: 'read',
      description:
        `Lists the refunds applied to an order, newest first, including their line items, transactions and totals. ${ORDER_ID_HINT} in_shop_currency=true converts amounts to the shop's currency.`,
      parameters: {
        order_id: { type: 'string', required: true, description: `REQUIRED. Numeric Admin API order id. ${ORDER_ID_HINT}` },
        limit: LIMIT_PARAM,
        fields: FIELDS_PARAM,
        in_shop_currency: IN_SHOP_CURRENCY_PARAM,
      },
      async execute(args, exec) {
        const orderId = requireArg(args, 'order_id', 'order_id');
        const query = defined({
          limit: args.limit,
          fields: args.fields,
          in_shop_currency: args.in_shop_currency,
        });
        const { items, next_page_info } = await client.list(`/orders/${orderId}/refunds`, query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_order_refund_by_id',
      title: 'Get order refund by id',
      kind: 'read',
      description:
        'Gets one refund by its numeric refund id (the refund object\'s id from shopify_list_order_refunds) for the given order. Includes the refunded line items, transactions, shipping, and totals.',
      parameters: {
        order_id: { type: 'string', required: true, description: `REQUIRED. Numeric Admin API order id. ${ORDER_ID_HINT}` },
        refund_id: { type: 'string', required: true, description: 'REQUIRED. Numeric refund id (the refund object\'s id, e.g. \'7482394167\').' },
      },
      async execute(args, exec) {
        const orderId = requireArg(args, 'order_id', 'order_id');
        const refundId = requireArg(args, 'refund_id', 'refund_id');
        const body = await client.rest('GET', `/orders/${orderId}/refunds/${refundId}`, { signal: exec.signal });
        return { refund: body.refund };
      },
    },
    {
      name: 'shopify_get_order_risks',
      title: 'Get order risks',
      kind: 'read',
      description:
        `Lists the fraud risk assessments recorded for an order (e.g. from Shopify Payments or third-party apps). Each risk has a recommendation (cancel | investigate | accept), a 0-100 score, a source, and a message. ${ORDER_ID_HINT}`,
      parameters: {
        order_id: { type: 'string', required: true, description: `REQUIRED. Numeric Admin API order id. ${ORDER_ID_HINT}` },
      },
      async execute(args, exec) {
        const orderId = requireArg(args, 'order_id', 'order_id');
        const { items, next_page_info } = await client.list(`/orders/${orderId}/risks`);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_create_order_risk',
      title: 'Create order risk',
      kind: 'write',
      description:
        'Records a fraud risk assessment on an order (used when an app performs its own fraud review). recommendation enum: cancel | investigate | accept; cause_cancel: true cancels the order (use with recommendation "cancel"). score is a 0-100 severity value, source identifies the origin (e.g. "Manual", your app name), message is the human-readable summary shown in admin, display toggles storefront visibility of the risk. Requires the \'write_orders\' scope.',
      parameters: {
        order_id: { type: 'string', required: true, description: `REQUIRED. Numeric Admin API order id. ${ORDER_ID_HINT}` },
        recommendation: { type: 'string', enum: ['cancel', 'investigate', 'accept'], description: 'Risk recommendation: cancel | investigate | accept.' },
        score: { type: 'integer', description: 'Risk severity score from 0 (low) to 100 (high).' },
        source: { type: 'string', description: 'Origin of the risk assessment, e.g. "Manual" or an app name.' },
        message: { type: 'string', description: 'Human-readable risk summary shown in the Shopify admin.' },
        display: { type: 'boolean', description: 'Whether the risk is visible on the storefront (default true).' },
        cause_cancel: { type: 'boolean', description: 'When true, Shopify cancels the order because of this risk (default false).' },
      },
      async execute(args, exec) {
        const orderId = requireArg(args, 'order_id', 'order_id');
        const body = {
          risk: defined({
            recommendation: args.recommendation,
            score: args.score,
            source: args.source,
            message: args.message,
            display: args.display,
            cause_cancel: args.cause_cancel,
          }),
        };
        const result = await client.rest('POST', `/orders/${orderId}/risks`, { body, signal: exec.signal });
        return { risk: result.risk };
      },
    },
  ];
}

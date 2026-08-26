/**
 * Draft order tools: list, get, create, update, delete, complete, and send
 * invoice. Draft orders are pending orders that become real orders when
 * completed — use them for quote / invoice / checkout-draft workflows.
 * @module @shopify/dsh-shopify/tools/draft_orders
 */

import { ShopifyError, asArray, asObject, defined } from '../util.js';

export function tools(ctx, deps) {
  const { client } = deps;
  return [
    {
      name: 'shopify_list_draft_orders',
      title: 'List draft orders',
      kind: 'read',
      description:
        'Lists draft orders (pending orders that are not yet completed). Paginated: loop with the returned next_page_info until null to fetch every page. Filters: ids (comma-separated), status (open|invoice_sent|completed), updated_at_min/updated_at_max (ISO 8601, evaluated in the shop\'s local timezone — use shopify_get_shop_details for iana_timezone). Each item includes line_items, customer, and totals; use shopify_get_draft_order for full detail.',
      parameters: {
        ids: { type: 'string', description: 'Comma-separated draft order IDs to return (e.g. "1043239486,1043239487").' },
        status: { type: 'string', enum: ['open', 'invoice_sent', 'completed'], description: 'Filter by draft order status: open (default), invoice_sent, or completed.' },
        limit: { type: 'integer', description: 'Maximum results per page, 1-250 (default 50).' },
        since_id: { type: 'string', description: 'Return only draft orders with id greater than this numeric ID (offset pagination).' },
        fields: { type: 'string', description: 'Comma-separated subset of draft_order fields to return (e.g. "id,email,total_price").' },
        updated_at_min: { type: 'string', description: 'ISO 8601 timestamp: only draft orders updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 timestamp: only draft orders updated at or before this time.' },
      },
      async execute(args, exec) {
        const { items, next_page_info } = await client.list(
          '/draft_orders',
          defined({
            ids: args.ids,
            status: args.status,
            limit: args.limit,
            since_id: args.since_id,
            fields: args.fields,
            updated_at_min: args.updated_at_min,
            updated_at_max: args.updated_at_max,
          }),
        );
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_draft_order',
      title: 'Get draft order',
      kind: 'read',
      description:
        'Gets one draft order by numeric ID (e.g. "1043239486"; string or integer accepted). Returns the full draft_order including line_items, shipping/billing addresses, applied_discount, and totals. Pass fields (comma-separated) to limit the response.',
      parameters: {
        draft_order_id: { type: 'string', required: true, description: 'Numeric ID of the draft order (e.g. "1043239486").' },
        fields: { type: 'string', description: 'Comma-separated subset of draft_order fields to return.' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/draft_orders/${args.draft_order_id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { draft_order: body.draft_order };
      },
    },
    {
      name: 'shopify_create_draft_order',
      title: 'Create draft order',
      kind: 'write',
      description:
        "Creates a draft order (a pending order awaiting checkout/invoice — not yet an order). draft_order is a JSON object; line_items is REQUIRED and must be a non-empty array where each entry has quantity plus either variant_id (existing product variant) or title+price (custom line item). Other keys: customer_id, email, note, tags, currency (ISO code), tax_exempt, shipping_line, billing_address, shipping_address, use_customer_default_address, note_attributes, applied_discount. After creating, send an invoice (shopify_send_draft_order_invoice) or complete it (shopify_complete_draft_order) to convert it into an order.",
      parameters: {
        draft_order: { type: 'json', required: true, description: 'The draft_order body as a JSON object. line_items is required: non-empty array of { quantity, variant_id } or { quantity, title, price }. Optional: customer_id, email, note, tags, currency, tax_exempt, shipping_line, billing_address, shipping_address, use_customer_default_address, note_attributes, applied_discount.' },
      },
      async execute(args, exec) {
        const draftOrder = asObject(args.draft_order);
        if (!draftOrder || typeof draftOrder !== 'object') {
          throw new ShopifyError('draft_order (JSON object) is required', 'SHOPIFY_INVALID_ARGS');
        }
        const lineItems = asArray(draftOrder.line_items);
        if (!Array.isArray(lineItems) || lineItems.length === 0) {
          throw new ShopifyError('draft_order.line_items is required: a non-empty array with quantity plus either variant_id or title+price per entry', 'SHOPIFY_INVALID_ARGS');
        }
        for (const item of lineItems) {
          const hasVariant = item && typeof item === 'object' && item.variant_id !== undefined && item.variant_id !== null;
          const hasTitlePrice = item && typeof item === 'object' && item.title !== undefined && item.price !== undefined;
          if (!item || typeof item !== 'object' || item.quantity === undefined || (!hasVariant && !hasTitlePrice)) {
            throw new ShopifyError('each draft_order.line_items entry requires quantity plus either variant_id or title+price', 'SHOPIFY_INVALID_ARGS');
          }
        }
        const body = await client.rest('POST', '/draft_orders', {
          body: { draft_order: { ...draftOrder, line_items: lineItems } },
          signal: exec.signal,
        });
        return { draft_order: body.draft_order };
      },
    },
    {
      name: 'shopify_update_draft_order',
      title: 'Update draft order',
      kind: 'write',
      description:
        'Updates an existing draft order by ID. draft_order is a JSON object with only the fields to change: status (open|invoice_sent|completed), customer, line_items, email, note, tags, currency, tax_exempt, taxes_included, customer_id, shipping_line, billing_address, shipping_address, use_customer_default_address, note_attributes, applied_discount, allow_discount_codes_in_checkout, b2b. Replace line_items wholesale (full array). Returns the updated draft_order.',
      parameters: {
        draft_order_id: { type: 'string', required: true, description: 'Numeric ID of the draft order to update (e.g. "1043239486").' },
        draft_order: { type: 'json', required: true, description: 'The draft_order body as a JSON object with the fields to change (see description). At least one field expected.' },
      },
      async execute(args, exec) {
        const draftOrder = asObject(args.draft_order);
        if (!draftOrder || typeof draftOrder !== 'object') {
          throw new ShopifyError('draft_order (JSON object) is required', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('PUT', `/draft_orders/${args.draft_order_id}`, {
          body: { draft_order: draftOrder },
          signal: exec.signal,
        });
        return { draft_order: body.draft_order };
      },
    },
    {
      name: 'shopify_delete_draft_order',
      title: 'Delete draft order',
      kind: 'write',
      description:
        'Permanently deletes a draft order by ID. Irreversible — confirm with the user before calling. A draft order that was already completed (converted to an order) cannot be deleted.',
      parameters: {
        draft_order_id: { type: 'string', required: true, description: 'Numeric ID of the draft order to delete (e.g. "1043239486").' },
      },
      async execute(args, exec) {
        await client.rest('DELETE', `/draft_orders/${args.draft_order_id}`, { signal: exec.signal });
        return { deleted: true, draft_order_id: args.draft_order_id };
      },
    },
    {
      name: 'shopify_complete_draft_order',
      title: 'Complete draft order',
      kind: 'write',
      description:
        'Completes a draft order, converting it into a real order. Set payment_pending=true when the customer will pay later (e.g. by invoice); otherwise the order is marked paid immediately. Cannot complete an already-completed draft order. Returns the completed draft_order.',
      parameters: {
        draft_order_id: { type: 'string', required: true, description: 'Numeric ID of the draft order to complete (e.g. "1043239486").' },
        payment_pending: { type: 'boolean', description: 'When true, completes the draft order without payment (customer pays later); when false/omitted, the order is marked paid.' },
      },
      async execute(args, exec) {
        const body = await client.rest('PUT', `/draft_orders/${args.draft_order_id}/complete`, {
          body: { draft_order: defined({ payment_pending: args.payment_pending }) },
          signal: exec.signal,
        });
        return { draft_order: body.draft_order };
      },
    },
    {
      name: 'shopify_send_draft_order_invoice',
      title: 'Send draft order invoice',
      kind: 'write',
      description:
        "Emails an invoice for a draft order to its customer. to defaults to the customer's email when omitted; from, bcc, subject, and custom_message are optional. The draft order must have a customer with an email address. Returns the draft_order_invoice record (with its id and the sent-to address).",
      parameters: {
        draft_order_id: { type: 'string', required: true, description: 'Numeric ID of the draft order to invoice (e.g. "1043239486").' },
        to: { type: 'string', description: "Email address to send the invoice to; defaults to the customer's email." },
        from: { type: 'string', description: 'Email address shown as the sender (must be a verified store email).' },
        bcc: { type: 'string', description: 'Email address to blind-copy on the invoice email.' },
        subject: { type: 'string', description: 'Subject line of the invoice email; defaults to a Shopify-generated subject.' },
        custom_message: { type: 'string', description: 'Custom message included in the invoice email body.' },
      },
      async execute(args, exec) {
        const body = await client.rest('POST', `/draft_orders/${args.draft_order_id}/send_invoice`, {
          body: {
            draft_order_invoice: defined({
              to: args.to,
              from: args.from,
              bcc: args.bcc,
              subject: args.subject,
              custom_message: args.custom_message,
            }),
          },
          signal: exec.signal,
        });
        return { draft_order_invoice: body.draft_order_invoice };
      },
    },
  ];
}

/**
 * Fulfillment tools: fulfillment orders, moves, holds, deadlines, fulfillments,
 * tracking, events, and fulfillment services.
 * @module @shopify/dsh-shopify/tools/fulfillments
 */

import { ShopifyError, defined, asArray } from '../util.js';

export function tools(ctx, deps) {
  const { client } = deps;
  return [
    {
      name: 'shopify_get_fulfillment_orders_for_order',
      title: 'Get fulfillment orders for order',
      kind: 'read',
      description:
        "Gets all fulfillment orders for a given order. Fulfillment orders are created when an order is placed — one per fulfillment location or fulfillment service. Use this FIRST to obtain the fulfillment_order_id values and line item ids needed by shopify_create_fulfillment, shopify_move_fulfillment_order, and shopify_apply_fulfillment_hold. Pass order_id as the numeric order id (e.g. '5483803250932'). include_financial_summaries adds payout/total financial info; include_order_reference_fields adds order-level fields to each fulfillment order.",
      parameters: {
        order_id: { type: 'string', required: true, description: "REQUIRED. Numeric order id (e.g. '5483803250932') whose fulfillment orders to fetch." },
        include_financial_summaries: { type: 'boolean', description: 'Whether to include financial summaries (payouts, totals, balances) on each fulfillment order.' },
        include_order_reference_fields: { type: 'boolean', description: 'Whether to include order reference fields (order-level details) on each fulfillment order.' },
      },
      async execute(args, exec) {
        if (!args.order_id) throw new ShopifyError('order_id is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('GET', `/orders/${args.order_id}/fulfillment_orders`, {
          query: defined({
            include_financial_summaries: args.include_financial_summaries,
            include_order_reference_fields: args.include_order_reference_fields,
          }),
          signal: exec.signal,
        });
        return { fulfillment_orders: body.fulfillment_orders ?? [] };
      },
    },
    {
      name: 'shopify_get_fulfillment_order',
      title: 'Get fulfillment order',
      kind: 'read',
      description:
        "Gets a single fulfillment order by id, including its line items, assigned location, status (open|in_progress|pending|submitted|closed|cancelled|on_hold), and any holds. fulfillment_order_id comes from shopify_get_fulfillment_orders_for_order.",
      parameters: {
        fulfillment_order_id: { type: 'string', required: true, description: "REQUIRED. Numeric fulfillment order id (e.g. '508865277') returned by shopify_get_fulfillment_orders_for_order." },
        include_financial_summaries: { type: 'boolean', description: 'Whether to include financial summaries (payouts, totals, balances) on the fulfillment order.' },
        include_order_reference_fields: { type: 'boolean', description: 'Whether to include order reference fields (order-level details) on the fulfillment order.' },
      },
      async execute(args, exec) {
        if (!args.fulfillment_order_id) throw new ShopifyError('fulfillment_order_id is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('GET', `/fulfillment_orders/${args.fulfillment_order_id}`, {
          query: defined({
            include_financial_summaries: args.include_financial_summaries,
            include_order_reference_fields: args.include_order_reference_fields,
          }),
          signal: exec.signal,
        });
        return { fulfillment_order: body.fulfillment_order };
      },
    },
    {
      name: 'shopify_get_fulfillment_order_locations_for_move',
      title: 'Get fulfillment order locations for move',
      kind: 'read',
      description:
        "Lists the locations a fulfillment order can be moved to (candidate destinations for relocation). fulfillment_order_id is required. Call this before shopify_move_fulfillment_order to pick a valid new_location_id — moving to a location not in this list fails.",
      parameters: {
        fulfillment_order_id: { type: 'string', required: true, description: "REQUIRED. Numeric fulfillment order id (e.g. '508865277')." },
      },
      async execute(args, exec) {
        if (!args.fulfillment_order_id) throw new ShopifyError('fulfillment_order_id is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('GET', `/fulfillment_orders/${args.fulfillment_order_id}/locations_for_move`, {
          signal: exec.signal,
        });
        return { locations_for_move: body.locations_for_move ?? [] };
      },
    },
    {
      name: 'shopify_move_fulfillment_order',
      title: 'Move fulfillment order',
      kind: 'write',
      description:
        "Moves a fulfillment order (or specific line items of it) to a new location. new_location_id (REQUIRED) must be one of the locations returned by shopify_get_fulfillment_order_locations_for_move. fulfillment_order_line_items optionally limits the move to specific line items as [{ id, quantity }] (line item ids from shopify_get_fulfillment_orders_for_order) — omit it to move the whole fulfillment order. Returns both the original fulfillment_order and the new moved_fulfillment_order.",
      parameters: {
        fulfillment_order_id: { type: 'string', required: true, description: "REQUIRED. Numeric fulfillment order id (e.g. '508865277')." },
        new_location_id: { type: 'string', required: true, description: "REQUIRED. Numeric id of the destination location — must be in the list from shopify_get_fulfillment_order_locations_for_move." },
        fulfillment_order_line_items: { type: 'array', items: { type: 'json' }, description: "Optional line items to move, as [{ id: <line_item_id>, quantity: <int> }]. Omit to move the whole fulfillment order." },
      },
      async execute(args, exec) {
        if (!args.fulfillment_order_id) throw new ShopifyError('fulfillment_order_id is required', 'SHOPIFY_INVALID_ARGS');
        if (!args.new_location_id) throw new ShopifyError('new_location_id is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('POST', `/fulfillment_orders/${args.fulfillment_order_id}/move`, {
          body: {
            move: defined({
              new_location_id: args.new_location_id,
              fulfillment_order_line_items: asArray(args.fulfillment_order_line_items),
            }),
          },
          signal: exec.signal,
        });
        return {
          fulfillment_order: body.fulfillment_order,
          moved_fulfillment_order: body.moved_fulfillment_order,
        };
      },
    },
    {
      name: 'shopify_apply_fulfillment_hold',
      title: 'Apply fulfillment hold',
      kind: 'write',
      description:
        "Applies a fulfillment hold to a fulfillment order (e.g. awaiting payment or a fraud review), pausing fulfillment until released. reason is REQUIRED, one of: awaiting_payment, high_risk_of_fraud, incorrect_address, inventory_out_of_stock, other. reason_notes is free-form merchant-facing context shown on the hold; notify_merchant emails the merchant about the hold. Use shopify_release_fulfillment_hold to lift it.",
      parameters: {
        fulfillment_order_id: { type: 'string', required: true, description: "REQUIRED. Numeric fulfillment order id (e.g. '508865277')." },
        reason: { type: 'string', required: true, enum: ['awaiting_payment', 'high_risk_of_fraud', 'incorrect_address', 'inventory_out_of_stock', 'other'], description: 'REQUIRED. Reason for the hold.' },
        reason_notes: { type: 'string', description: 'Optional free-form notes explaining the hold (shown to merchants).' },
        notify_merchant: { type: 'boolean', description: 'Whether to email the merchant about the hold.' },
      },
      async execute(args, exec) {
        if (!args.fulfillment_order_id) throw new ShopifyError('fulfillment_order_id is required', 'SHOPIFY_INVALID_ARGS');
        if (!args.reason) throw new ShopifyError('reason is required (awaiting_payment, high_risk_of_fraud, incorrect_address, inventory_out_of_stock, or other)', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('POST', `/fulfillment_orders/${args.fulfillment_order_id}/hold`, {
          body: {
            fulfillment_hold: defined({
              reason: args.reason,
              reason_notes: args.reason_notes,
              notify_merchant: args.notify_merchant,
            }),
          },
          signal: exec.signal,
        });
        return { fulfillment_order: body.fulfillment_order };
      },
    },
    {
      name: 'shopify_release_fulfillment_hold',
      title: 'Release fulfillment hold',
      kind: 'write',
      description:
        "Releases (removes) the fulfillment hold on a fulfillment order so it can be fulfilled again. fulfillment_order_id is required. Returns the fulfillment order with its holds cleared (status back to open).",
      parameters: {
        fulfillment_order_id: { type: 'string', required: true, description: "REQUIRED. Numeric fulfillment order id that currently has a hold (e.g. '508865277')." },
      },
      async execute(args, exec) {
        if (!args.fulfillment_order_id) throw new ShopifyError('fulfillment_order_id is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('POST', `/fulfillment_orders/${args.fulfillment_order_id}/release_hold`, {
          signal: exec.signal,
        });
        return { fulfillment_order: body.fulfillment_order };
      },
    },
    {
      name: 'shopify_set_fulfillment_orders_deadline',
      title: 'Set fulfillment orders deadline',
      kind: 'write',
      description:
        "Sets a fulfillment deadline on one or more fulfillment orders. fulfillment_deadline (REQUIRED) is an ISO 8601 datetime, e.g. '2025-02-01T18:00:00-05:00' — pass the shop's timezone offset (get it from shopify_get_shop_details iana_timezone) so the deadline lands at the intended local time. fulfillment_order_ids (REQUIRED) is an array of numeric fulfillment order ids.",
      parameters: {
        fulfillment_deadline: { type: 'string', required: true, description: "REQUIRED. ISO 8601 datetime by which the fulfillment orders must be fulfilled (e.g. '2025-02-01T18:00:00-05:00')." },
        fulfillment_order_ids: { type: 'array', items: { type: 'string' }, required: true, description: 'REQUIRED. Array of numeric fulfillment order ids to apply the deadline to.' },
      },
      async execute(args, exec) {
        if (!args.fulfillment_deadline) throw new ShopifyError('fulfillment_deadline is required (ISO 8601)', 'SHOPIFY_INVALID_ARGS');
        if (!args.fulfillment_order_ids) throw new ShopifyError('fulfillment_order_ids is required (array)', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('POST', '/fulfillment_orders/deadline', {
          body: {
            fulfillment_orders_deadline: defined({
              fulfillment_deadline: args.fulfillment_deadline,
              fulfillment_order_ids: asArray(args.fulfillment_order_ids),
            }),
          },
          signal: exec.signal,
        });
        return { fulfillment_order_deadline: body.fulfillment_order_deadline };
      },
    },
    {
      name: 'shopify_create_fulfillment',
      title: 'Create fulfillment',
      kind: 'write',
      description:
        "Creates a fulfillment for an order's fulfillment order. FIRST call shopify_get_fulfillment_orders_for_order to obtain the fulfillment_order_id and line item ids, then pass line_items_by_fulfillment_order as [{ fulfillment_order_id, fulfillment_order_line_items: [{ id, quantity }] }] (REQUIRED). Tracking can be passed via tracking_company/tracking_number/tracking_url, with tracking_notify_customer to email the customer the tracking number. notify_customer controls the fulfillment confirmation email; message is an optional note to the customer; origin_address (json, e.g. { name, address1, city, province, country, zip }) overrides the shipment origin. Returns the created fulfillment.",
      parameters: {
        line_items_by_fulfillment_order: { type: 'array', items: { type: 'json' }, required: true, description: "REQUIRED. Array of [{ fulfillment_order_id, fulfillment_order_line_items: [{ id, quantity }] }] — ids come from shopify_get_fulfillment_orders_for_order." },
        notify_customer: { type: 'boolean', description: 'Whether to email the customer the fulfillment confirmation (and tracking if provided).' },
        tracking_company: { type: 'string', description: 'Carrier name for the tracking info (e.g. "UPS").' },
        tracking_number: { type: 'string', description: 'Tracking number for the shipment.' },
        tracking_url: { type: 'string', description: 'Public URL where the customer can track the shipment.' },
        tracking_notify_customer: { type: 'boolean', description: 'Whether to email the customer the tracking number specifically.' },
        message: { type: 'string', description: 'Optional custom message included in the fulfillment notification.' },
        origin_address: { type: 'json', description: "Optional shipment origin override as { name, company?, address1, address2?, city, province, country, zip, phone? }." },
      },
      async execute(args, exec) {
        const lineItems = asArray(args.line_items_by_fulfillment_order);
        if (!lineItems || lineItems.length === 0) throw new ShopifyError('line_items_by_fulfillment_order is required (non-empty array)', 'SHOPIFY_INVALID_ARGS');
        const trackingInfo = defined({
          company: args.tracking_company,
          number: args.tracking_number,
          url: args.tracking_url,
          notify_customer: args.tracking_notify_customer,
        });
        const body = await client.rest('POST', '/fulfillments', {
          body: {
            fulfillment: defined({
              line_items_by_fulfillment_order: lineItems,
              notify_customer: args.notify_customer,
              tracking_info: Object.keys(trackingInfo).length > 0 ? trackingInfo : undefined,
              message: args.message,
              origin_address: args.origin_address,
            }),
          },
          signal: exec.signal,
        });
        return { fulfillment: body.fulfillment };
      },
    },
    {
      name: 'shopify_cancel_fulfillment',
      title: 'Cancel fulfillment',
      kind: 'write',
      description:
        "Cancels a fulfillment by id. Only fulfillments with status 'pending' or 'open' can be cancelled (e.g. before the carrier picks up); submitted/closed fulfillments cannot. Returns the cancelled fulfillment with status 'cancelled'.",
      parameters: {
        fulfillment_id: { type: 'string', required: true, description: "REQUIRED. Numeric fulfillment id (e.g. '490556752658')." },
      },
      async execute(args, exec) {
        if (!args.fulfillment_id) throw new ShopifyError('fulfillment_id is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('POST', `/fulfillments/${args.fulfillment_id}/cancel`, {
          signal: exec.signal,
        });
        return { fulfillment: body.fulfillment };
      },
    },
    {
      name: 'shopify_update_fulfillment_tracking',
      title: 'Update fulfillment tracking',
      kind: 'write',
      description:
        "Updates the tracking information on an existing fulfillment by id (e.g. after the carrier generates a tracking number). Provide at least one of tracking_company, tracking_number, tracking_url, or tracking_notify_customer (typically company + number). tracking_notify_customer emails the customer the tracking number. Returns the updated fulfillment.",
      parameters: {
        fulfillment_id: { type: 'string', required: true, description: "REQUIRED. Numeric fulfillment id (e.g. '490556752658')." },
        tracking_company: { type: 'string', description: 'Carrier name for the tracking info (e.g. "UPS").' },
        tracking_number: { type: 'string', description: 'Tracking number for the shipment.' },
        tracking_url: { type: 'string', description: 'Public URL where the customer can track the shipment.' },
        tracking_notify_customer: { type: 'boolean', description: 'Whether to email the customer the tracking number.' },
      },
      async execute(args, exec) {
        if (!args.fulfillment_id) throw new ShopifyError('fulfillment_id is required', 'SHOPIFY_INVALID_ARGS');
        const trackingInfo = defined({
          company: args.tracking_company,
          number: args.tracking_number,
          url: args.tracking_url,
          notify_customer: args.tracking_notify_customer,
        });
        if (Object.keys(trackingInfo).length === 0) {
          throw new ShopifyError('at least one of tracking_company, tracking_number, tracking_url, or tracking_notify_customer is required', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('POST', `/fulfillments/${args.fulfillment_id}/update_tracking`, {
          body: { fulfillment: { tracking_info: trackingInfo } },
          signal: exec.signal,
        });
        return { fulfillment: body.fulfillment };
      },
    },
    {
      name: 'shopify_list_order_fulfillments',
      title: 'List order fulfillments',
      kind: 'read',
      description:
        "Lists all fulfillments for an order. order_id is required (numeric id). Supports limit (1-250), since_id, fields (comma-separated), and created_at_min/max, updated_at_min/max ISO 8601 date-range filters. Returns items, count, and next_page_info — loop with page_info until it is null.",
      parameters: {
        order_id: { type: 'string', required: true, description: "REQUIRED. Numeric order id (e.g. '5483803250932')." },
        limit: { type: 'integer', description: 'Maximum number of fulfillments to return (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only fulfillments with id greater than this value.' },
        fields: { type: 'string', description: 'Comma-separated list of fields to include in the response (e.g. "id,status,tracking_company").' },
        created_at_min: { type: 'string', description: 'ISO 8601 datetime — return fulfillments created at or after this time.' },
        created_at_max: { type: 'string', description: 'ISO 8601 datetime — return fulfillments created at or before this time.' },
        updated_at_min: { type: 'string', description: 'ISO 8601 datetime — return fulfillments updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 datetime — return fulfillments updated at or before this time.' },
      },
      async execute(args, exec) {
        if (!args.order_id) throw new ShopifyError('order_id is required', 'SHOPIFY_INVALID_ARGS');
        const { items, next_page_info } = await client.list(`/orders/${args.order_id}/fulfillments`, defined({
          limit: args.limit,
          since_id: args.since_id,
          fields: args.fields,
          created_at_min: args.created_at_min,
          created_at_max: args.created_at_max,
          updated_at_min: args.updated_at_min,
          updated_at_max: args.updated_at_max,
        }));
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_fulfillment',
      title: 'Get fulfillment',
      kind: 'read',
      description:
        "Gets a single fulfillment by order_id and fulfillment_id (both numeric ids required). fields (comma-separated) optionally restricts the returned attributes, e.g. 'id,status,tracking_company,tracking_number'. Returns the fulfillment under the 'fulfillment' key.",
      parameters: {
        order_id: { type: 'string', required: true, description: "REQUIRED. Numeric order id that owns the fulfillment (e.g. '5483803250932')." },
        fulfillment_id: { type: 'string', required: true, description: "REQUIRED. Numeric fulfillment id (e.g. '490556752658')." },
        fields: { type: 'string', description: 'Comma-separated list of fields to include in the response.' },
      },
      async execute(args, exec) {
        if (!args.order_id) throw new ShopifyError('order_id is required', 'SHOPIFY_INVALID_ARGS');
        if (!args.fulfillment_id) throw new ShopifyError('fulfillment_id is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('GET', `/orders/${args.order_id}/fulfillments/${args.fulfillment_id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { fulfillment: body.fulfillment };
      },
    },
    {
      name: 'shopify_list_fulfillment_events',
      title: 'List fulfillment events',
      kind: 'read',
      description:
        "Lists all fulfillment events (status history: label_printed, in_transit, delivered, etc.) for a fulfillment. order_id and fulfillment_id are required (numeric ids). Use shopify_create_fulfillment_event to append new events.",
      parameters: {
        order_id: { type: 'string', required: true, description: "REQUIRED. Numeric order id that owns the fulfillment (e.g. '5483803250932')." },
        fulfillment_id: { type: 'string', required: true, description: "REQUIRED. Numeric fulfillment id (e.g. '490556752658')." },
      },
      async execute(args, exec) {
        if (!args.order_id) throw new ShopifyError('order_id is required', 'SHOPIFY_INVALID_ARGS');
        if (!args.fulfillment_id) throw new ShopifyError('fulfillment_id is required', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('GET', `/orders/${args.order_id}/fulfillments/${args.fulfillment_id}/events`, {
          signal: exec.signal,
        });
        return { fulfillment_events: body.fulfillment_events ?? [] };
      },
    },
    {
      name: 'shopify_create_fulfillment_event',
      title: 'Create fulfillment event',
      kind: 'write',
      description:
        "Creates a fulfillment event on a fulfillment, e.g. marking it in_transit or delivered. status is REQUIRED, one of: attempted_delivery, carrier_picked_up, confirmed, delayed, delivered, failure, in_transit, label_printed, label_purchased, out_for_delivery, ready_for_pickup. Optionally add message, happened_at (ISO 8601 datetime), and location fields (city, province, country, zip, address1, latitude, longitude). Returns the created fulfillment_event.",
      parameters: {
        order_id: { type: 'string', required: true, description: "REQUIRED. Numeric order id that owns the fulfillment (e.g. '5483803250932')." },
        fulfillment_id: { type: 'string', required: true, description: "REQUIRED. Numeric fulfillment id (e.g. '490556752658')." },
        status: { type: 'string', required: true, enum: ['attempted_delivery', 'carrier_picked_up', 'confirmed', 'delayed', 'delivered', 'failure', 'in_transit', 'label_printed', 'label_purchased', 'out_for_delivery', 'ready_for_pickup'], description: 'REQUIRED. New status of the fulfillment.' },
        message: { type: 'string', description: 'Optional message describing the event.' },
        city: { type: 'string', description: 'City where the event occurred.' },
        province: { type: 'string', description: 'Province/state where the event occurred.' },
        country: { type: 'string', description: 'Country where the event occurred.' },
        zip: { type: 'string', description: 'Postal/zip code where the event occurred.' },
        address1: { type: 'string', description: 'Street address where the event occurred.' },
        latitude: { type: 'number', description: 'Latitude of the event location (decimal degrees).' },
        longitude: { type: 'number', description: 'Longitude of the event location (decimal degrees).' },
        happened_at: { type: 'string', description: 'ISO 8601 datetime the event happened (defaults to now if omitted).' },
      },
      async execute(args, exec) {
        if (!args.order_id) throw new ShopifyError('order_id is required', 'SHOPIFY_INVALID_ARGS');
        if (!args.fulfillment_id) throw new ShopifyError('fulfillment_id is required', 'SHOPIFY_INVALID_ARGS');
        if (!args.status) throw new ShopifyError('status is required (attempted_delivery, carrier_picked_up, confirmed, delayed, delivered, failure, in_transit, label_printed, label_purchased, out_for_delivery, or ready_for_pickup)', 'SHOPIFY_INVALID_ARGS');
        const body = await client.rest('POST', `/orders/${args.order_id}/fulfillments/${args.fulfillment_id}/events`, {
          body: {
            event: defined({
              status: args.status,
              message: args.message,
              city: args.city,
              province: args.province,
              country: args.country,
              zip: args.zip,
              address1: args.address1,
              latitude: args.latitude,
              longitude: args.longitude,
              happened_at: args.happened_at,
            }),
          },
          signal: exec.signal,
        });
        return { fulfillment_event: body.fulfillment_event };
      },
    },
    {
      name: 'shopify_list_fulfillment_services',
      title: 'List fulfillment services',
      kind: 'read',
      description:
        "Lists the fulfillment services on the shop (third-party fulfillment providers or the app's own service). scope: 'current_client' (only services created by the current app — default) or 'all' (every fulfillment service). Returns the array under 'fulfillment_services'.",
      parameters: {
        scope: { type: 'string', enum: ['current_client', 'all'], description: "Which fulfillment services to return: 'current_client' (default) or 'all'." },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', '/fulfillment_services', {
          query: defined({ scope: args.scope }),
          signal: exec.signal,
        });
        return { fulfillment_services: body.fulfillment_services ?? [] };
      },
    },
  ];
}

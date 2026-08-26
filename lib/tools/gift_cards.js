/**
 * Gift card tools: list, get, create, update, disable, and search.
 * @module @shopify/dsh-shopify/tools/gift_cards
 */

import { defined } from '../util.js';

export function tools(ctx, deps) {
  const { client } = deps;
  return [
    {
      name: 'shopify_list_gift_cards',
      title: 'List gift cards',
      kind: 'read',
      description:
        "Lists gift cards, optionally filtered by status (enabled|disabled). Gift card IDs are numeric strings. Note: codes are masked in list responses (only the last 4 characters show) — the full code is returned only at creation via shopify_create_gift_card. Paginate with next_page_info -> page_info.",
      parameters: {
        limit: { type: 'integer', description: 'Maximum number of gift cards to return (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only gift cards with id greater than this ID.' },
        fields: { type: 'string', description: 'Comma-separated list of fields to include, e.g. "id,balance,status".' },
        status: { type: 'string', enum: ['enabled', 'disabled'], description: 'Filter by gift card status.' },
      },
      async execute(args, exec) {
        const query = defined({ limit: args.limit, since_id: args.since_id, fields: args.fields, status: args.status });
        const { items, next_page_info } = await client.list('/gift_cards', query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_gift_card',
      title: 'Get gift card',
      kind: 'read',
      description:
        'Gets a single gift card by its numeric ID (string or integer accepted): balance, initial_value, status, expires_on, customer_id, currency, and the masked code (last 4 chars only — the FULL code is visible only in the shopify_create_gift_card response, so store it there).',
      parameters: {
        gift_card_id: { type: 'string', required: true, description: 'Numeric gift card ID (string or integer).' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/gift_cards/${args.gift_card_id}`, { signal: exec.signal });
        return { gift_card: body.gift_card };
      },
    },
    {
      name: 'shopify_create_gift_card',
      title: 'Create gift card',
      kind: 'write',
      description:
        "Creates a gift card. REQUIRED: initial_value (positive decimal string, e.g. '25.00'). Optional: note, expires_on (ISO 8601 date), template_suffix, customer_id (numeric), currency (ISO 4217, defaults to shop currency). IMPORTANT: the FULL gift card code is returned ONLY in this response — save it immediately; later reads show only the masked code. The card is enabled by default.",
      parameters: {
        initial_value: { type: 'string', required: true, description: "Initial value as a positive decimal string, e.g. '25.00'." },
        note: { type: 'string', description: 'Optional note attached to the gift card.' },
        expires_on: { type: 'string', description: 'Expiry date, ISO 8601 (date or datetime), e.g. 2026-01-01.' },
        template_suffix: { type: 'string', description: 'Suffix of the gift card page template, e.g. "birthday".' },
        customer_id: { type: 'string', description: 'Numeric customer ID to assign the gift card to (string or integer).' },
        currency: { type: 'string', description: 'ISO 4217 currency code, e.g. "USD"; defaults to the shop currency.' },
      },
      async execute(args, exec) {
        const gift_card = defined({
          initial_value: args.initial_value,
          note: args.note,
          expires_on: args.expires_on,
          template_suffix: args.template_suffix,
          customer_id: args.customer_id,
          currency: args.currency,
        });
        const body = await client.rest('POST', '/gift_cards', { body: { gift_card }, signal: exec.signal });
        return { gift_card: body.gift_card };
      },
    },
    {
      name: 'shopify_update_gift_card',
      title: 'Update gift card',
      kind: 'write',
      description:
        "Updates a gift card: expires_on, note, template_suffix, and customer_id only. The balance and initial_value are NOT modifiable — they can only change through orders/refunds. Pass only the fields you want to change. Disabling is a separate operation (shopify_disable_gift_card).",
      parameters: {
        gift_card_id: { type: 'string', required: true, description: 'Numeric gift card ID (string or integer).' },
        expires_on: { type: 'string', description: 'New expiry date, ISO 8601.' },
        note: { type: 'string', description: 'New note for the gift card.' },
        template_suffix: { type: 'string', description: 'New gift card page template suffix.' },
        customer_id: { type: 'string', description: 'New numeric customer ID (string or integer).' },
      },
      async execute(args, exec) {
        const gift_card = defined({
          expires_on: args.expires_on,
          note: args.note,
          template_suffix: args.template_suffix,
          customer_id: args.customer_id,
        });
        const body = await client.rest('PUT', `/gift_cards/${args.gift_card_id}`, {
          body: { gift_card },
          signal: exec.signal,
        });
        return { gift_card: body.gift_card };
      },
    },
    {
      name: 'shopify_disable_gift_card',
      title: 'Disable gift card',
      kind: 'write',
      description:
        'Disables a gift card by its numeric ID (POST /gift_cards/{id}/disable). IRREVERSIBLE: once disabled, a gift card cannot be re-enabled and its remaining balance can never be spent. Use only after explicit user confirmation.',
      parameters: {
        gift_card_id: { type: 'string', required: true, description: 'Numeric gift card ID (string or integer) to disable.' },
      },
      async execute(args, exec) {
        const body = await client.rest('POST', `/gift_cards/${args.gift_card_id}/disable`, { signal: exec.signal });
        return { gift_card: body.gift_card };
      },
    },
    {
      name: 'shopify_search_gift_cards',
      title: 'Search gift cards',
      kind: 'read',
      description:
        "Searches gift cards with Shopify search syntax in query (REQUIRED), e.g. 'last_characters:abcd' (match by the last 4 code characters) or 'customer_id:123'. Supports limit, fields, order (e.g. 'created_at DESC'), page_info, and created_at/updated_at date bounds. Codes stay masked in results. Paginate with next_page_info -> page_info.",
      parameters: {
        query: { type: 'string', required: true, description: "Shopify search query, e.g. 'last_characters:abcd' or 'customer_id:123'." },
        limit: { type: 'integer', description: 'Maximum number of gift cards to return (1-250, default 50).' },
        fields: { type: 'string', description: 'Comma-separated list of fields to include, e.g. "id,balance,status".' },
        order: { type: 'string', description: 'Sort order, e.g. "created_at DESC".' },
        page_info: { type: 'string', description: "Cursor from a previous response's next_page_info to fetch the next page." },
        created_at_min: { type: 'string', description: 'ISO 8601 lower bound on created_at.' },
        created_at_max: { type: 'string', description: 'ISO 8601 upper bound on created_at.' },
        updated_at_min: { type: 'string', description: 'ISO 8601 lower bound on updated_at.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 upper bound on updated_at.' },
      },
      async execute(args, exec) {
        const query = defined({
          query: args.query,
          limit: args.limit,
          fields: args.fields,
          order: args.order,
          page_info: args.page_info,
          created_at_min: args.created_at_min,
          created_at_max: args.created_at_max,
          updated_at_min: args.updated_at_min,
          updated_at_max: args.updated_at_max,
        });
        const { items, next_page_info } = await client.list('/gift_cards/search', query);
        return { items, count: items.length, next_page_info };
      },
    },
  ];
}

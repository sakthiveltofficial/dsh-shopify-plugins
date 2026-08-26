/**
 * Marketing tools: list, get, create, update, delete marketing events, and
 * create marketing engagements for an event.
 * @module @shopify/dsh-shopify/tools/marketing
 */

import { defined } from '../util.js';

export function tools(ctx, deps) {
  const { client } = deps;
  return [
    {
      name: 'shopify_list_marketing_events',
      title: 'List marketing events',
      kind: 'read',
      description:
        "Lists marketing events recorded for the shop (ad campaigns, posts, email sends, etc.). Marketing event IDs are numeric strings. Paginate with next_page_info -> page_info when more results exist.",
      parameters: {
        limit: { type: 'integer', description: 'Maximum number of marketing events to return (1-250, default 50).' },
      },
      async execute(args, exec) {
        const { items, next_page_info } = await client.list('/marketing_events', defined({ limit: args.limit }));
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_marketing_event',
      title: 'Get marketing event',
      kind: 'read',
      description:
        'Gets a single marketing event by its numeric ID (string or integer accepted): event_type, marketing_channel, budget, started_at/ended_at, remote_id, utm parameters, and marketed_resources.',
      parameters: {
        marketing_event_id: { type: 'string', required: true, description: 'Numeric marketing event ID (string or integer).' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/marketing_events/${args.marketing_event_id}`, { signal: exec.signal });
        return { marketing_event: body.marketing_event };
      },
    },
    {
      name: 'shopify_create_marketing_event',
      title: 'Create marketing event',
      kind: 'write',
      description:
        'Creates a marketing event (e.g. an ad campaign, social post, or email blast) so analytics link store activity to the channel. REQUIRED: event_type (ad|post|message|retargeting|transactional|affiliate|loyalty|newsletter|abandoned_cart), marketing_channel (search|display|social|email|referral|chat|receipt), and started_at (ISO 8601). budget is a decimal string with currency (e.g. "19.99", "USD"); budget_type is daily or lifetime. paid marks paid media; utm_* and marketed_resources (array of { id, type }) tie the event to products/collections. Returns the created event including its numeric id.',
      parameters: {
        event_type: {
          type: 'string',
          required: true,
          enum: ['ad', 'post', 'message', 'retargeting', 'transactional', 'affiliate', 'loyalty', 'newsletter', 'abandoned_cart'],
          description: 'Type of marketing event.',
        },
        marketing_channel: {
          type: 'string',
          required: true,
          enum: ['search', 'display', 'social', 'email', 'referral', 'chat', 'receipt'],
          description: 'Channel the event ran on.',
        },
        started_at: { type: 'string', required: true, description: 'Start time, ISO 8601, e.g. 2025-01-15T10:00:00-05:00.' },
        budget: { type: 'string', description: 'Budget amount as a decimal string, e.g. "19.99".' },
        currency: { type: 'string', description: 'ISO 4217 currency code for budget, e.g. "USD".' },
        budget_type: { type: 'string', enum: ['daily', 'lifetime'], description: 'daily or lifetime budget.' },
        ended_at: { type: 'string', description: 'End time, ISO 8601.' },
        scheduled_to_end_at: { type: 'string', description: 'Scheduled end time, ISO 8601.' },
        description: { type: 'string', description: 'Human-readable description of the event.' },
        remote_id: { type: 'string', description: 'ID of the event in the external marketing platform (e.g. the ad platform campaign ID).' },
        paid: { type: 'boolean', description: 'True when this is a paid media event.' },
        referring_domain: { type: 'string', description: 'Domain that referred traffic for this event.' },
        utm_campaign: { type: 'string', description: 'UTM campaign parameter.' },
        utm_source: { type: 'string', description: 'UTM source parameter.' },
        utm_medium: { type: 'string', description: 'UTM medium parameter.' },
        preview_url: { type: 'string', description: 'URL where the event can be previewed.' },
        manage_url: { type: 'string', description: 'URL where the event can be managed.' },
        marketed_resources: { type: 'json', description: 'JSON array of marketed resources, e.g. [{"id": 123, "type": "product"}] or [{"id": 456, "type": "collection"}].' },
      },
      async execute(args, exec) {
        const marketing_event = defined({
          event_type: args.event_type,
          marketing_channel: args.marketing_channel,
          started_at: args.started_at,
          budget: args.budget,
          currency: args.currency,
          budget_type: args.budget_type,
          ended_at: args.ended_at,
          scheduled_to_end_at: args.scheduled_to_end_at,
          description: args.description,
          remote_id: args.remote_id,
          paid: args.paid,
          referring_domain: args.referring_domain,
          utm_campaign: args.utm_campaign,
          utm_source: args.utm_source,
          utm_medium: args.utm_medium,
          preview_url: args.preview_url,
          manage_url: args.manage_url,
          marketed_resources: args.marketed_resources,
        });
        const body = await client.rest('POST', '/marketing_events', { body: { marketing_event }, signal: exec.signal });
        return { marketing_event: body.marketing_event };
      },
    },
    {
      name: 'shopify_update_marketing_event',
      title: 'Update marketing event',
      kind: 'write',
      description:
        'Updates a marketing event. ONLY these fields are updatable: remote_id, budget, currency, budget_type, started_at, ended_at, scheduled_to_end_at — all other fields (event_type, marketing_channel, utm_*, paid, ...) are read-only after creation and will be rejected. Pass only the fields you want to change.',
      parameters: {
        marketing_event_id: { type: 'string', required: true, description: 'Numeric marketing event ID (string or integer).' },
        remote_id: { type: 'string', description: 'ID of the event in the external marketing platform.' },
        budget: { type: 'string', description: 'Budget amount as a decimal string, e.g. "19.99".' },
        currency: { type: 'string', description: 'ISO 4217 currency code for budget, e.g. "USD".' },
        budget_type: { type: 'string', enum: ['daily', 'lifetime'], description: 'daily or lifetime budget.' },
        started_at: { type: 'string', description: 'Start time, ISO 8601.' },
        ended_at: { type: 'string', description: 'End time, ISO 8601.' },
        scheduled_to_end_at: { type: 'string', description: 'Scheduled end time, ISO 8601.' },
      },
      async execute(args, exec) {
        const marketing_event = defined({
          remote_id: args.remote_id,
          budget: args.budget,
          currency: args.currency,
          budget_type: args.budget_type,
          started_at: args.started_at,
          ended_at: args.ended_at,
          scheduled_to_end_at: args.scheduled_to_end_at,
        });
        const body = await client.rest('PUT', `/marketing_events/${args.marketing_event_id}`, {
          body: { marketing_event },
          signal: exec.signal,
        });
        return { marketing_event: body.marketing_event };
      },
    },
    {
      name: 'shopify_delete_marketing_event',
      title: 'Delete marketing event',
      kind: 'write',
      description:
        'Deletes a marketing event by its numeric ID. Irreversible — removes the event and its analytics link from the shop. Confirm with the user before deleting.',
      parameters: {
        marketing_event_id: { type: 'string', required: true, description: 'Numeric marketing event ID (string or integer) to delete.' },
      },
      async execute(args, exec) {
        await client.rest('DELETE', `/marketing_events/${args.marketing_event_id}`, { signal: exec.signal });
        return { deleted: true, marketing_event_id: args.marketing_event_id };
      },
    },
    {
      name: 'shopify_create_marketing_engagements',
      title: 'Create marketing engagements',
      kind: 'write',
      description:
        "Records engagements (interactions) for an existing marketing event — REQUIRED: marketing_event_id and engagements, an array of engagement objects, e.g. [{\"occurred_on\": \"2025-01-15\", \"engagement_type\": \"click\", \"total_count\": 42, \"paid_count\": 10}]. engagement_type values include click, impression, like, comment, share, video_views, and more. Returns the engagements as stored.",
      parameters: {
        marketing_event_id: { type: 'string', required: true, description: 'Numeric marketing event ID (string or integer) to attach engagements to.' },
        engagements: {
          type: 'array',
          required: true,
          items: { type: 'json' },
          description: 'Array of engagement objects, e.g. [{"occurred_on": "2025-01-15", "engagement_type": "click", "total_count": 42, "paid_count": 10}].',
        },
      },
      async execute(args, exec) {
        const engagements = args.engagements;
        const body = await client.rest('POST', `/marketing_events/${args.marketing_event_id}/engagements`, {
          body: { engagements },
          signal: exec.signal,
        });
        return { engagements: body.engagements ?? engagements };
      },
    },
  ];
}

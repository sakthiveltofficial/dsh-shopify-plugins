/**
 * Webhook tools: list, get, create, update, delete, count, and a GraphQL
 * preset tool for webhookSubscription queries.
 * @module @shopify/dsh-shopify/tools/webhooks
 */

import { ShopifyError, asObject, defined } from '../util.js';

const LIST_DOCUMENT = `query($first: Int, $after: String, $query: String, $sortKey: WebhookSubscriptionSortKeys, $reverse: Boolean) { webhookSubscriptions(first: $first, after: $after, query: $query, sortKey: $sortKey, reverse: $reverse) { edges { cursor node { id topic endpoint { ... on WebhookHttpEndpoint { callbackUrl } ... on WebhookEventBridgeEndpoint { arn } ... on WebhookPubSubEndpoint { pubSubProject pubSubTopic } } format } } pageInfo { hasNextPage endCursor } } }`;

const GET_DOCUMENT = `query($id: ID!) { webhookSubscription(id: $id) { id topic format } }`;

const COUNT_DOCUMENT = `query($query: String) { webhookSubscriptionsCount(query: $query) { count precision } }`;

export function tools(ctx, deps) {
  const { client } = deps;
  return [
    {
      name: 'shopify_list_webhook_subscriptions',
      title: 'List webhook subscriptions',
      kind: 'read',
      description:
        "Lists webhook subscriptions registered for the shop. Filter by topic (e.g. 'orders/create', 'products/update') and/or delivery address (HTTPS URL, pubsub://project:topic, or AWS EventBridge ARN). Webhook IDs are numeric strings — pass them straight to shopify_get_webhook_subscription / shopify_update_webhook_subscription / shopify_delete_webhook_subscription. Paginate with next_page_info -> page_info (cursor pagination; only limit may accompany page_info).",
      parameters: {
        topic: { type: 'string', description: "Filter by topic, e.g. 'orders/create', 'products/update'." },
        address: { type: 'string', description: 'Filter by delivery address: HTTPS URL, pubsub://project:topic, or AWS EventBridge ARN.' },
        limit: { type: 'integer', description: 'Maximum number of webhooks to return (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only webhooks with id greater than this ID.' },
        fields: { type: 'string', description: 'Comma-separated list of fields to include in each webhook, e.g. "id,topic,address,format".' },
        created_at_min: { type: 'string', description: 'ISO 8601 lower bound on created_at (shop local time).' },
        created_at_max: { type: 'string', description: 'ISO 8601 upper bound on created_at (shop local time).' },
        updated_at_min: { type: 'string', description: 'ISO 8601 lower bound on updated_at (shop local time).' },
        updated_at_max: { type: 'string', description: 'ISO 8601 upper bound on updated_at (shop local time).' },
        page_info: { type: 'string', description: "Cursor from a previous response's next_page_info to fetch the next page; only limit may accompany it." },
      },
      async execute(args, exec) {
        const query = defined({
          topic: args.topic,
          address: args.address,
          limit: args.limit,
          since_id: args.since_id,
          fields: args.fields,
          created_at_min: args.created_at_min,
          created_at_max: args.created_at_max,
          updated_at_min: args.updated_at_min,
          updated_at_max: args.updated_at_max,
          page_info: args.page_info,
        });
        const { items, next_page_info } = await client.list('/webhooks', query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_webhook_subscription',
      title: 'Get webhook subscription',
      kind: 'read',
      description:
        'Gets a single webhook subscription by its numeric ID (string or integer accepted). Useful to confirm delivery details (address, format, selected fields) before updating or deleting it.',
      parameters: {
        webhook_id: { type: 'string', required: true, description: 'Numeric webhook subscription ID (string or integer).' },
        fields: { type: 'string', description: 'Comma-separated list of fields to include, e.g. "id,topic,address,format".' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/webhooks/${args.webhook_id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { webhook: body.webhook };
      },
    },
    {
      name: 'shopify_create_webhook_subscription',
      title: 'Create webhook subscription',
      kind: 'write',
      description:
        "Registers a webhook subscription: Shopify POSTs the event payload to the address whenever the topic fires. REQUIRED: topic (e.g. 'orders/create', 'app/uninstalled') and address — an HTTPS callback URL, pubsub://project:topic, or an AWS EventBridge ARN. format is 'json' (default) or 'xml'; fields limits the payload to the listed field names; metafield_namespaces includes those metafields. Keep the returned webhook id to update/delete later.",
      parameters: {
        topic: { type: 'string', required: true, description: "Event topic to subscribe to, e.g. 'orders/create', 'products/update', 'app/uninstalled'." },
        address: { type: 'string', required: true, description: 'Delivery address: HTTPS callback URL, pubsub://project:topic, or AWS EventBridge ARN.' },
        format: { type: 'string', enum: ['json', 'xml'], description: 'Payload format (default json).' },
        fields: { type: 'array', items: { type: 'string' }, description: 'List of field names to include in the payload (empty/omitted = all fields).' },
        metafield_namespaces: { type: 'array', items: { type: 'string' }, description: 'List of metafield namespaces to include in the payload.' },
      },
      async execute(args, exec) {
        const webhook = defined({
          topic: args.topic,
          address: args.address,
          format: args.format,
          fields: Array.isArray(args.fields) ? args.fields : (typeof args.fields === 'string' ? args.fields : undefined),
          metafield_namespaces: Array.isArray(args.metafield_namespaces)
            ? args.metafield_namespaces
            : (typeof args.metafield_namespaces === 'string' ? args.metafield_namespaces : undefined),
        });
        const body = await client.rest('POST', '/webhooks', { body: { webhook }, signal: exec.signal });
        return { webhook: body.webhook };
      },
    },
    {
      name: 'shopify_update_webhook_subscription',
      title: 'Update webhook subscription',
      kind: 'write',
      description:
        'Updates an existing webhook subscription: address, format, fields, and metafield_namespaces. The topic cannot be changed — to subscribe to a different topic, create a new webhook and delete the old one. Pass only the fields you want to change.',
      parameters: {
        webhook_id: { type: 'string', required: true, description: 'Numeric webhook subscription ID (string or integer).' },
        address: { type: 'string', description: 'New delivery address: HTTPS URL, pubsub://project:topic, or AWS EventBridge ARN.' },
        format: { type: 'string', enum: ['json', 'xml'], description: 'Payload format (json|xml).' },
        fields: { type: 'array', items: { type: 'string' }, description: 'List of field names to include in the payload.' },
        metafield_namespaces: { type: 'array', items: { type: 'string' }, description: 'List of metafield namespaces to include in the payload.' },
      },
      async execute(args, exec) {
        const webhook = defined({
          address: args.address,
          format: args.format,
          fields: Array.isArray(args.fields) ? args.fields : (typeof args.fields === 'string' ? args.fields : undefined),
          metafield_namespaces: Array.isArray(args.metafield_namespaces)
            ? args.metafield_namespaces
            : (typeof args.metafield_namespaces === 'string' ? args.metafield_namespaces : undefined),
        });
        const body = await client.rest('PUT', `/webhooks/${args.webhook_id}`, { body: { webhook }, signal: exec.signal });
        return { webhook: body.webhook };
      },
    },
    {
      name: 'shopify_delete_webhook_subscription',
      title: 'Delete webhook subscription',
      kind: 'write',
      description:
        'Deletes a webhook subscription by its numeric ID. Irreversible: the shop stops receiving deliveries for that topic immediately. Confirm with the user before deleting.',
      parameters: {
        webhook_id: { type: 'string', required: true, description: 'Numeric webhook subscription ID (string or integer) to delete.' },
      },
      async execute(args, exec) {
        await client.rest('DELETE', `/webhooks/${args.webhook_id}`, { signal: exec.signal });
        return { deleted: true, webhook_id: args.webhook_id };
      },
    },
    {
      name: 'shopify_count_webhook_subscriptions',
      title: 'Count webhook subscriptions',
      kind: 'read',
      description:
        "Counts webhook subscriptions, optionally filtered by topic and/or address. Returns a single integer — useful before listing, e.g. to decide whether pagination is needed.",
      parameters: {
        topic: { type: 'string', description: "Count only webhooks for this topic, e.g. 'orders/create'." },
        address: { type: 'string', description: 'Count only webhooks delivered to this address.' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', '/webhooks/count', {
          query: defined({ topic: args.topic, address: args.address }),
          signal: exec.signal,
        });
        return { count: body.count };
      },
    },
    {
      name: 'shopify_graphql_webhooks',
      title: 'Query webhooks via GraphQL',
      kind: 'read',
      description:
        "GraphQL preset tool for webhook subscriptions. operation REQUIRED: list_webhookSubscriptions (paginated query with first/after; pass a search filter via fields or variables.query, e.g. 'topic:orders/create'), get_webhookSubscription (requires variables: { \"id\": \"gid://shopify/WebhookSubscription/<id>\" }), count_webhookSubscriptions (pass variables.query or fields for a filter). Custom documents: provide custom_document (full query text) to override the preset — your own variables object is applied as-is. api_version overrides the configured Admin API version. Return shape: { data, errors }.",
      parameters: {
        operation: {
          type: 'string',
          required: true,
          enum: ['list_webhookSubscriptions', 'get_webhookSubscription', 'count_webhookSubscriptions'],
          description: 'Which preset to run: list_webhookSubscriptions, get_webhookSubscription, or count_webhookSubscriptions.',
        },
        variables: { type: 'json', description: 'JSON object of GraphQL variables. get_webhookSubscription REQUIRES { "id": "gid://shopify/WebhookSubscription/<id>" }. For list/count, extra variables (e.g. {"query": "topic:orders/create"}) are merged with first/after/fields.' },
        first: { type: 'integer', description: 'list_webhookSubscriptions: number of edges to return (default 50, max 250).' },
        after: { type: 'string', description: "list_webhookSubscriptions: cursor from pageInfo.endCursor to fetch the next page." },
        fields: { type: 'string', description: "list_webhookSubscriptions/count_webhookSubscriptions: search filter string used as the query variable (e.g. 'topic:orders/create'). Ignored for get." },
        custom_document: { type: 'string', description: 'Full GraphQL document to run instead of the preset; your variables are applied as-is.' },
        api_version: { type: 'string', description: 'Admin API version to use, e.g. 2025-01 (defaults to the plugin config).' },
        raise_on_graphql_errors: { type: 'boolean', description: 'When true, throw if the response contains top-level GraphQL errors instead of returning them.' },
      },
      async execute(args, exec) {
        const userVars = asObject(args.variables) ?? {};
        let document;
        let variables = userVars;
        if (args.custom_document) {
          document = args.custom_document;
        } else if (args.operation === 'list_webhookSubscriptions') {
          document = LIST_DOCUMENT;
          variables = { ...userVars, ...defined({ first: args.first, after: args.after, query: args.fields }) };
        } else if (args.operation === 'get_webhookSubscription') {
          document = GET_DOCUMENT;
          if (userVars.id === undefined || userVars.id === null) {
            throw new ShopifyError(
              "operation 'get_webhookSubscription' requires variables.id — the webhookSubscription GID, e.g. { \"id\": \"gid://shopify/WebhookSubscription/123\" }",
              'SHOPIFY_INVALID_ARGS',
            );
          }
        } else if (args.operation === 'count_webhookSubscriptions') {
          document = COUNT_DOCUMENT;
          variables = { ...userVars, ...defined({ query: args.fields }) };
        } else {
          throw new ShopifyError(
            `unknown webhook GraphQL operation '${args.operation}'`,
            'SHOPIFY_UNSUPPORTED_OPERATION',
          );
        }
        const body = await client.graphql(document, variables, args.api_version);
        if (args.raise_on_graphql_errors && Array.isArray(body.errors) && body.errors.length > 0) {
          const messages = body.errors
            .map((err) => (typeof err?.message === 'string' ? err.message : JSON.stringify(err)))
            .join('; ');
          throw new ShopifyError(`Shopify GraphQL error: ${messages}`, 'SHOPIFY_GRAPHQL_ERROR');
        }
        return { data: body.data, errors: body.errors ?? [] };
      },
    },
  ];
}

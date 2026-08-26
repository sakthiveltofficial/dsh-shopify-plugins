/**
 * Billing tools: app subscriptions (GraphQL) and application charges (REST).
 * @module @shopify/dsh-shopify/tools/billing
 */

import { ShopifyError, defined } from '../util.js';

const CREATE_SUBSCRIPTION_DOC = `mutation($name: String!, $returnUrl: URL!, $lineItems: [AppSubscriptionLineItemInput!]!, $trialDays: Int, $test: Boolean, $replacementBehavior: AppSubscriptionReplacementBehavior) { appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, trialDays: $trialDays, test: $test, replacementBehavior: $replacementBehavior) { appSubscription { id status } confirmationUrl userErrors { field message } } }`;

const CANCEL_SUBSCRIPTION_DOC = `mutation($id: ID!, $prorate: Boolean) { appSubscriptionCancel(id: $id, prorate: $prorate) { appSubscription { id status } userErrors { field message } } }`;

const UPDATE_LINE_ITEM_DOC = `mutation($id: ID!, $cappedAmount: MoneyInput!) { appSubscriptionLineItemUpdate(id: $id, cappedAmount: $cappedAmount) { appSubscription { id } confirmationUrl userErrors { field message } } }`;

export function tools(ctx, deps) {
  const { client } = deps;
  const list = [
    {
      name: 'shopify_create_app_subscription',
      title: 'Create app subscription',
      kind: 'write',
      description:
        "Creates a recurring app subscription (GraphQL appSubscriptionCreate) and returns a `confirmationUrl` — the MERCHANT must open it to approve the charge before it takes effect; a subscription with status PENDING is not active yet. `lineItems` entries are either recurring pricing ({ plan: { appRecurringPricingDetails: { price: { amount: '9.99', currencyCode: 'USD' }, interval: 'EVERY_30_DAYS' } } }) or usage-based ({ plan: { appUsagePricingDetails: { cappedAmount: { amount, currencyCode }, terms } } }). `replacementBehavior` controls what happens when a subscription replaces an existing one (STANDARD | APPLY_IMMEDIATELY | APPLY_ON_NEXT_BILLING_CYCLE). Set `test: true` for development so no real charge is created.",
      parameters: {
        name: { type: 'string', required: true, description: 'REQUIRED. Name of the subscription plan shown to the merchant, e.g. "Pro plan".' },
        returnUrl: { type: 'string', required: true, description: 'REQUIRED. Merchant redirect URL after approving (https URL in your app).' },
        lineItems: {
          type: 'array',
          required: true,
          items: { type: 'json' },
          description: 'REQUIRED. Array of { plan: { appRecurringPricingDetails: { price: { amount, currencyCode }, interval: "EVERY_30_DAYS" } } } or usage-based plan objects.',
        },
        trialDays: { type: 'integer', description: 'Free trial length in days (max 90).' },
        test: { type: 'boolean', description: 'When true, creates a test subscription that never bills the merchant. Recommended in development.' },
        replacementBehavior: {
          type: 'string',
          enum: ['STANDARD', 'APPLY_IMMEDIATELY', 'APPLY_ON_NEXT_BILLING_CYCLE'],
          description: 'How the new subscription replaces an existing one: STANDARD (default) | APPLY_IMMEDIATELY | APPLY_ON_NEXT_BILLING_CYCLE.',
        },
      },
      async execute(args, exec) {
        const body = await client.graphql(
          CREATE_SUBSCRIPTION_DOC,
          defined({
            name: args.name,
            returnUrl: args.returnUrl,
            lineItems: args.lineItems,
            trialDays: args.trialDays,
            test: args.test,
            replacementBehavior: args.replacementBehavior,
          }),
        );
        return {
          data: body.data,
          userErrors: body.data?.appSubscriptionCreate?.userErrors ?? [],
          confirmationUrl: body.data?.appSubscriptionCreate?.confirmationUrl,
        };
      },
    },
    {
      name: 'shopify_cancel_app_subscription',
      title: 'Cancel app subscription',
      kind: 'write',
      description:
        "Cancels an active app subscription (GraphQL appSubscriptionCancel). `id` must be the full GID (gid://shopify/AppSubscription/123...). `prorate: true` issues a prorated refund for the unused portion of the billing cycle. Cancellation is irreversible — the merchant loses access to the plan's paid features.",
      parameters: {
        id: { type: 'string', required: true, description: 'REQUIRED. Subscription GID, e.g. "gid://shopify/AppSubscription/123456789".' },
        prorate: { type: 'boolean', description: 'When true, Shopify prorates the refund for the unused portion of the billing cycle.' },
      },
      async execute(args, exec) {
        const body = await client.graphql(CANCEL_SUBSCRIPTION_DOC, defined({ id: args.id, prorate: args.prorate }));
        return {
          data: body.data,
          userErrors: body.data?.appSubscriptionCancel?.userErrors ?? [],
        };
      },
    },
    {
      name: 'shopify_update_app_subscription_line_item',
      title: 'Update app subscription line item',
      kind: 'write',
      description:
        "Changes the capped amount of a usage-based app subscription line item (GraphQL appSubscriptionLineItemUpdate). `id` must be the line-item GID (gid://shopify/AppSubscriptionLineItem/123...); `cappedAmount` is { amount: '100.00', currencyCode: 'USD' }. The merchant may need to approve the change — a new `confirmationUrl` is returned when so.",
      parameters: {
        id: { type: 'string', required: true, description: 'REQUIRED. Line-item GID, e.g. "gid://shopify/AppSubscriptionLineItem/123456789".' },
        cappedAmount: {
          type: 'json',
          required: true,
          description: 'REQUIRED. New cap as { amount: "100.00", currencyCode: "USD" }.',
        },
      },
      async execute(args, exec) {
        const body = await client.graphql(UPDATE_LINE_ITEM_DOC, defined({ id: args.id, cappedAmount: args.cappedAmount }));
        return {
          data: body.data,
          userErrors: body.data?.appSubscriptionLineItemUpdate?.userErrors ?? [],
          confirmationUrl: body.data?.appSubscriptionLineItemUpdate?.confirmationUrl,
        };
      },
    },
    {
      name: 'shopify_create_one_time_charge',
      title: 'Create one-time charge',
      kind: 'write',
      description:
        "Creates a one-time application charge (POST /application_charges) — a flat fee, not recurring. `name`, `price` (0.50–10000, decimal string like '19.99'), and `return_url` are required. The response's `confirmation_url` must be opened by the merchant to approve; the charge only activates once approved (status 'accepted'). Set `test: true` in development to skip real billing.",
      parameters: {
        name: { type: 'string', required: true, description: 'REQUIRED. Charge name shown to the merchant, e.g. "Setup fee".' },
        price: { type: 'string', required: true, description: 'REQUIRED. Price as a decimal string between 0.50 and 10000, e.g. "19.99".' },
        return_url: { type: 'string', required: true, description: 'REQUIRED. HTTPS URL the merchant is redirected to after approving the charge.' },
        test: { type: 'boolean', description: 'When true, creates a test charge that never bills the merchant.' },
      },
      async execute(args, exec) {
        const price = Number(args.price);
        if (!Number.isFinite(price) || price < 0.5 || price > 10000) {
          throw new ShopifyError('application_charge.price must be a number between 0.50 and 10000', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('POST', '/application_charges', {
          body: {
            application_charge: defined({
              name: args.name,
              price: args.price,
              return_url: args.return_url,
              test: args.test,
            }),
          },
          signal: exec.signal,
        });
        return { application_charge: body.application_charge };
      },
    },
    {
      name: 'shopify_get_application_charges',
      title: 'List application charges',
      kind: 'read',
      description:
        "Lists all application charges (one-time fees) for the app on this shop, including their status (pending/accepted/declared/expired). Use `fields` to limit the response. Paginate with `page_info` from next_page_info. Prefer GraphQL subscription queries for recurring billing; this covers legacy one-time charges.",
      parameters: {
        fields: { type: 'string', description: 'Comma-separated fields to return, e.g. "id,name,price,status".' },
        since_id: { type: 'string', description: 'Return only charges created after this numeric application_charge_id.' },
        limit: { type: 'integer', description: 'Max charges per page (1-250, default 50).' },
        page_info: { type: 'string', description: "Cursor from a previous response's next_page_info; when present only `limit` and `fields` may accompany it." },
      },
      async execute(args, exec) {
        const listing = await client.list(
          '/application_charges',
          defined({ fields: args.fields, since_id: args.since_id, limit: args.limit, page_info: args.page_info }),
        );
        return { items: listing.items, count: listing.items.length, next_page_info: listing.next_page_info };
      },
    },
    {
      name: 'shopify_get_application_charge_by_id',
      title: 'Get application charge by ID',
      kind: 'read',
      description:
        "Gets one application charge by its numeric application_charge_id (e.g. '1017262355'). Status 'accepted' means the merchant approved and the charge was applied; 'declined' means they rejected it. Use `fields` to limit the response.",
      parameters: {
        application_charge_id: { type: 'string', required: true, description: 'Numeric application charge ID (string or integer), e.g. "1017262355".' },
        fields: { type: 'string', description: 'Comma-separated fields to return, e.g. "id,name,price,status".' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/application_charges/${args.application_charge_id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { application_charge: body.application_charge };
      },
    },
  ];
  return list;
}

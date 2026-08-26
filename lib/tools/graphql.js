/**
 * GraphQL tools: a generic Admin GraphQL escape hatch and a preset
 * write-operation dispatcher.
 * @module @shopify/dsh-shopify/tools/graphql
 */

import { ShopifyError } from '../util.js';

/** Preset documents for shopify_graphql_write_operations. */
const WRITE_PRESETS = {
  orderCreate: {
    doc: 'mutation orderCreate($input: OrderCreateInput!) { orderCreate(input: $input) { order { id } userErrors { field message } } }',
  },
  orderUpdate: {
    doc: 'mutation orderUpdate($input: OrderUpdateInput!) { orderUpdate(input: $input) { order { id } userErrors { field message } } }',
  },
  refundCreate: {
    doc: 'mutation refundCreate($input: RefundCreateInput!) { refundCreate(input: $input) { refund { id } userErrors { field message } } }',
  },
  orderEditBegin: {
    doc: 'mutation orderEditBegin($input: OrderEditBeginInput!) { orderEditBegin(input: $input) { calculatedOrder { id } orderEdit { id } userErrors { field message } } }',
  },
  orderEditCommit: {
    doc: 'mutation orderEditCommit($id: ID!) { orderEditCommit(id: $id) { order { id } userErrors { field message } } }',
  },
  draftOrderCreate: {
    doc: 'mutation draftOrderCreate($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id } userErrors { field message } } }',
  },
  draftOrderUpdate: {
    doc: 'mutation draftOrderUpdate($input: DraftOrderInput!) { draftOrderUpdate(input: $input) { draftOrder { id } userErrors { field message } } }',
  },
  draftOrderComplete: {
    doc: 'mutation draftOrderComplete($input: DraftOrderCompleteInput!) { draftOrderComplete(input: $input) { draftOrder { id } userErrors { field message } } }',
  },
  customerCreate: {
    doc: 'mutation customerCreate($input: CustomerInput!) { customerCreate(input: $input) { customer { id } userErrors { field message } } }',
  },
  customerUpdate: {
    doc: 'mutation customerUpdate($input: CustomerInput!) { customerUpdate(input: $input) { customer { id } userErrors { field message } } }',
  },
  customerDelete: {
    doc: 'mutation customerDelete($input: CustomerDeleteInput!) { customerDelete(input: $input) { deletedCustomerId userErrors { field message } } }',
  },
  metafieldsSet: {
    doc: 'mutation metafieldsSet($input: [MetafieldsSetInput!]!) { metafieldsSet(metafields: $input) { metafields { id key namespace value } userErrors { field message } } }',
  },
  metafieldsDelete: {
    doc: 'mutation metafieldsDelete($input: [MetafieldsDeleteInput!]!) { metafieldsDelete(metafields: $input) { deletedMetafields { key namespace ownerType } userErrors { field message } } }',
  },
  metaobjectUpsert: {
    doc: 'mutation metaobjectUpsert($input: MetaobjectUpsertInput!) { metaobjectUpsert(input: $input) { metaobject { id handle } userErrors { field message } } }',
  },
  collectionCreate: {
    doc: 'mutation collectionCreate($input: CollectionInput!) { collectionCreate(input: $input) { collection { id } userErrors { field message } } }',
  },
  collectionUpdate: {
    doc: 'mutation collectionUpdate($input: CollectionInput!) { collectionUpdate(input: $input) { collection { id } userErrors { field message } } }',
  },
  collectionDelete: {
    doc: 'mutation collectionDelete($input: CollectionDeleteInput!) { collectionDelete(input: $input) { deletedCollectionId userErrors { field message } } }',
  },
  collectionAddProducts: {
    doc: 'mutation collectionAddProducts($input: CollectionAddProductsInput!) { collectionAddProducts(input: $input) { collection { id } userErrors { field message } } }',
  },
  collectionRemoveProducts: {
    doc: 'mutation collectionRemoveProducts($input: CollectionRemoveProductsInput!) { collectionRemoveProducts(input: $input) { collection { id } userErrors { field message } } }',
  },
  inventoryAdjustQuantities: {
    doc: 'mutation inventoryAdjustQuantities($input: [InventoryAdjustQuantityInput!]!) { inventoryAdjustQuantities(input: $input) { inventoryLevels { id available } userErrors { field message } } }',
  },
  inventorySetQuantities: {
    doc: 'mutation inventorySetQuantities($input: [InventorySetQuantityInput!]!) { inventorySetQuantities(input: $input) { inventoryLevels { id available } userErrors { field message } } }',
  },
  discountCodeBasicCreate: {
    doc: 'mutation discountCodeBasicCreate($input: BasicCodeDiscountInput!) { discountCodeBasicCreate(basicCodeDiscount: $input) { codeDiscountNode { id } userErrors { field message } } }',
  },
  discountCodeBasicUpdate: {
    doc: 'mutation discountCodeBasicUpdate($id: ID!, $input: BasicCodeDiscountInput!) { discountCodeBasicUpdate(id: $id, basicCodeDiscount: $input) { codeDiscountNode { id } userErrors { field message } } }',
  },
  discountCodeDelete: {
    doc: 'mutation discountCodeDelete($id: ID!) { discountCodeDelete(id: $id) { deletedCodeDiscountId userErrors { field message } } }',
  },
  webhookSubscriptionCreate: {
    doc: 'mutation webhookSubscriptionCreate($topic: WebhookSubscriptionTopic!, $input: WebhookSubscriptionInput!) { webhookSubscriptionCreate(topic: $topic, webhookSubscription: $input) { webhookSubscription { id } userErrors { field message } } }',
  },
  webhookSubscriptionUpdate: {
    doc: 'mutation webhookSubscriptionUpdate($id: ID!, $input: WebhookSubscriptionInput!) { webhookSubscriptionUpdate(id: $id, webhookSubscription: $input) { webhookSubscription { id } userErrors { field message } } }',
  },
  webhookSubscriptionDelete: {
    doc: 'mutation webhookSubscriptionDelete($id: ID!) { webhookSubscriptionDelete(id: $id) { deletedWebhookSubscriptionId userErrors { field message } } }',
  },
  fulfillmentCreate: {
    doc: 'mutation fulfillmentCreate($input: FulfillmentCreateInput!) { fulfillmentCreate(input: $input) { fulfillment { id } userErrors { field message } } }',
  },
  fulfillmentTrackingInfoUpdate: {
    doc: 'mutation fulfillmentTrackingInfoUpdate($input: FulfillmentTrackingInfoUpdateInput!) { fulfillmentTrackingInfoUpdate(input: $input) { fulfillment { id } userErrors { field message } } }',
  },
  bulkOperationRunQuery: {
    doc: 'mutation bulkOperationRunQuery($query: String!, $groupObjects: Boolean) { bulkOperationRunQuery(query: $query, groupObjects: $groupObjects) { bulkOperation { id status } userErrors { field message } } }',
  },
  bulkOperationRunMutation: {
    doc: 'mutation bulkOperationRunMutation($mutation: String!, $stagedUploadPath: String!, $clientIdentifier: String) { bulkOperationRunMutation(mutation: $mutation, stagedUploadPath: $stagedUploadPath, clientIdentifier: $clientIdentifier) { bulkOperation { id status } userErrors { field message } } }',
  },
};

const WRITE_OPERATION_NAMES = Object.keys(WRITE_PRESETS);

/** Walk a GraphQL `data` tree and collect every non-empty `userErrors` array. */
function collectUserErrors(data, out = []) {
  if (Array.isArray(data)) {
    for (const item of data) collectUserErrors(item, out);
    return out;
  }
  if (data && typeof data === 'object') {
    if (Array.isArray(data.userErrors) && data.userErrors.length > 0) out.push(...data.userErrors);
    for (const [key, value] of Object.entries(data)) {
      if (key === 'userErrors') continue;
      collectUserErrors(value, out);
    }
  }
  return out;
}

/** Find the first `pageInfo` object (with hasNextPage) anywhere in `data`. */
function findPageInfo(data) {
  if (!data || typeof data !== 'object') return undefined;
  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findPageInfo(item);
      if (found) return found;
    }
    return undefined;
  }
  for (const [key, value] of Object.entries(data)) {
    if (key === 'pageInfo' && value && typeof value === 'object' && 'hasNextPage' in value) return value;
    const found = findPageInfo(value);
    if (found) return found;
  }
  return undefined;
}

/** Shared envelope + raise-on-error behavior for both GraphQL tools. */
async function runGraphQL(client, document, variables, apiVersion, args) {
  const body = await client.graphql(document, variables, apiVersion);
  const userErrors = collectUserErrors(body.data);
  if (args.raise_on_graphql_errors && Array.isArray(body.errors) && body.errors.length > 0) {
    const joined = body.errors.map((err) => (err?.message ? err.message : JSON.stringify(err))).join('; ');
    throw new ShopifyError(`Shopify GraphQL errors: ${joined}`, 'SHOPIFY_GRAPHQL_ERROR');
  }
  if (args.raise_on_user_errors && userErrors.length > 0) {
    const joined = userErrors.map((ue) => `userErrors: ${ue?.message ?? JSON.stringify(ue)}`).join('; ');
    throw new ShopifyError(`Shopify userErrors: ${joined}`, 'SHOPIFY_USER_ERRORS');
  }
  const pageInfo = findPageInfo(body.data);
  return {
    data: body.data,
    errors: body.errors ?? [],
    extensions: body.extensions,
    userErrors,
    ...(pageInfo ? { pageInfo } : {}),
  };
}

export function tools(ctx, deps) {
  const { client } = deps;
  const list = [
    {
      name: 'shopify_graphql_admin_execute',
      title: 'Execute Admin GraphQL',
      kind: 'write',
      description:
        "Generic GraphQL escape hatch: runs ANY Shopify Admin GraphQL query or mutation verbatim. `document` is the full query/mutation text (e.g. '{ shop { name } }'); `variables` is the JSON variables object; `api_version` overrides the configured default. `operation_name` selects one operation when the document has several (the current transport sends query+variables, so prefer single-operation documents). With `raise_on_graphql_errors: true` it throws on top-level GraphQL errors; with `raise_on_user_errors: true` it throws when any payload's userErrors array is non-empty (HTTP 200 validation failures). Always inspect the returned userErrors — Shopify returns them for validation problems.",
      parameters: {
        document: {
          type: 'string',
          required: true,
          description: 'REQUIRED. Full GraphQL query/mutation text, e.g. "mutation($id: ID!) { productDelete(id: $id) { deletedProductId } }".',
        },
        variables: { type: 'json', description: 'JSON object of GraphQL variables, e.g. { "id": "gid://shopify/Product/123" }.' },
        api_version: { type: 'string', description: "Admin API version override, e.g. '2025-01' (defaults to the configured apiVersion)." },
        operation_name: { type: 'string', description: 'Optional operation name when the document defines several named operations.' },
        raise_on_user_errors: { type: 'boolean', description: 'When true, throw ShopifyError(SHOPIFY_USER_ERRORS) if any payload userErrors array is non-empty. Default false.' },
        raise_on_graphql_errors: { type: 'boolean', description: 'When true, throw ShopifyError(SHOPIFY_GRAPHQL_ERROR) if the response has top-level GraphQL errors. Default false.' },
      },
      async execute(args, exec) {
        if (!args.document || !args.document.trim()) {
          throw new ShopifyError('document is required for shopify_graphql_admin_execute', 'SHOPIFY_INVALID_ARGS');
        }
        return runGraphQL(client, args.document, args.variables, args.api_version, args);
      },
    },
    {
      name: 'shopify_graphql_write_operations',
      title: 'Run preset write operation',
      kind: 'write',
      description:
        "Runs one of the preset Admin GraphQL write mutations (orders, refunds, draft orders, customers, metafields, metaobjects, collections, inventory, discount codes, webhooks, fulfillments, bulk operations). Each preset declares a standard Shopify `$input` variable — pass the mutation's input object as variables.input (e.g. { input: { id: 'gid://shopify/Order/123', note: '...' } }). Exceptions: bulkOperationRunQuery takes variables { query, groupObjects }; bulkOperationRunMutation takes { mutation, stagedUploadPath, clientIdentifier }; id-only mutations (orderEditCommit, discountCodeDelete, webhookSubscriptionDelete) take variables.id. `custom_document` overrides the preset entirely (use it with `variables`). Same error/raise semantics and return envelope as shopify_graphql_admin_execute. Unknown operations throw SHOPIFY_UNSUPPORTED_OPERATION — use shopify_graphql_admin_execute for anything not preset.",
      parameters: {
        operation: {
          type: 'string',
          required: true,
          enum: WRITE_OPERATION_NAMES,
          description: 'REQUIRED. Preset mutation to run.',
        },
        variables: {
          type: 'json',
          description: 'GraphQL variables; usually { input: {...} } with the mutation input object. See description for per-operation exceptions.',
        },
        custom_document: { type: 'string', description: 'Overrides the preset document; used together with `variables`.' },
        api_version: { type: 'string', description: "Admin API version override, e.g. '2025-01' (defaults to the configured apiVersion)." },
        raise_on_user_errors: { type: 'boolean', description: 'When true, throw ShopifyError(SHOPIFY_USER_ERRORS) if any payload userErrors array is non-empty. Default false.' },
        raise_on_graphql_errors: { type: 'boolean', description: 'When true, throw ShopifyError(SHOPIFY_GRAPHQL_ERROR) if the response has top-level GraphQL errors. Default false.' },
      },
      async execute(args, exec) {
        let document = args.custom_document;
        let variables = args.variables;
        if (!document) {
          const preset = WRITE_PRESETS[args.operation];
          if (!preset) {
            throw new ShopifyError(
              `unknown write operation: ${args.operation} — use shopify_graphql_admin_execute with a custom document`,
              'SHOPIFY_UNSUPPORTED_OPERATION',
            );
          }
          document = preset.doc;
          variables = variables ?? {};
        }
        return runGraphQL(client, document, variables, args.api_version, args);
      },
    },
  ];
  return list;
}

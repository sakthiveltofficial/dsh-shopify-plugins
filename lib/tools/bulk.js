/**
 * Bulk operation tools: run, inspect, list, cancel, and poll bulk operations.
 * @module @shopify/dsh-shopify/tools/bulk
 */

import { ShopifyError, defined } from '../util.js';

export function tools(ctx, deps) {
  const { client } = deps;
  const list = [
    {
      name: 'shopify_run_bulk_operation_query',
      title: 'Run bulk operation query',
      kind: 'write',
      description:
        "Starts an async Admin GraphQL bulk query (bulkOperationRunQuery) that exports large datasets as JSONL. `query` is the INNER query only — no mutation wrapper — and MUST include at least one connection field using edges { node { ... } } (e.g. '{ products { edges { node { id title } } } }'). Results are written to a URL (from shopify_get_bulk_operation / shopify_query_current_bulk_operation) that stays valid ~7 days. Only ONE bulk query and ONE bulk mutation can run at a time per shop — check shopify_query_current_bulk_operation before starting another. Poll status until COMPLETED, then download the JSONL from url.",
      parameters: {
        query: {
          type: 'string',
          required: true,
          description: "REQUIRED. Inner GraphQL query without mutation wrapper, with at least one edges { node { ... } } connection, e.g. '{ products { edges { node { id title } } } }'.",
        },
        groupObjects: {
          type: 'boolean',
          description: 'When true, co-locates objects in a JSONL file based on a shared attribute (optional).',
        },
      },
      async execute(args, exec) {
        if (!args.query || !args.query.trim()) {
          throw new ShopifyError('query is required for shopify_run_bulk_operation_query', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.graphql(
          `mutation bulk($query: String!, $groupObjects: Boolean) { bulkOperationRunQuery(query: $query, groupObjects: $groupObjects) { bulkOperation { id status } userErrors { field message } } }`,
          defined({ query: args.query, groupObjects: args.groupObjects }),
        );
        return {
          data: body.data,
          userErrors: body.data?.bulkOperationRunQuery?.userErrors ?? [],
          bulkOperation: body.data?.bulkOperationRunQuery?.bulkOperation,
        };
      },
    },
    {
      name: 'shopify_get_bulk_operation',
      title: 'Get bulk operation',
      kind: 'read',
      description:
        "Gets one bulk operation by its GID (bulkOperation). The `url` field is the JSONL results download — it is only populated once status is COMPLETED and stays valid ~7 days; `partialDataUrl` is available for COMPLETED operations with errors. Poll status until COMPLETED, then fetch the JSONL from url. `errorCode` (e.g. ACCESS_DENIED, INTERNAL_SERVER_ERROR, TIMEOUT) explains failures.",
      parameters: {
        id: { type: 'string', required: true, description: 'REQUIRED. Bulk operation GID, e.g. "gid://shopify/BulkOperation/123456".' },
      },
      async execute(args, exec) {
        const body = await client.graphql(
          `query bulk($id: ID!) { bulkOperation(id: $id) { id status errorCode url partialDataUrl createdAt completedAt objectCount fileSize } }`,
          { id: args.id },
        );
        return { data: body.data };
      },
    },
    {
      name: 'shopify_list_bulk_operations',
      title: 'List bulk operations',
      kind: 'read',
      description:
        "Lists the shop's bulk operations (bulkOperations query) with pagination. `sortKey` defaults to CREATED_AT; `query` is a Shopify GraphQL search filter string (e.g. 'status:COMPLETED'). Paginate with after/before cursors from the returned pageInfo. Useful to find a past operation's id (GID) before polling shopify_get_bulk_operation.",
      parameters: {
        first: { type: 'integer', description: 'Max items per page when paginating forward.' },
        last: { type: 'integer', description: 'Max items per page when paginating backward (use with before).' },
        after: { type: 'string', description: 'Cursor from pageInfo.endCursor to fetch the next page.' },
        before: { type: 'string', description: 'Cursor from pageInfo.startCursor to fetch the previous page.' },
        reverse: { type: 'boolean', description: 'Reverse the sort order (newest last).' },
        sortKey: { type: 'string', enum: ['CREATED_AT', 'STATUS', 'ID'], description: 'Sort key; CREATED_AT is the default.' },
        query: { type: 'string', description: 'GraphQL search filter string, e.g. "status:COMPLETED".' },
      },
      async execute(args, exec) {
        const body = await client.graphql(
          `query bulk($first: Int, $last: Int, $after: String, $before: String, $reverse: Boolean, $sortKey: BulkOperationSortKeys, $query: String) { bulkOperations(first: $first, last: $last, after: $after, before: $before, reverse: $reverse, sortKey: $sortKey, query: $query) { edges { node { id status errorCode url createdAt completedAt } } pageInfo { hasNextPage hasPreviousPage startCursor endCursor } } }`,
          defined({
            first: args.first,
            last: args.last,
            after: args.after,
            before: args.before,
            reverse: args.reverse,
            sortKey: args.sortKey,
            query: args.query,
          }),
        );
        return { data: body.data, pageInfo: body.data?.bulkOperations?.pageInfo };
      },
    },
    {
      name: 'shopify_cancel_bulk_operation',
      title: 'Cancel bulk operation',
      kind: 'write',
      description:
        "Cancels a running bulk operation (bulkOperationCancel) by its GID. Only CANCELING/CREATED operations can be cancelled; COMPLETED/FAILED ones are unaffected. After cancelling, you can start a new bulk operation — only one bulk query and one bulk mutation run at a time per shop.",
      parameters: {
        id: { type: 'string', required: true, description: 'REQUIRED. Bulk operation GID, e.g. "gid://shopify/BulkOperation/123456".' },
      },
      async execute(args, exec) {
        const body = await client.graphql(
          `mutation bulk($id: ID!) { bulkOperationCancel(id: $id) { bulkOperation { id status } userErrors { field message } } }`,
          { id: args.id },
        );
        return {
          data: body.data,
          userErrors: body.data?.bulkOperationCancel?.userErrors ?? [],
        };
      },
    },
    {
      name: 'shopify_query_current_bulk_operation',
      title: 'Query current bulk operation',
      kind: 'read',
      description:
        "Returns the bulk operation currently running on the shop for the given `type` (currentBulkOperation) — or null when none is running. Since only ONE bulk query and ONE bulk mutation run at a time per shop, call this before shopify_run_bulk_operation_query to avoid 'Another bulk operation is already running' errors. Poll the returned id with shopify_get_bulk_operation until COMPLETED.",
      parameters: {
        type: {
          type: 'string',
          enum: ['QUERY', 'MUTATION'],
          description: "Bulk operation type: 'QUERY' (bulkOperationRunQuery) or 'MUTATION' (bulkOperationRunMutation). Defaults to QUERY.",
        },
      },
      async execute(args, exec) {
        const body = await client.graphql(
          `query bulk($type: BulkOperationType!) { currentBulkOperation(type: $type) { id status errorCode url createdAt completedAt } }`,
          { type: args.type ?? 'QUERY' },
        );
        return { data: body.data };
      },
    },
  ];
  return list;
}

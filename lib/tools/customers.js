/**
 * Customer tools: list, get, search, count, create, update, delete, plus the
 * customer address book and account-activation URL generation.
 * @module @shopify/dsh-shopify/tools/customers
 */

import { ShopifyError, asArray, asObject, defined, hasText } from '../util.js';

/**
 * Flatten a Shopify REST `errors` value (string, array, or object mapping
 * field → messages) into a single human-readable message.
 */
function joinValidationErrors(errors) {
  if (typeof errors === 'string') return errors;
  if (Array.isArray(errors)) return errors.filter((entry) => typeof entry === 'string').join('; ');
  if (errors && typeof errors === 'object') {
    const parts = [];
    for (const [field, value] of Object.entries(errors)) {
      if (Array.isArray(value)) {
        for (const message of value) parts.push(`${field}: ${String(message)}`);
      } else if (value !== null && typeof value === 'object') {
        parts.push(`${field}: ${JSON.stringify(value)}`);
      } else {
        parts.push(`${field}: ${String(value)}`);
      }
    }
    return parts.join('; ');
  }
  return undefined;
}

export function tools(ctx, deps) {
  const { client } = deps;
  return [
    {
      name: 'shopify_list_customers',
      title: 'List customers',
      kind: 'read',
      description:
        'Lists customers. Paginated: loop with the returned next_page_info until null to fetch every page (when page_info is present, only limit/fields may accompany it). Filters: ids (comma-separated), status (enabled|disabled|invited|declined), created_at_min/max and updated_at_min/max (ISO 8601, evaluated in the shop\'s local timezone — use shopify_get_shop_details for iana_timezone). limit 1-250, default 50.',
      parameters: {
        ids: { type: 'string', description: 'Comma-separated customer IDs to return (e.g. "7264721819867,7264721819870").' },
        limit: { type: 'integer', description: 'Maximum results per page, 1-250 (default 50).' },
        since_id: { type: 'string', description: 'Return only customers with id greater than this numeric ID (offset pagination).' },
        page_info: { type: 'string', description: 'Cursor from a previous response\'s next_page_info; when present only limit and fields may be passed with it.' },
        fields: { type: 'string', description: 'Comma-separated subset of customer fields to return (e.g. "id,email,first_name,last_name").' },
        status: { type: 'string', enum: ['enabled', 'disabled', 'invited', 'declined'], description: 'Filter by customer state: enabled, disabled, invited, or declined.' },
        created_at_min: { type: 'string', description: 'ISO 8601 timestamp: only customers created at or after this time.' },
        created_at_max: { type: 'string', description: 'ISO 8601 timestamp: only customers created at or before this time.' },
        updated_at_min: { type: 'string', description: 'ISO 8601 timestamp: only customers updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 timestamp: only customers updated at or before this time.' },
      },
      async execute(args, exec) {
        const { items, next_page_info } = await client.list(
          '/customers',
          defined({
            ids: args.ids,
            limit: args.limit,
            since_id: args.since_id,
            page_info: args.page_info,
            fields: args.fields,
            status: args.status,
            created_at_min: args.created_at_min,
            created_at_max: args.created_at_max,
            updated_at_min: args.updated_at_min,
            updated_at_max: args.updated_at_max,
          }),
        );
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_customer',
      title: 'Get customer',
      kind: 'read',
      description:
        'Gets one customer by numeric ID (e.g. "7264721819867"; string or integer accepted). Use fields (comma-separated) to limit the response. Returns the customer profile including default_address, email, phone, and orders_count.',
      parameters: {
        customer_id: { type: 'string', required: true, description: 'Numeric ID of the customer (e.g. "7264721819867").' },
        fields: { type: 'string', description: 'Comma-separated subset of customer fields to return.' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/customers/${args.customer_id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { customer: body.customer };
      },
    },
    {
      name: 'shopify_search_customers',
      title: 'Search customers',
      kind: 'read',
      description:
        'Searches customers with Shopify search syntax, e.g. query="email:john@example.com", "country:United States", "orders_count:>1", or "last_order_date:>=2024-01-01" (AND/OR supported). order takes e.g. "last_order_date DESC". Paginated: loop with next_page_info until null for all results. Prefer shopify_list_customers for simple attribute filters.',
      parameters: {
        query: { type: 'string', required: true, description: 'Shopify search query, e.g. "email:foo@bar.com" or "country:United States AND orders_count:>1".' },
        limit: { type: 'integer', description: 'Maximum results per page, 1-250 (default 50).' },
        fields: { type: 'string', description: 'Comma-separated subset of customer fields to return.' },
        order: { type: 'string', description: 'Sort order, e.g. "last_order_date DESC" or "name ASC".' },
      },
      async execute(args, exec) {
        if (!hasText(args.query)) {
          throw new ShopifyError('query is required (Shopify search syntax, e.g. "email:foo@bar.com")', 'SHOPIFY_INVALID_ARGS');
        }
        const { items, next_page_info } = await client.list(
          '/customers/search',
          defined({
            query: args.query,
            limit: args.limit,
            fields: args.fields,
            order: args.order,
          }),
        );
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_count_customers',
      title: 'Count customers',
      kind: 'read',
      description:
        'Counts customers matching optional ISO 8601 created_at_min/max and updated_at_min/max filters (evaluated in the shop\'s local timezone). Returns { count }. Useful to size a shopify_list_customers pagination loop.',
      parameters: {
        created_at_min: { type: 'string', description: 'ISO 8601 timestamp: only customers created at or after this time.' },
        created_at_max: { type: 'string', description: 'ISO 8601 timestamp: only customers created at or before this time.' },
        updated_at_min: { type: 'string', description: 'ISO 8601 timestamp: only customers updated at or after this time.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 timestamp: only customers updated at or before this time.' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', '/customers/count', {
          query: defined({
            created_at_min: args.created_at_min,
            created_at_max: args.created_at_max,
            updated_at_min: args.updated_at_min,
            updated_at_max: args.updated_at_max,
          }),
          signal: exec.signal,
        });
        return { count: body.count };
      },
    },
    {
      name: 'shopify_create_customer',
      title: 'Create customer',
      kind: 'write',
      description:
        "Creates a customer. Requires at least one of: email, phone, or BOTH first_name and last_name. customer is a JSON object with keys: first_name, last_name, email, phone, verified_email, password, password_confirmation, tags, note, addresses, send_email_invite, send_email_welcome. Validation failures (e.g. duplicate email) return HTTP 422 with an errors object — surfaced as a SHOPIFY_VALIDATION_ERROR with the joined messages. Returns the created customer.",
      parameters: {
        customer: { type: 'json', required: true, description: 'The customer body as a JSON object. At least one of email, phone, or (first_name AND last_name) is required. Optional: verified_email, password, password_confirmation, tags, note, addresses, send_email_invite, send_email_welcome.' },
      },
      async execute(args, exec) {
        const customer = asObject(args.customer);
        if (!customer || typeof customer !== 'object') {
          throw new ShopifyError('customer (JSON object) is required', 'SHOPIFY_INVALID_ARGS');
        }
        if (!hasText(customer.email) && !hasText(customer.phone) && !(hasText(customer.first_name) && hasText(customer.last_name))) {
          throw new ShopifyError('customer requires at least one of email, phone, or both first_name and last_name', 'SHOPIFY_INVALID_ARGS');
        }
        try {
          const body = await client.rest('POST', '/customers', { body: { customer }, signal: exec.signal });
          return { customer: body.customer };
        } catch (error) {
          // Shopify returns HTTP 422 with an `errors` object on invalid input.
          if (error instanceof ShopifyError && error.status === 422 && error.body && typeof error.body === 'object' && error.body.errors) {
            const message = joinValidationErrors(error.body.errors);
            throw new ShopifyError(message || 'Customer validation failed', 'SHOPIFY_VALIDATION_ERROR', 422, error.body);
          }
          throw error;
        }
      },
    },
    {
      name: 'shopify_update_customer',
      title: 'Update customer',
      kind: 'write',
      description:
        'Updates an existing customer by ID. customer is a JSON object with only the fields to change: first_name, last_name, email, phone, verified_email, tags, note, addresses, tax_exempt, tax_exemptions, multipass_identifier, sms_marketing_consent, email_marketing_consent, send_email_invite, send_email_welcome. Omit email/phone to leave them untouched. Returns the updated customer.',
      parameters: {
        customer_id: { type: 'string', required: true, description: 'Numeric ID of the customer to update (e.g. "7264721819867").' },
        customer: { type: 'json', required: true, description: 'The customer body as a JSON object with the fields to change (see description). At least one field expected.' },
      },
      async execute(args, exec) {
        const customer = asObject(args.customer);
        if (!customer || typeof customer !== 'object') {
          throw new ShopifyError('customer (JSON object) is required', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('PUT', `/customers/${args.customer_id}`, {
          body: { customer },
          signal: exec.signal,
        });
        return { customer: body.customer };
      },
    },
    {
      name: 'shopify_delete_customer',
      title: 'Delete customer',
      kind: 'write',
      description:
        'Permanently deletes a customer by ID. Irreversible — confirm with the user first. Customers with existing orders CANNOT be deleted (Shopify rejects the call); handle those orders first or leave the customer in place. Returns { deleted: true }.',
      parameters: {
        customer_id: { type: 'string', required: true, description: 'Numeric ID of the customer to delete (e.g. "7264721819867").' },
      },
      async execute(args, exec) {
        await client.rest('DELETE', `/customers/${args.customer_id}`, { signal: exec.signal });
        return { deleted: true };
      },
    },
    {
      name: 'shopify_get_customer_addresses',
      title: 'Get customer addresses',
      kind: 'read',
      description:
        'Lists all addresses for one customer by customer_id. Paginated with limit (1-250); returns next_page_info when more pages exist. Pair with shopify_create_customer_address / shopify_update_customer_address to manage the address book. Address IDs are used by shopify_set_default_customer_address and shopify_bulk_delete_customer_addresses.',
      parameters: {
        customer_id: { type: 'string', required: true, description: 'Numeric ID of the customer (e.g. "7264721819867").' },
        limit: { type: 'integer', description: 'Maximum results per page, 1-250 (default 50).' },
      },
      async execute(args, exec) {
        const { items, next_page_info } = await client.list(`/customers/${args.customer_id}/addresses`, defined({ limit: args.limit }));
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_customer_address',
      title: 'Get customer address',
      kind: 'read',
      description:
        'Gets one address of a customer by customer_id and address_id (both numeric; string or integer accepted). Returns the customer_address with fields such as address1, city, province, country, zip, phone, and default.',
      parameters: {
        customer_id: { type: 'string', required: true, description: 'Numeric ID of the customer (e.g. "7264721819867").' },
        address_id: { type: 'string', required: true, description: 'Numeric ID of the address (e.g. "952072583093").' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/customers/${args.customer_id}/addresses/${args.address_id}`, { signal: exec.signal });
        return { customer_address: body.customer_address };
      },
    },
    {
      name: 'shopify_create_customer_address',
      title: 'Create customer address',
      kind: 'write',
      description:
        'Adds a new address to a customer. address is a JSON object with any of: first_name, last_name, company, address1, address2, city, province, country (2-letter ISO code), zip, phone. Returns the created customer_address; its id feeds shopify_update_customer_address and shopify_set_default_customer_address.',
      parameters: {
        customer_id: { type: 'string', required: true, description: 'Numeric ID of the customer (e.g. "7264721819867").' },
        address: { type: 'json', required: true, description: 'The address body as a JSON object: first_name, last_name, company, address1, address2, city, province, country, zip, phone.' },
      },
      async execute(args, exec) {
        const address = asObject(args.address);
        if (!address || typeof address !== 'object') {
          throw new ShopifyError('address (JSON object) is required', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('POST', `/customers/${args.customer_id}/addresses`, {
          body: { address },
          signal: exec.signal,
        });
        return { customer_address: body.customer_address };
      },
    },
    {
      name: 'shopify_update_customer_address',
      title: 'Update customer address',
      kind: 'write',
      description:
        'Updates an existing customer address by customer_id and address_id. address is a JSON object with the same keys as shopify_create_customer_address (first_name, last_name, company, address1, address2, city, province, country, zip, phone). Returns the updated customer_address.',
      parameters: {
        customer_id: { type: 'string', required: true, description: 'Numeric ID of the customer (e.g. "7264721819867").' },
        address_id: { type: 'string', required: true, description: 'Numeric ID of the address to update (e.g. "952072583093").' },
        address: { type: 'json', required: true, description: 'The address body as a JSON object with the fields to change: first_name, last_name, company, address1, address2, city, province, country, zip, phone.' },
      },
      async execute(args, exec) {
        const address = asObject(args.address);
        if (!address || typeof address !== 'object') {
          throw new ShopifyError('address (JSON object) is required', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('PUT', `/customers/${args.customer_id}/addresses/${args.address_id}`, {
          body: { address },
          signal: exec.signal,
        });
        return { customer_address: body.customer_address };
      },
    },
    {
      name: 'shopify_delete_customer_address',
      title: 'Delete customer address',
      kind: 'write',
      description:
        'Permanently deletes one address of a customer by customer_id and address_id. Irreversible — confirm before calling. Use shopify_bulk_delete_customer_addresses to remove several at once. Returns { deleted: true }.',
      parameters: {
        customer_id: { type: 'string', required: true, description: 'Numeric ID of the customer (e.g. "7264721819867").' },
        address_id: { type: 'string', required: true, description: 'Numeric ID of the address to delete (e.g. "952072583093").' },
      },
      async execute(args, exec) {
        await client.rest('DELETE', `/customers/${args.customer_id}/addresses/${args.address_id}`, { signal: exec.signal });
        return { deleted: true };
      },
    },
    {
      name: 'shopify_set_default_customer_address',
      title: 'Set default customer address',
      kind: 'write',
      description:
        'Marks an existing address as the customer\'s default address, used automatically for new orders and checkout. Takes customer_id and address_id; returns the updated customer_address with default=true.',
      parameters: {
        customer_id: { type: 'string', required: true, description: 'Numeric ID of the customer (e.g. "7264721819867").' },
        address_id: { type: 'string', required: true, description: 'Numeric ID of the address to make default (e.g. "952072583093").' },
      },
      async execute(args, exec) {
        const body = await client.rest('PUT', `/customers/${args.customer_id}/addresses/${args.address_id}/default`, { signal: exec.signal });
        return { customer_address: body.customer_address };
      },
    },
    {
      name: 'shopify_bulk_delete_customer_addresses',
      title: 'Bulk delete customer addresses',
      kind: 'write',
      description:
        'Deletes multiple addresses of one customer in a single call. address_ids is REQUIRED (array of numeric address IDs from shopify_get_customer_addresses). operation defaults to "destroy" (the only supported value). Returns { deleted: true, address_ids }. Irreversible — confirm with the user before calling.',
      parameters: {
        customer_id: { type: 'string', required: true, description: 'Numeric ID of the customer whose addresses to delete (e.g. "7264721819867").' },
        address_ids: { type: 'array', items: { type: 'string' }, required: true, description: 'Numeric IDs of the addresses to delete (e.g. ["952072583093", "952072583095"]).' },
        operation: { type: 'string', enum: ['destroy'], description: 'Operation to perform; defaults to "destroy" (the only supported value).' },
      },
      async execute(args, exec) {
        const addressIds = asArray(args.address_ids);
        if (!Array.isArray(addressIds) || addressIds.length === 0) {
          throw new ShopifyError('address_ids is required: a non-empty array of address IDs', 'SHOPIFY_INVALID_ARGS');
        }
        await client.rest('DELETE', `/customers/${args.customer_id}/addresses/set`, {
          body: { address: { operation: args.operation ?? 'destroy', address_ids: addressIds } },
          signal: exec.signal,
        });
        return { deleted: true, address_ids: addressIds };
      },
    },
    {
      name: 'shopify_create_customer_account_activation_url',
      title: 'Create customer account activation URL',
      kind: 'write',
      description:
        'Generates a one-time account activation URL for a customer, used to invite them to create a store account or set a password. Takes customer_id; returns { account_activation_url }. The URL is single-use and expires — send it to the customer promptly (e.g. by email).',
      parameters: {
        customer_id: { type: 'string', required: true, description: 'Numeric ID of the customer (e.g. "7264721819867").' },
      },
      async execute(args, exec) {
        const body = await client.rest('POST', `/customers/${args.customer_id}/account_activation_url`, { signal: exec.signal });
        return { account_activation_url: body.account_activation_url };
      },
    },
  ];
}

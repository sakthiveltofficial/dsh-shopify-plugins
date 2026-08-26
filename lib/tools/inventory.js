/**
 * Inventory tools: locations, inventory items, and inventory levels over the
 * Shopify Admin REST API.
 * @module @shopify/dsh-shopify/tools/inventory
 */

import { ShopifyError, defined } from '../util.js';

export function tools(ctx, deps) {
  const { client } = deps;
  return [
    {
      name: 'shopify_list_locations',
      title: 'List locations',
      kind: 'read',
      description:
        'Lists all locations (physical or otherwise) that hold inventory: id, name, address, active, legacy, deleted_at, etc. Use the numeric REST location_id from here with the inventory level tools. Returns { items, count, next_page_info }.',
      parameters: {
        limit: { type: 'integer', description: 'Maximum number of locations per page (1-250, default 50).' },
      },
      async execute(args, exec) {
        const { items, next_page_info } = await client.list('/locations', defined({ limit: args.limit }));
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_location',
      title: 'Get location',
      kind: 'read',
      description:
        'Gets a single location by numeric REST location_id, including its address, active/legacy flags, and local pickup/delivery settings. Returns { location }.',
      parameters: {
        location_id: { type: 'string', required: true, description: 'Numeric REST location ID to fetch (string or integer).' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/locations/${args.location_id}`, { signal: exec.signal });
        return { location: body.location };
      },
    },
    {
      name: 'shopify_get_locations_count',
      title: 'Count locations',
      kind: 'read',
      description:
        "Counts the shop's locations — cheaper than listing when only a number is needed. Returns { count }.",
      parameters: {},
      async execute(args, exec) {
        const body = await client.rest('GET', '/locations/count', { signal: exec.signal });
        return { count: body.count };
      },
    },
    {
      name: 'shopify_get_inventory_items',
      title: 'Get inventory items',
      kind: 'read',
      description:
        'Gets inventory items by their numeric REST ids (comma-separated, max 100 — the trailing integer of a gid://shopify/InventoryItem/... GID). Each item describes the product variant it belongs to (variant_id, sku, cost, tracked, country_code_of_origin, harmonized_system_code). Use this to resolve variant <-> inventory_item relationships before adjusting levels. Returns { items, count, next_page_info }.',
      parameters: {
        ids: { type: 'string', required: true, description: 'REQUIRED. Comma-separated list of numeric inventory item IDs (max 100), e.g. "808950810,39072856".' },
        limit: { type: 'integer', description: 'Maximum number of inventory items per page (1-250, default 50).' },
      },
      async execute(args, exec) {
        if (!args.ids) {
          throw new ShopifyError('ids is required (comma-separated inventory item IDs, max 100)', 'SHOPIFY_INVALID_ARGS');
        }
        const query = defined({ ids: args.ids, limit: args.limit });
        const { items, next_page_info } = await client.list('/inventory_items', query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_inventory_item',
      title: 'Get inventory item',
      kind: 'read',
      description:
        'Gets a single inventory item by numeric REST inventory_item_id, including sku, cost, tracked, requires_shipping, country_code_of_origin, and harmonized_system_code. Returns { inventory_item }.',
      parameters: {
        inventory_item_id: { type: 'string', required: true, description: 'Numeric REST inventory item ID to fetch (string or integer).' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/inventory_items/${args.inventory_item_id}`, { signal: exec.signal });
        return { inventory_item: body.inventory_item };
      },
    },
    {
      name: 'shopify_update_inventory_item',
      title: 'Update inventory item',
      kind: 'write',
      description:
        'Updates an inventory item by numeric REST inventory_item_id. Writable keys: sku, cost, country_code_of_origin, harmonized_system_code, tracked (whether stock is tracked for this item), requires_shipping. Send only the fields to change. Note: setting tracked does not create inventory levels — connect them with shopify_connect_inventory_level. Returns { inventory_item }.',
      parameters: {
        inventory_item_id: { type: 'string', required: true, description: 'Numeric REST inventory item ID to update (string or integer).' },
        inventory_item: { type: 'json', required: true, description: 'Inventory item object with at least one field to update (e.g. { sku, cost: "25.00", tracked: true }).' },
      },
      async execute(args, exec) {
        const inventoryItem = args.inventory_item;
        if (!inventoryItem || typeof inventoryItem !== 'object' || Array.isArray(inventoryItem) || Object.keys(inventoryItem).length === 0) {
          throw new ShopifyError('inventory_item must be a JSON object with at least one field to update (sku, cost, tracked, ...)', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('PUT', `/inventory_items/${args.inventory_item_id}`, { body: { inventory_item: inventoryItem }, signal: exec.signal });
        return { inventory_item: body.inventory_item };
      },
    },
    {
      name: 'shopify_get_inventory_levels',
      title: 'Get inventory levels',
      kind: 'read',
      description:
        'Gets inventory levels (available, updated_at per location+item pair) filtered by inventory_item_ids and/or location_ids (comma-separated, max 50 each). At least one of the two is required. Levels exist only for variants with inventory tracking enabled (inventory_management set, e.g. "shopify") connected to a location. updated_at_min is ISO 8601 — align boundaries with the shop\'s iana_timezone from shopify_get_shop_details. Returns { items, count, next_page_info }.',
      parameters: {
        inventory_item_ids: { type: 'string', description: 'Comma-separated inventory item IDs to filter by (max 50). Required unless location_ids is given.' },
        location_ids: { type: 'string', description: 'Comma-separated location IDs to filter by (max 50). Required unless inventory_item_ids is given.' },
        limit: { type: 'integer', description: 'Maximum number of inventory levels per page (1-250, default 50).' },
        updated_at_min: { type: 'string', description: 'ISO 8601 lower bound on updated_at, e.g. "2024-01-01T00:00:00-05:00".' },
      },
      async execute(args, exec) {
        if (!args.inventory_item_ids && !args.location_ids) {
          throw new ShopifyError('at least one of inventory_item_ids or location_ids is required', 'SHOPIFY_INVALID_ARGS');
        }
        const query = defined({
          inventory_item_ids: args.inventory_item_ids,
          location_ids: args.location_ids,
          limit: args.limit,
          updated_at_min: args.updated_at_min,
        });
        const { items, next_page_info } = await client.list('/inventory_levels', query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_inventory_levels_for_location',
      title: 'Get inventory levels for a location',
      kind: 'read',
      description:
        'Gets all inventory levels at a single location (numeric REST location_id) — pass inventory_item_ids (comma-separated, max 50) to narrow to specific items. Only tracked variants connected to the location appear. updated_at_min is ISO 8601. Returns { items, count, next_page_info }.',
      parameters: {
        location_id: { type: 'string', required: true, description: 'Numeric REST location ID to read levels for (string or integer).' },
        inventory_item_ids: { type: 'string', description: 'Comma-separated inventory item IDs to filter by (max 50).' },
        limit: { type: 'integer', description: 'Maximum number of inventory levels per page (1-250, default 50).' },
        updated_at_min: { type: 'string', description: 'ISO 8601 lower bound on updated_at.' },
      },
      async execute(args, exec) {
        if (args.location_id === undefined || args.location_id === null || String(args.location_id).trim() === '') {
          throw new ShopifyError('location_id is required', 'SHOPIFY_INVALID_ARGS');
        }
        const query = defined({
          location_ids: [args.location_id],
          inventory_item_ids: args.inventory_item_ids,
          limit: args.limit,
          updated_at_min: args.updated_at_min,
        });
        const { items, next_page_info } = await client.list('/inventory_levels', query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_set_inventory_level',
      title: 'Set inventory level',
      kind: 'write',
      description:
        'Sets the available inventory for an inventory_item at a location to an exact absolute value (available is an integer; the level must already be connected — see shopify_connect_inventory_level). disconnect_if_necessary: true allows setting when the item is already connected to another location (disconnects it there). Prefer shopify_adjust_inventory_level when you only want a delta. Returns { inventory_level }.',
      parameters: {
        location_id: { type: 'string', required: true, description: 'Numeric REST location ID (string or integer).' },
        inventory_item_id: { type: 'string', required: true, description: 'Numeric REST inventory item ID (string or integer).' },
        available: { type: 'integer', required: true, description: 'Exact available quantity to set (integer).' },
        disconnect_if_necessary: { type: 'boolean', description: 'If true, disconnects the item from any other location it is connected to before setting (default false).' },
      },
      async execute(args, exec) {
        const { location_id, inventory_item_id } = args;
        if (location_id === undefined || inventory_item_id === undefined || args.available === undefined) {
          throw new ShopifyError('location_id, inventory_item_id, and available are required', 'SHOPIFY_INVALID_ARGS');
        }
        const available = Number(args.available);
        if (!Number.isInteger(available)) {
          throw new ShopifyError('available must be an integer', 'SHOPIFY_INVALID_ARGS');
        }
        const body = defined({
          location_id,
          inventory_item_id,
          available,
          disconnect_if_necessary: args.disconnect_if_necessary,
        });
        const result = await client.rest('POST', '/inventory_levels/set', { body, signal: exec.signal });
        return { inventory_level: result.inventory_level };
      },
    },
    {
      name: 'shopify_adjust_inventory_level',
      title: 'Adjust inventory level',
      kind: 'write',
      description:
        'Adjusts the available inventory at a location by a signed integer delta: positive available_adjustment adds stock, negative subtracts it (e.g. -2 for a two-unit sale). The item must already be connected to the location. Returns the updated { inventory_level } with the new available count.',
      parameters: {
        location_id: { type: 'string', required: true, description: 'Numeric REST location ID (string or integer).' },
        inventory_item_id: { type: 'string', required: true, description: 'Numeric REST inventory item ID (string or integer).' },
        available_adjustment: { type: 'integer', required: true, description: 'Signed integer delta: positive adds available stock, negative removes it (e.g. -2).' },
      },
      async execute(args, exec) {
        const { location_id, inventory_item_id } = args;
        if (location_id === undefined || inventory_item_id === undefined || args.available_adjustment === undefined) {
          throw new ShopifyError('location_id, inventory_item_id, and available_adjustment are required', 'SHOPIFY_INVALID_ARGS');
        }
        const availableAdjustment = Number(args.available_adjustment);
        if (!Number.isInteger(availableAdjustment)) {
          throw new ShopifyError('available_adjustment must be an integer', 'SHOPIFY_INVALID_ARGS');
        }
        const body = defined({ location_id, inventory_item_id, available_adjustment: availableAdjustment });
        const result = await client.rest('POST', '/inventory_levels/adjust', { body, signal: exec.signal });
        return { inventory_level: result.inventory_level };
      },
    },
    {
      name: 'shopify_connect_inventory_level',
      title: 'Connect inventory level',
      kind: 'write',
      description:
        "Connects an inventory item to a location, creating an inventory level for it. Required before setting/adjusting stock when the variant's inventory_management is not already set to 'shopify'. relocate_if_necessary: true moves the item's existing connection to this location. Returns { inventory_level }.",
      parameters: {
        location_id: { type: 'string', required: true, description: 'Numeric REST location ID (string or integer).' },
        inventory_item_id: { type: 'string', required: true, description: 'Numeric REST inventory item ID (string or integer).' },
        relocate_if_necessary: { type: 'boolean', description: 'If true, relocates the inventory item to this location when it is already connected elsewhere (default false).' },
      },
      async execute(args, exec) {
        const { location_id, inventory_item_id } = args;
        if (location_id === undefined || inventory_item_id === undefined) {
          throw new ShopifyError('location_id and inventory_item_id are required', 'SHOPIFY_INVALID_ARGS');
        }
        const body = defined({
          location_id,
          inventory_item_id,
          relocate_if_necessary: args.relocate_if_necessary,
        });
        const result = await client.rest('POST', '/inventory_levels/connect', { body, signal: exec.signal });
        return { inventory_level: result.inventory_level };
      },
    },
    {
      name: 'shopify_delete_inventory_level',
      title: 'Delete inventory level',
      kind: 'write',
      description:
        'Deletes the inventory level (connection) for an inventory item at a location, removing its stock there. Supply both inventory_item_id and location_id as query params. Returns { deleted: true, inventory_item_id, location_id }.',
      parameters: {
        inventory_item_id: { type: 'string', required: true, description: 'Numeric REST inventory item ID (string or integer).' },
        location_id: { type: 'string', required: true, description: 'Numeric REST location ID (string or integer).' },
      },
      async execute(args, exec) {
        if (args.inventory_item_id === undefined || args.location_id === undefined) {
          throw new ShopifyError('inventory_item_id and location_id are required', 'SHOPIFY_INVALID_ARGS');
        }
        await client.rest('DELETE', '/inventory_levels', {
          query: defined({ inventory_item_id: args.inventory_item_id, location_id: args.location_id }),
          signal: exec.signal,
        });
        return { deleted: true, inventory_item_id: args.inventory_item_id, location_id: args.location_id };
      },
    },
  ];
}

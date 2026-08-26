/**
 * Product tools: list/get/create/update/delete products, product variants, and
 * product images over the Shopify Admin REST API.
 * @module @shopify/dsh-shopify/tools/products
 */

import { ShopifyError, defined } from '../util.js';

const NUMERIC_ID_HINT =
  "Pass the numeric REST ID as a string (e.g. '8313381814466'), NOT a gid://shopify/Product/... GID — convert a GID by taking its trailing integer.";

export function tools(ctx, deps) {
  const { client } = deps;
  return [
    {
      name: 'shopify_list_products',
      title: 'List products',
      kind: 'read',
      description:
        'Lists products with optional filters. Cursor pagination: pass the previous response\'s next_page_info together with limit (and optionally fields) to fetch the next page. product IDs are numeric REST IDs, not GIDs. status filters by active|archived|draft (archived products are hidden by default); published_status is published|unpublished|any and defaults to published. created_at_*/updated_at_*/published_at_* filters take ISO 8601 timestamps — use the shop\'s iana_timezone from shopify_get_shop_details for shop-local date boundaries. Returns { items, count, next_page_info }.',
      parameters: {
        ids: { type: 'string', description: 'Comma-separated list of numeric product IDs to fetch (e.g. "8313381814466,8313381814467").' },
        limit: { type: 'integer', description: 'Maximum number of products per page (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only products after the given numeric product ID (offset-style pagination).' },
        page_info: { type: 'string', description: "Opaque cursor from a previous response's next_page_info. When present, only limit and fields may accompany it — other filters are ignored." },
        fields: { type: 'string', description: 'Comma-separated subset of product fields to return (e.g. "id,title,handle,variants") to keep the payload small.' },
        status: { type: 'string', enum: ['active', 'archived', 'draft'], description: 'Filter by product status: active (default), archived, or draft.' },
        vendor: { type: 'string', description: 'Filter by exact vendor name.' },
        product_type: { type: 'string', description: 'Filter by exact product type.' },
        collection_id: { type: 'string', description: 'Filter to products in the given collection (numeric REST collection ID).' },
        handle: { type: 'string', description: 'Filter by a single product handle (URL slug).' },
        created_at_min: { type: 'string', description: 'ISO 8601 lower bound on created_at (e.g. "2024-01-01T00:00:00-05:00").' },
        created_at_max: { type: 'string', description: 'ISO 8601 upper bound on created_at.' },
        updated_at_min: { type: 'string', description: 'ISO 8601 lower bound on updated_at.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 upper bound on updated_at.' },
        published_at_min: { type: 'string', description: 'ISO 8601 lower bound on published_at.' },
        published_at_max: { type: 'string', description: 'ISO 8601 upper bound on published_at.' },
        published_status: { type: 'string', enum: ['published', 'unpublished', 'any'], description: 'Filter by published state (default published).' },
      },
      async execute(args, exec) {
        const query = defined({
          ids: args.ids,
          limit: args.limit,
          since_id: args.since_id,
          page_info: args.page_info,
          fields: args.fields,
          status: args.status,
          vendor: args.vendor,
          product_type: args.product_type,
          collection_id: args.collection_id,
          handle: args.handle,
          created_at_min: args.created_at_min,
          created_at_max: args.created_at_max,
          updated_at_min: args.updated_at_min,
          updated_at_max: args.updated_at_max,
          published_at_min: args.published_at_min,
          published_at_max: args.published_at_max,
          published_status: args.published_status,
        });
        if (query.page_info !== undefined) {
          for (const key of Object.keys(query)) {
            if (key !== 'page_info' && key !== 'limit' && key !== 'fields') delete query[key];
          }
        }
        const { items, next_page_info } = await client.list('/products', query);
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_product',
      title: 'Get product',
      kind: 'read',
      description:
        `Gets a single product by its numeric REST product_id. ${NUMERIC_ID_HINT} fields restricts the returned attributes (comma-separated, e.g. "id,title,handle,status,variants"). Returns { product }.`,
      parameters: {
        product_id: { type: 'string', required: true, description: 'Numeric REST product ID to fetch (string or integer).' },
        fields: { type: 'string', description: 'Comma-separated subset of product fields to return.' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/products/${args.product_id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { product: body.product };
      },
    },
    {
      name: 'shopify_create_product',
      title: 'Create product',
      kind: 'write',
      description:
        'Creates a product. The `product` JSON body supports: title (required), body_html, vendor, product_type, tags (comma-separated string), status (active|archived|draft), handle, template_suffix, published, published_scope, images, options, variants, metafields. Variants supplied at creation must NOT include inventory_quantity (read-only there) — set stock afterwards with shopify_set_inventory_level. A duplicate variant SKU returns a 422. Returns { product }.',
      parameters: {
        product: { type: 'json', required: true, description: 'Product object; title is required. See tool description for supported keys.' },
      },
      async execute(args, exec) {
        const product = args.product;
        if (!product || typeof product !== 'object' || Array.isArray(product)) {
          throw new ShopifyError('product must be a JSON object (e.g. { title, body_html, vendor, ... })', 'SHOPIFY_INVALID_ARGS');
        }
        if (typeof product.title !== 'string' || product.title.trim().length === 0) {
          throw new ShopifyError('product.title is required', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('POST', '/products', { body: { product }, signal: exec.signal });
        return { product: body.product };
      },
    },
    {
      name: 'shopify_update_product',
      title: 'Update product',
      kind: 'write',
      description:
        `Updates a product by numeric REST product_id. ${NUMERIC_ID_HINT} Send only the fields you want to change in product (same keys as create; title is not required on update). Setting tags replaces the full tag list. Image and variant changes are best done through the dedicated image/variant tools. Returns { product }.`,
      parameters: {
        product_id: { type: 'string', required: true, description: 'Numeric REST product ID to update (string or integer).' },
        product: { type: 'json', required: true, description: 'Product object with at least one field to update (e.g. { title, status, tags, body_html }).' },
      },
      async execute(args, exec) {
        const product = args.product;
        if (!product || typeof product !== 'object' || Array.isArray(product) || Object.keys(product).length === 0) {
          throw new ShopifyError('product must be a JSON object with at least one field to update', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('PUT', `/products/${args.product_id}`, { body: { product }, signal: exec.signal });
        return { product: body.product };
      },
    },
    {
      name: 'shopify_delete_product',
      title: 'Delete product',
      kind: 'write',
      description:
        `Permanently deletes a product by numeric REST product_id. ${NUMERIC_ID_HINT} Products that appear in orders or fulfillments cannot be deleted — archive them (status: archived) instead. This also deletes the product's variants and images. Returns { deleted: true, product_id }.`,
      parameters: {
        product_id: { type: 'string', required: true, description: 'Numeric REST product ID to delete (string or integer).' },
      },
      async execute(args, exec) {
        await client.rest('DELETE', `/products/${args.product_id}`, { signal: exec.signal });
        return { deleted: true, product_id: args.product_id };
      },
    },
    {
      name: 'shopify_count_products',
      title: 'Count products',
      kind: 'read',
      description:
        'Counts products matching the given filters — cheaper than listing when only a number is needed. Same filter semantics as shopify_list_products (status, vendor, product_type, collection_id, date ranges, published_status) but no pagination. Date filters are ISO 8601; align day boundaries with the shop\'s iana_timezone from shopify_get_shop_details. Returns { count }.',
      parameters: {
        status: { type: 'string', enum: ['active', 'archived', 'draft'], description: 'Filter by product status: active (default), archived, or draft.' },
        vendor: { type: 'string', description: 'Filter by exact vendor name.' },
        product_type: { type: 'string', description: 'Filter by exact product type.' },
        collection_id: { type: 'string', description: 'Filter to products in the given collection (numeric REST collection ID).' },
        created_at_min: { type: 'string', description: 'ISO 8601 lower bound on created_at.' },
        created_at_max: { type: 'string', description: 'ISO 8601 upper bound on created_at.' },
        updated_at_min: { type: 'string', description: 'ISO 8601 lower bound on updated_at.' },
        updated_at_max: { type: 'string', description: 'ISO 8601 upper bound on updated_at.' },
        published_at_min: { type: 'string', description: 'ISO 8601 lower bound on published_at.' },
        published_at_max: { type: 'string', description: 'ISO 8601 upper bound on published_at.' },
        published_status: { type: 'string', enum: ['published', 'unpublished', 'any'], description: 'Filter by published state (default published).' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', '/products/count', {
          query: defined({
            status: args.status,
            vendor: args.vendor,
            product_type: args.product_type,
            collection_id: args.collection_id,
            created_at_min: args.created_at_min,
            created_at_max: args.created_at_max,
            updated_at_min: args.updated_at_min,
            updated_at_max: args.updated_at_max,
            published_at_min: args.published_at_min,
            published_at_max: args.published_at_max,
            published_status: args.published_status,
          }),
          signal: exec.signal,
        });
        return { count: body.count };
      },
    },
    {
      name: 'shopify_list_product_variants',
      title: 'List product variants',
      kind: 'read',
      description:
        'Lists all variants of a product by numeric REST product_id. presentment_currencies is a comma-separated list of currency codes (e.g. "USD,CAD") that adds per-currency price fields. Use shopify_list_products with fields="id,variants" to fetch variants together with their product. Returns { items, count, next_page_info }.',
      parameters: {
        product_id: { type: 'string', required: true, description: 'Numeric REST product ID whose variants to list (string or integer).' },
        limit: { type: 'integer', description: 'Maximum number of variants per page (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only variants after the given numeric variant ID.' },
        fields: { type: 'string', description: 'Comma-separated subset of variant fields to return (e.g. "id,title,sku,price").' },
        presentment_currencies: { type: 'string', description: 'Comma-separated currency codes (e.g. "USD,CAD") for per-currency price fields.' },
      },
      async execute(args, exec) {
        const { items, next_page_info } = await client.list(`/products/${args.product_id}/variants`, defined({
          limit: args.limit,
          since_id: args.since_id,
          fields: args.fields,
          presentment_currencies: args.presentment_currencies,
        }));
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_product_variant',
      title: 'Get product variant',
      kind: 'read',
      description:
        "Gets a single variant by its numeric REST variant_id — the trailing integer of a gid://shopify/ProductVariant/... GID. fields restricts the returned attributes (e.g. \"id,title,sku,price,inventory_quantity\"). Returns { variant }.",
      parameters: {
        variant_id: { type: 'string', required: true, description: 'Numeric REST variant ID to fetch (string or integer).' },
        fields: { type: 'string', description: 'Comma-separated subset of variant fields to return.' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/variants/${args.variant_id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { variant: body.variant };
      },
    },
    {
      name: 'shopify_create_product_variant',
      title: 'Create product variant',
      kind: 'write',
      description:
        'Creates a variant on a product by numeric REST product_id. Variant keys: price, option1..option3, sku, barcode, weight, weight_unit, taxable, requires_shipping, inventory_management, inventory_policy, compare_at_price. inventory_quantity is read-only at creation — set stock afterwards with shopify_set_inventory_level. A duplicate SKU across variants returns a 422. Returns { variant }.',
      parameters: {
        product_id: { type: 'string', required: true, description: 'Numeric REST product ID to add the variant to (string or integer).' },
        variant: { type: 'json', required: true, description: 'Variant object with at least one field (e.g. { price: "19.99", option1: "Small", sku: "SHIRT-S" }).' },
      },
      async execute(args, exec) {
        const variant = args.variant;
        if (!variant || typeof variant !== 'object' || Array.isArray(variant) || Object.keys(variant).length === 0) {
          throw new ShopifyError('variant must be a JSON object with at least one field (e.g. price, sku, option1)', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('POST', `/products/${args.product_id}/variants`, { body: { variant }, signal: exec.signal });
        return { variant: body.variant };
      },
    },
    {
      name: 'shopify_update_product_variant',
      title: 'Update product variant',
      kind: 'write',
      description:
        "Updates a variant by numeric REST variant_id (not a GID). Same writable keys as create; send only the fields to change. Changing sku to one already used by another variant returns a 422. price is a decimal string like '19.99'. To change inventory levels use shopify_set_inventory_level or shopify_adjust_inventory_level instead. Returns { variant }.",
      parameters: {
        variant_id: { type: 'string', required: true, description: 'Numeric REST variant ID to update (string or integer).' },
        variant: { type: 'json', required: true, description: 'Variant object with at least one field to update (e.g. { price, sku, option1 }).' },
      },
      async execute(args, exec) {
        const variant = args.variant;
        if (!variant || typeof variant !== 'object' || Array.isArray(variant) || Object.keys(variant).length === 0) {
          throw new ShopifyError('variant must be a JSON object with at least one field to update', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('PUT', `/variants/${args.variant_id}`, { body: { variant }, signal: exec.signal });
        return { variant: body.variant };
      },
    },
    {
      name: 'shopify_delete_product_variant',
      title: 'Delete product variant',
      kind: 'write',
      description:
        "Permanently deletes a variant by numeric REST variant_id. A product must keep at least one variant — deleting the last one fails. Variants referenced by orders cannot be deleted. Returns { deleted: true, variant_id }.",
      parameters: {
        variant_id: { type: 'string', required: true, description: 'Numeric REST variant ID to delete (string or integer).' },
      },
      async execute(args, exec) {
        await client.rest('DELETE', `/variants/${args.variant_id}`, { signal: exec.signal });
        return { deleted: true, variant_id: args.variant_id };
      },
    },
    {
      name: 'shopify_list_product_images',
      title: 'List product images',
      kind: 'read',
      description:
        'Lists all images of a product by numeric REST product_id. Query: limit, since_id, fields. Use shopify_list_products with fields="id,images" to fetch images together with their product. Returns { items, count, next_page_info }.',
      parameters: {
        product_id: { type: 'string', required: true, description: 'Numeric REST product ID whose images to list (string or integer).' },
        limit: { type: 'integer', description: 'Maximum number of images per page (1-250, default 50).' },
        since_id: { type: 'string', description: 'Return only images after the given numeric image ID.' },
        fields: { type: 'string', description: 'Comma-separated subset of image fields to return (e.g. "id,src,alt,position").' },
      },
      async execute(args, exec) {
        const { items, next_page_info } = await client.list(`/products/${args.product_id}/images`, defined({
          limit: args.limit,
          since_id: args.since_id,
          fields: args.fields,
        }));
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_create_product_image',
      title: 'Create product image',
      kind: 'write',
      description:
        "Adds an image to a product by numeric REST product_id. Provide `image.src` (a public HTTPS URL Shopify can fetch) OR `image.attachment` (base64-encoded image data) — exactly one is required. Also supports position, alt, and variant_ids (numeric REST variant IDs to attach the image to). Returns { image }.",
      parameters: {
        product_id: { type: 'string', required: true, description: 'Numeric REST product ID to add the image to (string or integer).' },
        image: { type: 'json', required: true, description: 'Image object with src (public HTTPS URL) or attachment (base64), plus optional position, alt, variant_ids.' },
      },
      async execute(args, exec) {
        const image = args.image;
        if (!image || typeof image !== 'object' || Array.isArray(image)) {
          throw new ShopifyError('image must be a JSON object with either src (public HTTPS URL) or attachment (base64)', 'SHOPIFY_INVALID_ARGS');
        }
        if (!image.src && !image.attachment) {
          throw new ShopifyError('image requires exactly one of src (public HTTPS URL) or attachment (base64-encoded image data)', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('POST', `/products/${args.product_id}/images`, { body: { image }, signal: exec.signal });
        return { image: body.image };
      },
    },
    {
      name: 'shopify_update_product_image',
      title: 'Update product image',
      kind: 'write',
      description:
        `Updates an existing product image by numeric REST product_id and image_id (not GIDs). Writable keys: position, alt, variant_ids, src. Send only the fields to change. Returns { image }.`,
      parameters: {
        product_id: { type: 'string', required: true, description: 'Numeric REST product ID that owns the image (string or integer).' },
        image_id: { type: 'string', required: true, description: 'Numeric REST image ID to update (string or integer).' },
        image: { type: 'json', required: true, description: 'Image object with at least one field to update (position, alt, variant_ids, or src).' },
      },
      async execute(args, exec) {
        const image = args.image;
        if (!image || typeof image !== 'object' || Array.isArray(image) || Object.keys(image).length === 0) {
          throw new ShopifyError('image must be a JSON object with at least one field to update', 'SHOPIFY_INVALID_ARGS');
        }
        const body = await client.rest('PUT', `/products/${args.product_id}/images/${args.image_id}`, { body: { image }, signal: exec.signal });
        return { image: body.image };
      },
    },
    {
      name: 'shopify_delete_product_image',
      title: 'Delete product image',
      kind: 'write',
      description:
        `Permanently deletes an image from a product by numeric REST product_id and image_id. Deleting an image removes it from every variant that referenced it. Returns { deleted: true, image_id }.`,
      parameters: {
        product_id: { type: 'string', required: true, description: 'Numeric REST product ID that owns the image (string or integer).' },
        image_id: { type: 'string', required: true, description: 'Numeric REST image ID to delete (string or integer).' },
      },
      async execute(args, exec) {
        await client.rest('DELETE', `/products/${args.product_id}/images/${args.image_id}`, { signal: exec.signal });
        return { deleted: true, image_id: args.image_id };
      },
    },
  ];
}

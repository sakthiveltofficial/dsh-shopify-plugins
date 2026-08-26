/**
 * Theme tools: list, get, create, update, delete, and asset management
 * (list, get, create-or-update, delete).
 * @module @shopify/dsh-shopify/tools/themes
 */

import { ShopifyError, defined } from '../util.js';

export function tools(ctx, deps) {
  const { client } = deps;
  return [
    {
      name: 'shopify_list_themes',
      title: 'List themes',
      kind: 'read',
      description:
        "Lists all themes in the shop. Each theme has id (numeric string), name, role ('main' = live theme, 'unpublished', 'development'), and updated_at. Use role to find the live theme before editing assets; theme IDs are numeric strings passed straight to the other theme tools.",
      parameters: {
        fields: { type: 'string', description: 'Comma-separated list of theme fields to include, e.g. "id,name,role".' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', '/themes', {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { themes: body.themes ?? [] };
      },
    },
    {
      name: 'shopify_get_theme',
      title: 'Get theme',
      kind: 'read',
      description:
        'Gets a single theme by its numeric ID (string or integer accepted). Confirms the theme role/name before you modify or delete it, e.g. verify you are not targeting the live (main) theme.',
      parameters: {
        theme_id: { type: 'string', required: true, description: 'Numeric theme ID (string or integer).' },
        fields: { type: 'string', description: 'Comma-separated list of theme fields to include, e.g. "id,name,role".' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/themes/${args.theme_id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { theme: body.theme };
      },
    },
    {
      name: 'shopify_create_theme',
      title: 'Create theme',
      kind: 'write',
      description:
        'Creates a theme. REQUIRED: name (max 50 chars). src may be a public ZIP URL of a theme to import; role is main | unpublished | development. WARNING: role=main publishes the theme immediately, replacing the current live theme for all visitors — only use it when that is intended (otherwise use unpublished and publish later).',
      parameters: {
        name: { type: 'string', required: true, description: 'Theme name, max 50 characters.' },
        src: { type: 'string', description: 'Public URL of a theme ZIP file to import as this theme\'s content.' },
        role: { type: 'string', enum: ['main', 'unpublished', 'development'], description: 'Theme role. WARNING: main publishes immediately.' },
      },
      async execute(args, exec) {
        const theme = defined({ name: args.name, src: args.src, role: args.role });
        const body = await client.rest('POST', '/themes', { body: { theme }, signal: exec.signal });
        return { theme: body.theme };
      },
    },
    {
      name: 'shopify_update_theme',
      title: 'Update theme',
      kind: 'write',
      description:
        'Updates a theme\'s name and/or role. Changing role to "main" publishes that theme immediately (it becomes the live theme); switching the live theme away from "main" unpublishes it. Only pass the fields you want to change.',
      parameters: {
        theme_id: { type: 'string', required: true, description: 'Numeric theme ID (string or integer).' },
        name: { type: 'string', description: 'New theme name, max 50 characters.' },
        role: { type: 'string', enum: ['main', 'unpublished', 'development'], description: 'New theme role. WARNING: main publishes immediately.' },
      },
      async execute(args, exec) {
        const theme = defined({ name: args.name, role: args.role });
        const body = await client.rest('PUT', `/themes/${args.theme_id}`, { body: { theme }, signal: exec.signal });
        return { theme: body.theme };
      },
    },
    {
      name: 'shopify_delete_theme',
      title: 'Delete theme',
      kind: 'write',
      description:
        'Deletes a theme by its numeric ID. Irreversible. Shopify rejects deleting the last published (main) theme and themes that are currently being processed (e.g. during upload). Confirm with the user before deleting.',
      parameters: {
        theme_id: { type: 'string', required: true, description: 'Numeric theme ID (string or integer) to delete.' },
      },
      async execute(args, exec) {
        await client.rest('DELETE', `/themes/${args.theme_id}`, { signal: exec.signal });
        return { deleted: true, theme_id: args.theme_id };
      },
    },
    {
      name: 'shopify_list_theme_assets',
      title: 'List theme assets',
      kind: 'read',
      description:
        "Lists the assets of a theme (templates/*.liquid, sections/*.liquid, assets/*.{css,js,png}, config/settings_data.json, locales/*.json, ...). Pass asset_key to fetch a single asset's content directly, or fields to trim the output. To edit an asset use shopify_create_or_update_theme_asset.",
      parameters: {
        theme_id: { type: 'string', required: true, description: 'Numeric theme ID (string or integer).' },
        fields: { type: 'string', description: 'Comma-separated list of asset fields to include, e.g. "key,value,attachment".' },
        asset_key: { type: 'string', description: "Return a single asset by its key instead of the whole list, e.g. 'templates/index.liquid'." },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/themes/${args.theme_id}/assets`, {
          query: defined({ fields: args.fields, asset_key: args.asset_key }),
          signal: exec.signal,
        });
        return { assets: body.assets ?? [] };
      },
    },
    {
      name: 'shopify_get_theme_asset',
      title: 'Get theme asset',
      kind: 'read',
      description:
        "Gets one theme asset by key (REQUIRED), e.g. 'templates/index.liquid' or 'assets/custom.css'. Returns the asset's key, value (text content for templates/CSS/JS/JSON), and/or attachment (base64 for binary files). Use this to read a template before editing it.",
      parameters: {
        theme_id: { type: 'string', required: true, description: 'Numeric theme ID (string or integer).' },
        asset_key: { type: 'string', required: true, description: "Asset key, e.g. 'templates/index.liquid', 'assets/custom.css'." },
        fields: { type: 'string', description: 'Comma-separated list of asset fields to include, e.g. "key,value".' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/themes/${args.theme_id}/assets`, {
          query: defined({ asset_key: args.asset_key, fields: args.fields }),
          signal: exec.signal,
        });
        return { asset: body.asset };
      },
    },
    {
      name: 'shopify_create_or_update_theme_asset',
      title: 'Create or update theme asset',
      kind: 'write',
      description:
        "Creates a new asset or replaces an existing one in a theme (PUT semantics — no separate create/update tools). REQUIRED: theme_id, key (asset path, e.g. 'templates/index.liquid', 'assets/custom.css'), and EXACTLY ONE content source: value (plain text for templates/CSS/JS/JSON), src (public HTTPS URL to fetch from), attachment (base64-encoded content for binary files), or source_key (key of an existing asset to duplicate). Changes appear immediately on preview; the live store only changes when the theme's role is 'main'.",
      parameters: {
        theme_id: { type: 'string', required: true, description: 'Numeric theme ID (string or integer).' },
        key: { type: 'string', required: true, description: "Asset key/path, e.g. 'templates/index.liquid', 'assets/custom.css', 'config/settings_data.json'." },
        value: { type: 'string', description: 'Plain-text content of the asset (use for templates, CSS, JS, JSON files).' },
        src: { type: 'string', description: 'Public HTTPS URL whose content becomes the asset.' },
        attachment: { type: 'string', description: 'Base64-encoded content of the asset (use for binary files such as images).' },
        source_key: { type: 'string', description: 'Key of an existing asset in the same theme to duplicate as the content source.' },
      },
      async execute(args, exec) {
        const provided = ['value', 'src', 'attachment', 'source_key'].filter(
          (key) => args[key] !== undefined && args[key] !== null,
        );
        if (provided.length !== 1) {
          throw new ShopifyError('exactly one of value, src, attachment, or source_key must be provided', 'SHOPIFY_INVALID_ARGS');
        }
        const asset = defined({
          key: args.key,
          value: args.value,
          src: args.src,
          attachment: args.attachment,
          source_key: args.source_key,
        });
        const body = await client.rest('PUT', `/themes/${args.theme_id}/assets`, {
          body: { asset },
          signal: exec.signal,
        });
        return { asset: body.asset };
      },
    },
    {
      name: 'shopify_delete_theme_asset',
      title: 'Delete theme asset',
      kind: 'write',
      description:
        "Deletes an asset from a theme by its key (REQUIRED), e.g. 'assets/custom.css'. Irreversible — the file is removed from the theme; if the theme is live (role 'main') the change is visible to visitors immediately. Confirm with the user before deleting.",
      parameters: {
        theme_id: { type: 'string', required: true, description: 'Numeric theme ID (string or integer).' },
        asset_key: { type: 'string', required: true, description: "Asset key to delete, e.g. 'assets/custom.css'." },
      },
      async execute(args, exec) {
        await client.rest('DELETE', `/themes/${args.theme_id}/assets`, {
          query: defined({ asset_key: args.asset_key }),
          signal: exec.signal,
        });
        return { deleted: true, asset_key: args.asset_key };
      },
    },
  ];
}

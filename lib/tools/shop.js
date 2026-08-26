/**
 * Shop tools: shop details, policies, currencies, shipping zones, countries,
 * country provinces, OAuth access scopes, and a GraphQL shop query.
 * @module @shopify/dsh-shopify/tools/shop
 */

import { defined } from '../util.js';

export function tools(ctx, deps) {
  const { client } = deps;
  return [
    {
      name: 'shopify_get_shop_details',
      title: 'Get shop details',
      kind: 'read',
      description:
        "Gets the shop's record: id, name, email, myshopify_domain, domain, shop_owner, address fields, iana_timezone, currency, money formats, plan_name, etc. iana_timezone is critical for building correct date-based filters (created_at_*/updated_at_* ISO 8601 boundaries) in other tools. A successful response also confirms the access token and scopes are valid — use it as a connection check. fields restricts the returned attributes (comma-separated). Returns { shop }.",
      parameters: {
        fields: { type: 'string', description: 'Comma-separated subset of shop fields to return (e.g. "id,name,email,iana_timezone,currency,plan_name").' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', '/shop', {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { shop: body.shop };
      },
    },
    {
      name: 'shopify_get_policies',
      title: 'Get shop policies',
      kind: 'read',
      description:
        "Gets the shop's store policies: refund_policy, privacy_policy, terms_of_service, and shipping_policy, each with body, title, url, and created/updated timestamps. Policies are optional — absent ones are omitted from the response. Useful before writing policy-related copy or for compliance checks. Returns { policies }.",
      parameters: {},
      async execute(args, exec) {
        const body = await client.rest('GET', '/policies', { signal: exec.signal });
        return { policies: body.policies };
      },
    },
    {
      name: 'shopify_list_currencies',
      title: 'List currencies',
      kind: 'read',
      description:
        "Lists the currencies enabled on the shop: currency, rate_updated_at, and enabled flag for each. Use this to discover which currency codes are valid for price fields and presentment_currencies on other tools (e.g. 'USD', 'CAD'). Returns { currencies }.",
      parameters: {},
      async execute(args, exec) {
        const body = await client.rest('GET', '/currencies', { signal: exec.signal });
        return { currencies: body.currencies };
      },
    },
    {
      name: 'shopify_get_shipping_zones',
      title: 'Get shipping zones',
      kind: 'read',
      description:
        "Gets all shipping zones configured on the shop, including each zone's countries, provinces, and price-based/weight-based shipping rates (rate name, price, conditions). Useful for quoting shipping costs or auditing zone coverage before orders. fields restricts the returned attributes (comma-separated). Returns { shipping_zones }.",
      parameters: {
        fields: { type: 'string', description: 'Comma-separated subset of shipping zone fields to return (e.g. "id,name,countries,weight_based_shipping_rates,price_based_shipping_rates").' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', '/shipping_zones', {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { shipping_zones: body.shipping_zones };
      },
    },
    {
      name: 'shopify_list_countries',
      title: 'List countries',
      kind: 'read',
      description:
        "Lists the countries in the shop's shipping zones, including each country's id, name, code, tax, and provinces (with province codes). Use the numeric REST country id with shopify_get_country or shopify_get_country_provinces. Pagination: since_id offset-style. Returns { items, count, next_page_info }.",
      parameters: {
        fields: { type: 'string', description: 'Comma-separated subset of country fields to return (e.g. "id,name,code,tax,provinces").' },
        since_id: { type: 'string', description: 'Return only countries after the given numeric country ID (offset-style pagination).' },
      },
      async execute(args, exec) {
        const { items, next_page_info } = await client.list('/countries', defined({
          fields: args.fields,
          since_id: args.since_id,
        }));
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_country',
      title: 'Get country',
      kind: 'read',
      description:
        "Gets a single country by its numeric REST country_id (from shopify_list_countries), including its provinces with codes and tax settings. fields restricts the returned attributes (comma-separated). Returns { country }.",
      parameters: {
        country_id: { type: 'string', required: true, description: 'Numeric REST country ID to fetch (string or integer).' },
        fields: { type: 'string', description: 'Comma-separated subset of country fields to return.' },
      },
      async execute(args, exec) {
        const body = await client.rest('GET', `/countries/${args.country_id}`, {
          query: defined({ fields: args.fields }),
          signal: exec.signal,
        });
        return { country: body.country };
      },
    },
    {
      name: 'shopify_get_country_provinces',
      title: 'Get country provinces',
      kind: 'read',
      description:
        "Lists the provinces/states of a country by numeric REST country_id (e.g. US states with their codes like 'CA'). Useful for building address forms or validating shipping addresses. Pagination: since_id offset-style. Returns { items, count, next_page_info }.",
      parameters: {
        country_id: { type: 'string', required: true, description: 'Numeric REST country ID whose provinces to list (string or integer).' },
        fields: { type: 'string', description: 'Comma-separated subset of province fields to return (e.g. "id,name,code,tax").' },
        since_id: { type: 'string', description: 'Return only provinces after the given numeric province ID (offset-style pagination).' },
      },
      async execute(args, exec) {
        const { items, next_page_info } = await client.list(`/countries/${args.country_id}/provinces`, defined({
          fields: args.fields,
          since_id: args.since_id,
        }));
        return { items, count: items.length, next_page_info };
      },
    },
    {
      name: 'shopify_get_access_scopes',
      title: 'Get access scopes',
      kind: 'read',
      description:
        "Lists the OAuth scopes granted to the current access token (e.g. read_products, write_orders). Use it to verify whether the token can perform the operations an agent is about to attempt, or to diagnose a 403. Returns { scopes }.",
      parameters: {},
      async execute(args, exec) {
        const body = await client.rest('GET', '/oauth/access_scopes', { signal: exec.signal });
        return { scopes: body.scopes };
      },
    },
    {
      name: 'shopify_query_shop',
      title: 'Query shop (GraphQL)',
      kind: 'read',
      description:
        "Runs a GraphQL query on the shop root object. With no fields it returns id, name, email, myshopifyDomain, currencyCode, ianaTimezone, timezoneOffset — the timezone fields are needed to interpret date-based REST filters correctly. Pass fields as a space-separated GraphQL selection, e.g. \"name email myshopifyDomain currencyCode plan { displayName } billingAddress { country }\". Returns { data } — read data.shop for the result.",
      parameters: {
        fields: { type: 'string', description: 'Space-separated GraphQL field selection for the shop object (e.g. "name email myshopifyDomain currencyCode"); defaults to "id name email myshopifyDomain currencyCode ianaTimezone timezoneOffset".' },
      },
      async execute(args, exec) {
        const document = args.fields
          ? `{ shop { ${args.fields} } }`
          : '{ shop { id name email myshopifyDomain currencyCode ianaTimezone timezoneOffset } }';
        const body = await client.graphql(document);
        return { data: body.data };
      },
    },
  ];
}

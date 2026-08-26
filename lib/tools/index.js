/**
 * Aggregates every Shopify tool module into one registration pass.
 * @module @shopify/dsh-shopify/tools
 */

import { registerTools } from '../tools.js';
import * as products from './products.js';
import * as collections from './collections.js';
import * as orders from './orders.js';
import * as draftOrders from './draft_orders.js';
import * as customers from './customers.js';
import * as shop from './shop.js';
import * as inventory from './inventory.js';
import * as fulfillments from './fulfillments.js';
import * as discounts from './discounts.js';
import * as content from './content.js';
import * as metafields from './metafields.js';
import * as webhooks from './webhooks.js';
import * as themes from './themes.js';
import * as marketing from './marketing.js';
import * as giftCards from './gift_cards.js';
import * as redirects from './redirects.js';
import * as scriptTags from './script_tags.js';
import * as billing from './billing.js';
import * as misc from './misc.js';
import * as graphql from './graphql.js';
import * as bulk from './bulk.js';

const MODULES = [
  products, collections, orders, draftOrders, customers, shop, inventory,
  fulfillments, discounts, content, metafields, webhooks, themes, marketing,
  giftCards, redirects, scriptTags, billing, misc, graphql, bulk,
];

/** Register every Shopify tool into `ctx.tools`. Returns the registered count. */
export function registerAll(ctx, deps) {
  let count = 0;
  for (const mod of MODULES) {
    const tools = mod.tools(ctx, deps);
    registerTools(ctx, deps, tools);
    count += tools.length;
  }
  return count;
}

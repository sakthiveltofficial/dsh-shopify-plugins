/**
 * Tool factory for the Shopify plugin.
 *
 * Wraps `defineTool` from `@deepseek-ai/dsh-tools` so every Shopify tool
 * shares one shape: spec-form parameters, JSON-object output rendering, and a
 * generic pending-call card. Tool modules build specs and call
 * {@link shopifyTool}.
 * @module @shopify/dsh-shopify/tools
 */

import { defineTool } from '@deepseek-ai/dsh-tools';
import { jsonObjectOutput, presentCall } from './util.js';

/**
 * Build one registered model tool.
 * @param spec - { name, description, parameters, execute, title?, kind?, output? }
 */
export function shopifyTool(spec) {
  const { name, description, parameters, execute, title, kind = 'other', output } = spec;
  return defineTool({
    name,
    description,
    parameters,
    output: output ?? jsonObjectOutput(),
    execute(args, exec) {
      return Promise.resolve(execute(args, exec));
    },
    presentCall: (args) => presentCall(title ?? name, kind, args),
  });
}

/** Register every tool returned by a module's `tools(ctx, deps)` list. */
export function registerTools(ctx, deps, tools) {
  for (const tool of tools) {
    ctx.tools.register(shopifyTool(tool));
  }
}

/** True when a REST list response has a next page cursor. */
export function hasNextPage(nextPageInfo) {
  return Boolean(nextPageInfo);
}

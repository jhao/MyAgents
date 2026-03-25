// OpenClaw plugin-sdk/channel-config-schema shim for MyAgents Plugin Bridge
// Provides buildChannelConfigSchema() — converts Zod schema to JSON Schema (or passes through).

/**
 * Build a channel config schema from a Zod schema or plain object.
 * In real OpenClaw: zod → JSON Schema (draft-07) via toJSONSchema().
 * Our shim: if the schema has a toJSONSchema method, use it; otherwise treat
 * as a JSON Schema passthrough (or generic object).
 */
export function buildChannelConfigSchema(schema) {
  if (!schema) return { type: 'object', properties: {} };
  // Zod schema: call .toJSONSchema() if available (zod v4+)
  if (typeof schema.toJSONSchema === 'function') {
    try { return schema.toJSONSchema(); } catch { /* fall through */ }
  }
  // Zod schema: try zodToJsonSchema adapter (zod v3 via zod-to-json-schema)
  if (typeof schema._def === 'object') {
    // Minimal Zod → JSON Schema: just wrap as generic object
    return { type: 'object', additionalProperties: true };
  }
  // Already a JSON Schema object (plain object passthrough)
  if (typeof schema === 'object' && schema.type) return schema;
  return { type: 'object', properties: {} };
}

/**
 * Build a catch-all multi-account channel schema.
 * In real OpenClaw: wraps a per-account Zod schema in a record.
 * Our shim: passthrough — MyAgents handles multi-account via its own config.
 */
export function buildCatchallMultiAccountChannelSchema(accountSchema) {
  return accountSchema;
}

/**
 * Build nested DM config schema.
 * Returns a minimal config shape for DM policy.
 */
export function buildNestedDmConfigSchema() {
  return { type: 'object', properties: {
    enabled: { type: 'boolean' },
    policy: { type: 'string' },
    allowFrom: { type: 'array', items: { type: ['string', 'number'] } },
  }};
}

// Zod schema stubs for plugins that import them
export const AllowFromListSchema = undefined;
export const DmPolicySchema = undefined;
export const GroupPolicySchema = undefined;
export const MarkdownConfigSchema = undefined;
export const ToolPolicySchema = undefined;

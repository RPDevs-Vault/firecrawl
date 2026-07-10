import { and, desc, eq, lt, or } from "drizzle-orm";
import * as schema from "../../db/schema";

export const MCP_ACTION_LOG_STATUSES = ["started", "success", "error"] as const;
export type McpActionLogStatus = (typeof MCP_ACTION_LOG_STATUSES)[number];

const MCP_ACTION_LOG_AUTH_TYPES = ["oauth", "api-key", "keyless", "unknown"] as const;
export type McpActionLogAuthType = (typeof MCP_ACTION_LOG_AUTH_TYPES)[number];

export class McpActionLogValidationError extends Error {}

const MCP_ACTION_LOG_FIELD_LIMITS = {
  oauth_client_id: 128,
  tool_name: 128,
  request_id: 256,
  user_agent: 512,
  client_name: 128,
  client_version: 128,
  error_class: 128,
  resource: 512,
} as const;

const SECRET_LIKE_METADATA_PATTERN =
  /(?:\bBearer\s+[^\s]+|\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b|\bsk-[A-Za-z0-9_-]+|\bfc-[A-Za-z0-9_-]+|\bfco_[A-Za-z0-9_-]+|\bfcr_[A-Za-z0-9_-]+)/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validationError(message: string): never {
  throw new McpActionLogValidationError(message);
}

function normalizeMetadataString(
  value: unknown,
  fieldName: keyof typeof MCP_ACTION_LOG_FIELD_LIMITS,
  options: { required?: boolean; dropSecretLike?: boolean } = {},
): string | null {
  if (typeof value !== "string") {
    if (options.required) validationError(`${fieldName} is required`);
    return null;
  }
  const normalized = value.trim();
  if (!normalized) {
    if (options.required) validationError(`${fieldName} is required`);
    return null;
  }
  const maxLength = MCP_ACTION_LOG_FIELD_LIMITS[fieldName];
  if (normalized.length > maxLength) {
    validationError(`${fieldName} must be at most ${maxLength} characters`);
  }
  if (/[\u0000-\u001F\u007F]/.test(normalized)) {
    validationError(`${fieldName} must not contain control characters`);
  }
  if (SECRET_LIKE_METADATA_PATTERN.test(normalized)) {
    if (options.dropSecretLike && !options.required) return null;
    validationError(`${fieldName} must not contain secret-like values`);
  }
  return normalized;
}

function normalizeOptionalMetadataString(
  value: unknown,
  fieldName: keyof typeof MCP_ACTION_LOG_FIELD_LIMITS,
): string | null {
  return normalizeMetadataString(value, fieldName, { dropSecretLike: true });
}

function normalizeRequiredMetadataString(
  value: unknown,
  fieldName: keyof typeof MCP_ACTION_LOG_FIELD_LIMITS,
): string {
  return normalizeMetadataString(value, fieldName, { required: true })!;
}

function normalizeUuid(value: unknown, fieldName: "team_id" | "user_id", required: boolean) {
  if (typeof value !== "string" || value.trim() === "") {
    if (required) validationError(`${fieldName} is required`);
    return null;
  }
  const normalized = value.trim();
  if (!UUID_PATTERN.test(normalized)) {
    validationError(`${fieldName} must be a valid UUID`);
  }
  return normalized;
}

function normalizeApiKeyId(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    validationError("api_key_id must be a positive integer");
  }
  return value;
}

function normalizeAuthType(value: unknown): McpActionLogAuthType {
  if (typeof value !== "string") validationError("auth_type is required");
  if (!MCP_ACTION_LOG_AUTH_TYPES.includes(value as McpActionLogAuthType)) {
    validationError("auth_type must be oauth, api-key, keyless, or unknown");
  }
  return value as McpActionLogAuthType;
}

export type McpActionLogInput = {
  team_id: string;
  user_id?: string | null;
  api_key_id?: number | null;
  oauth_client_id?: string | null;
  auth_type: McpActionLogAuthType;
  tool_name: string;
  status: McpActionLogStatus;
  request_id?: string | null;
  user_agent?: string | null;
  client_name?: string | null;
  client_version?: string | null;
  error_class?: string | null;
  resource?: string | null;
};

const UNSAFE_FIELDS = new Set([
  "api_key",
  "token",
  "authorization",
  "bearer",
  "args",
  "arguments",
  "params",
  "body",
  "request_body",
  "response_body",
  "url",
  "urls",
  "raw_url",
  "raw_ip",
  "client_ip",
  "ip",
  "error",
  "error_message",
]);

export function assertSafeMcpActionLogPayload(
  payload: Record<string, unknown>,
) {
  for (const key of Object.keys(payload)) {
    if (UNSAFE_FIELDS.has(key.toLowerCase())) {
      throw new Error(`Unsafe MCP action log field: ${key}`);
    }
  }
}

export function normalizeMcpActionLogInput(
  payload: Record<string, unknown>,
): McpActionLogInput {
  const teamId = normalizeUuid(payload.team_id, "team_id", true)!;
  const toolName = normalizeRequiredMetadataString(payload.tool_name, "tool_name");
  const status = payload.status;
  if (!MCP_ACTION_LOG_STATUSES.includes(status as McpActionLogStatus)) {
    validationError("status must be started, success, or error");
  }

  return {
    team_id: teamId,
    user_id: normalizeUuid(payload.user_id, "user_id", false),
    api_key_id: normalizeApiKeyId(payload.api_key_id),
    oauth_client_id: normalizeOptionalMetadataString(
      payload.oauth_client_id,
      "oauth_client_id",
    ),
    auth_type: normalizeAuthType(payload.auth_type),
    tool_name: toolName,
    status: status as McpActionLogStatus,
    request_id: normalizeOptionalMetadataString(
      payload.request_id,
      "request_id",
    ),
    user_agent: normalizeOptionalMetadataString(
      payload.user_agent,
      "user_agent",
    ),
    client_name: normalizeOptionalMetadataString(
      payload.client_name,
      "client_name",
    ),
    client_version: normalizeOptionalMetadataString(
      payload.client_version,
      "client_version",
    ),
    error_class: normalizeOptionalMetadataString(
      payload.error_class,
      "error_class",
    ),
    resource: normalizeOptionalMetadataString(payload.resource, "resource"),
  };
}

export async function recordMcpActionLog(db: any, input: McpActionLogInput) {
  const rows = await db
    .insert(schema.mcp_action_logs)
    .values({
      team_id: input.team_id,
      user_id: input.user_id ?? null,
      api_key_id: input.api_key_id ?? null,
      oauth_client_id: input.oauth_client_id ?? null,
      auth_type: input.auth_type,
      tool_name: input.tool_name,
      status: input.status,
      request_id: input.request_id ?? null,
      user_agent: input.user_agent ?? null,
      client_name: input.client_name ?? null,
      client_version: input.client_version ?? null,
      error_class: input.error_class ?? null,
      resource: input.resource ?? null,
    })
    .returning({
      id: schema.mcp_action_logs.id,
      created_at: schema.mcp_action_logs.created_at,
    });

  return rows[0] ?? null;
}

export type McpActionLogListOptions = {
  limit?: number;
  cursor?: string | null;
  viewerUserId?: string | null;
  isTeamAdmin?: boolean;
};

export function encodeMcpActionLogCursor(row: { created_at: Date | string; id: string }) {
  const createdAt = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  return Buffer.from(JSON.stringify({ created_at: createdAt, id: row.id })).toString("base64url");
}

export function decodeMcpActionLogCursor(cursor: string) {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof decoded.created_at !== "string" || Number.isNaN(Date.parse(decoded.created_at))) {
      validationError("cursor is invalid");
    }
    if (typeof decoded.id !== "string" || !UUID_PATTERN.test(decoded.id)) {
      validationError("cursor is invalid");
    }
    return decoded as { created_at: string; id: string };
  } catch (error) {
    if (error instanceof McpActionLogValidationError) throw error;
    validationError("cursor is invalid");
  }
}

export async function listMcpActionLogs(db: any, teamId: string, options: McpActionLogListOptions = {}) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
  const cursor = options.cursor ? decodeMcpActionLogCursor(options.cursor) : null;
  const isTeamAdmin = options.isTeamAdmin !== false;
  const visibility = isTeamAdmin
    ? undefined
    : and(
        eq(schema.mcp_action_logs.auth_type, "oauth"),
        eq(schema.mcp_action_logs.user_id, options.viewerUserId ?? "00000000-0000-0000-0000-000000000000"),
      );
  const cursorClause = cursor
    ? or(
        lt(schema.mcp_action_logs.created_at, new Date(cursor.created_at)),
        and(
          eq(schema.mcp_action_logs.created_at, new Date(cursor.created_at)),
          lt(schema.mcp_action_logs.id, cursor.id),
        ),
      )
    : undefined;
  const where = and(
    eq(schema.mcp_action_logs.team_id, teamId),
    visibility,
    cursorClause,
  );

  const rows = await db
    .select({
      id: schema.mcp_action_logs.id,
      team_id: schema.mcp_action_logs.team_id,
      user_id: schema.mcp_action_logs.user_id,
      api_key_id: schema.mcp_action_logs.api_key_id,
      oauth_client_id: schema.mcp_action_logs.oauth_client_id,
      auth_type: schema.mcp_action_logs.auth_type,
      tool_name: schema.mcp_action_logs.tool_name,
      status: schema.mcp_action_logs.status,
      request_id: schema.mcp_action_logs.request_id,
      user_agent: schema.mcp_action_logs.user_agent,
      client_name: schema.mcp_action_logs.client_name,
      client_version: schema.mcp_action_logs.client_version,
      error_class: schema.mcp_action_logs.error_class,
      resource: schema.mcp_action_logs.resource,
      created_at: schema.mcp_action_logs.created_at,
    })
    .from(schema.mcp_action_logs)
    .where(where)
    .orderBy(
      desc(schema.mcp_action_logs.created_at),
      desc(schema.mcp_action_logs.id),
    )
    .limit(limit + 1);

  return {
    data: rows.slice(0, limit),
    nextCursor: rows.length > limit ? encodeMcpActionLogCursor(rows[limit - 1]) : null,
  };
}

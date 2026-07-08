import { and, desc, eq } from "drizzle-orm";
import * as schema from "../../db/schema";

export const MCP_ACTION_LOG_STATUSES = ["started", "success", "error"] as const;
export type McpActionLogStatus = (typeof MCP_ACTION_LOG_STATUSES)[number];

export type McpActionLogInput = {
  team_id: string;
  user_id?: string | null;
  api_key_id?: number | null;
  oauth_client_id?: string | null;
  auth_type: "oauth" | "api-key" | "keyless" | "unknown";
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
  "params",
  "url",
  "urls",
  "raw_ip",
  "client_ip",
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
  assertSafeMcpActionLogPayload(payload);
  const teamId = typeof payload.team_id === "string" ? payload.team_id : "";
  const toolName =
    typeof payload.tool_name === "string" ? payload.tool_name : "";
  const status = payload.status;
  if (!teamId) throw new Error("team_id is required");
  if (!toolName) throw new Error("tool_name is required");
  if (!MCP_ACTION_LOG_STATUSES.includes(status as McpActionLogStatus)) {
    throw new Error("status must be started, success, or error");
  }

  return {
    team_id: teamId,
    user_id: typeof payload.user_id === "string" ? payload.user_id : null,
    api_key_id:
      typeof payload.api_key_id === "number" ? payload.api_key_id : null,
    oauth_client_id:
      typeof payload.oauth_client_id === "string"
        ? payload.oauth_client_id
        : null,
    auth_type:
      payload.auth_type === "oauth" ||
      payload.auth_type === "api-key" ||
      payload.auth_type === "keyless"
        ? payload.auth_type
        : "unknown",
    tool_name: toolName,
    status: status as McpActionLogStatus,
    request_id:
      typeof payload.request_id === "string" ? payload.request_id : null,
    user_agent:
      typeof payload.user_agent === "string" ? payload.user_agent : null,
    client_name:
      typeof payload.client_name === "string" ? payload.client_name : null,
    client_version:
      typeof payload.client_version === "string"
        ? payload.client_version
        : null,
    error_class:
      typeof payload.error_class === "string" ? payload.error_class : null,
    resource: typeof payload.resource === "string" ? payload.resource : null,
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

export async function listMcpActionLogs(db: any, teamId: string, limit = 50) {
  return db
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
    .where(and(eq(schema.mcp_action_logs.team_id, teamId)))
    .orderBy(
      desc(schema.mcp_action_logs.created_at),
      desc(schema.mcp_action_logs.id),
    )
    .limit(Math.min(Math.max(limit, 1), 100));
}

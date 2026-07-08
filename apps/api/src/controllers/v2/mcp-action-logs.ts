import { Request, Response } from "express";
import { db, dbRr } from "../../db/connection";
import { config } from "../../config";
import { ErrorResponse, RequestWithAuth } from "./types";
import {
  listMcpActionLogs,
  normalizeMcpActionLogInput,
  recordMcpActionLog,
} from "../../services/mcp/action-logs";

type InternalRequest = Request & { body: Record<string, unknown> };

function bearerToken(value: string | string[] | undefined) {
  const header = Array.isArray(value) ? value[0] : value;
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

export async function ingestMcpActionLogController(
  req: InternalRequest,
  res: Response,
) {
  const secret = config.MCP_ACTION_LOG_SECRET;
  if (!secret || bearerToken(req.headers.authorization) !== secret) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const input = normalizeMcpActionLogInput(req.body ?? {});
    const row = await recordMcpActionLog(db, input);
    return res.status(202).json({ success: true, id: row?.id ?? null });
  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : "Invalid MCP action log",
    });
  }
}

export async function listMcpActionLogsController(
  req: RequestWithAuth,
  res: Response<{ success: true; data: unknown[] } | ErrorResponse>,
) {
  const limit = Number.parseInt(String(req.query.limit ?? "50"), 10);
  const data = await listMcpActionLogs(
    dbRr,
    req.auth.team_id,
    Number.isFinite(limit) ? limit : 50,
  );
  return res.status(200).json({ success: true, data });
}

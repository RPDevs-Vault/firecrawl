import { Request, Response } from "express";
import { db, dbRr } from "../../db/connection";
import { ErrorResponse, RequestWithAuth } from "./types";
import {
  listMcpActionLogs,
  normalizeMcpActionLogInput,
  recordMcpActionLog,
} from "../../services/mcp/action-logs";

type InternalRequest = Request & { body: Record<string, unknown> };

export async function ingestMcpActionLogController(
  req: InternalRequest,
  res: Response,
) {
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

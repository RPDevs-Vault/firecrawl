import { Request, Response } from "express";
import { db, dbRr } from "../../db/connection";
import { ErrorResponse, RequestWithAuth } from "./types";
import {
  listMcpActionLogs,
  McpActionLogValidationError,
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
    if (error instanceof McpActionLogValidationError) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    return res.status(500).json({
      success: false,
      error: "Failed to persist MCP action log",
    });
  }
}

export async function listMcpActionLogsController(
  req: RequestWithAuth,
  res: Response<{ success: true; data: unknown[] } | ErrorResponse>,
) {
  const limit = Number.parseInt(String(req.query.limit ?? "50"), 10);
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : null;
  const viewerUserId = req.acuc?.sub_user_id ?? null;
  const isTeamAdmin = viewerUserId === null || viewerUserId === "bypass";

  try {
    const result = await listMcpActionLogs(dbRr, req.auth.team_id, {
      limit: Number.isFinite(limit) ? limit : 50,
      cursor,
      viewerUserId,
      isTeamAdmin,
    });
    return res.status(200).json({
      success: true,
      data: result.data,
      nextCursor: result.nextCursor,
    } as any);
  } catch (error) {
    if (error instanceof McpActionLogValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    throw error;
  }
}

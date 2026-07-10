import express from "express";
import type {
  Application,
  NextFunction,
  Request,
  RequestHandler,
  Response,
} from "express";
import crypto from "node:crypto";
import { config } from "../config";
import { ingestMcpActionLogController } from "../controllers/v2/mcp-action-logs";
import { wrap } from "./wrap";

const MCP_ACTION_LOG_BODY_LIMIT = "64kb";
const DEFAULT_MCP_ACTION_LOG_RATE_LIMIT = 600;
const DEFAULT_MCP_ACTION_LOG_RATE_LIMIT_WINDOW_MS = 60_000;

type RawBodyRequest = Request & { rawBody?: Buffer };

function captureRawBody(
  req: RawBodyRequest,
  _res: Response,
  buf: Buffer,
): void {
  if (buf && buf.length) {
    req.rawBody = buf;
  }
}

function bearerToken(value: string | string[] | undefined): string | null {
  const header = Array.isArray(value) ? value[0] : value;
  return header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;
}

export function timingSafeSecretEqual(
  provided: string | null,
  expected?: string,
): boolean {
  if (!provided || !expected) return false;
  const providedBytes = Buffer.from(provided);
  const expectedBytes = Buffer.from(expected);
  if (providedBytes.length !== expectedBytes.length) return false;
  return crypto.timingSafeEqual(providedBytes, expectedBytes);
}

function authenticateMcpActionLogSecret(
  req: Request,
  res: Response,
  next: NextFunction,
): void | Response {
  if (
    !timingSafeSecretEqual(
      bearerToken(req.headers.authorization),
      config.MCP_ACTION_LOG_SECRET,
    )
  ) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }
  next();
}

export function createMcpActionLogRateLimitMiddleware(options?: {
  limit?: number;
  windowMs?: number;
  now?: () => number;
}): RequestHandler {
  const limit = options?.limit ?? DEFAULT_MCP_ACTION_LOG_RATE_LIMIT;
  const windowMs =
    options?.windowMs ?? DEFAULT_MCP_ACTION_LOG_RATE_LIMIT_WINDOW_MS;
  const now = options?.now ?? (() => Date.now());
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || "unknown";
    const current = now();
    const bucket = buckets.get(key);
    const activeBucket =
      !bucket || bucket.resetAt <= current
        ? { count: 0, resetAt: current + windowMs }
        : bucket;
    activeBucket.count += 1;
    buckets.set(key, activeBucket);

    if (activeBucket.count > limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((activeBucket.resetAt - current) / 1000),
      );
      res.setHeader("Retry-After", String(retryAfterSeconds));
      return res.status(429).json({
        success: false,
        error: "Too many MCP action log requests",
      });
    }

    next();
  };
}

export function registerMcpActionLogIngestRoute(
  app: Pick<Application, "post">,
  options?: {
    rateLimit?: ReturnType<typeof createMcpActionLogRateLimitMiddleware>;
  },
): void {
  app.post(
    "/v2/mcp/action-logs",
    authenticateMcpActionLogSecret,
    options?.rateLimit ?? createMcpActionLogRateLimitMiddleware(),
    express.json({ limit: MCP_ACTION_LOG_BODY_LIMIT, verify: captureRawBody }),
    wrap(ingestMcpActionLogController),
  );
}

import bodyParser from "body-parser";
import express, { NextFunction, Request, Response } from "express";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../../config";

const { redisConstructor } = vi.hoisted(() => ({
  redisConstructor: vi.fn(() => {
    throw new Error(
      "MCP action-log HTTP tests must not construct a Redis client",
    );
  }),
}));

vi.mock("ioredis", () => ({
  default: redisConstructor,
  Redis: redisConstructor,
}));

import {
  createMcpActionLogRateLimitMiddleware,
  registerMcpActionLogIngestRoute,
  timingSafeSecretEqual,
} from "../../routes/mcp-action-logs";

function createDbMock() {
  const values: any[] = [];
  let failInsert = false;
  return {
    values,
    failNextInsert() {
      failInsert = true;
    },
    insert() {
      return {
        values(value: any) {
          if (failInsert) {
            failInsert = false;
            return {
              returning() {
                return Promise.reject(new Error("database unavailable"));
              },
            };
          }
          values.push(value);
          return {
            returning() {
              return Promise.resolve([{ id: "log_1" }]);
            },
          };
        },
      };
    },
  };
}

const { dbMock } = vi.hoisted(() => ({ dbMock: createDbMock() }));

vi.mock("../../db/connection", () => ({
  db: dbMock,
  dbRr: dbMock,
}));

function createApp(rateLimit = createMcpActionLogRateLimitMiddleware()) {
  const app = express();
  registerMcpActionLogIngestRoute(app, { rateLimit });
  app.use(bodyParser.json({ limit: "10mb" }));
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (
      typeof err === "object" &&
      err !== null &&
      "status" in err &&
      (err as { status?: number }).status === 413
    ) {
      return res
        .status(413)
        .json({ success: false, error: "Request body is too large" });
    }
    return res.status(500).json({ success: false, error: "unexpected" });
  });
  return app;
}

describe("MCP action log HTTP ingest", () => {
  beforeEach(() => {
    config.MCP_ACTION_LOG_SECRET = "test-secret";
    dbMock.values.length = 0;
  });

  it("uses a timing-safe shared secret compare and registers without Redis", () => {
    expect(timingSafeSecretEqual("test-secret", "test-secret")).toBe(true);
    expect(timingSafeSecretEqual("test-secret", "other-secret")).toBe(false);
    expect(timingSafeSecretEqual("short", "much-longer-secret")).toBe(false);
    expect(timingSafeSecretEqual(null, "test-secret")).toBe(false);

    createApp();

    expect(redisConstructor).not.toHaveBeenCalled();
  });

  it("rejects missing or wrong secrets before parsing a 65 KB JSON body", async () => {
    const res = await request(createApp())
      .post("/v2/mcp/action-logs")
      .set("Content-Type", "application/json")
      .send({ padding: "x".repeat(65 * 1024) });

    expect(res.status).toBe(401);
    expect(dbMock.values).toHaveLength(0);
  });

  it("returns 413 and performs no insert for a 65 KB body with the global 10 MB parser present", async () => {
    const res = await request(createApp())
      .post("/v2/mcp/action-logs")
      .set("Authorization", "Bearer test-secret")
      .set("Content-Type", "application/json")
      .send({ padding: "x".repeat(65 * 1024) });

    expect(res.status).toBe(413);
    expect(dbMock.values).toHaveLength(0);
  });

  it("accepts valid events under the byte cap", async () => {
    const res = await request(createApp())
      .post("/v2/mcp/action-logs")
      .set("Authorization", "Bearer test-secret")
      .send({
        team_id: "00000000-0000-4000-8000-000000000001",
        auth_type: "oauth",
        tool_name: "firecrawl_scrape",
        status: "success",
      });

    expect(res.status).toBe(202);
    expect(dbMock.values).toHaveLength(1);
  });

  it("returns 400 for invalid client input and 500 for persistence failures", async () => {
    const invalid = await request(createApp())
      .post("/v2/mcp/action-logs")
      .set("Authorization", "Bearer test-secret")
      .send({
        team_id: "not-a-uuid",
        auth_type: "oauth",
        tool_name: "firecrawl_scrape",
        status: "success",
      });

    expect(invalid.status).toBe(400);
    expect(dbMock.values).toHaveLength(0);

    dbMock.failNextInsert();
    const failed = await request(createApp())
      .post("/v2/mcp/action-logs")
      .set("Authorization", "Bearer test-secret")
      .send({
        team_id: "00000000-0000-4000-8000-000000000001",
        auth_type: "oauth",
        tool_name: "firecrawl_scrape",
        status: "success",
      });

    expect(failed.status).toBe(500);
    expect(failed.body.error).toBe("Failed to persist MCP action log");
  });

  it("returns 429 with Retry-After when the dedicated action-log limiter is saturated", async () => {
    const app = createApp(
      createMcpActionLogRateLimitMiddleware({
        limit: 1,
        windowMs: 10_000,
        now: () => 1_000,
      }),
    );
    const payload = {
      team_id: "00000000-0000-4000-8000-000000000001",
      auth_type: "oauth",
      tool_name: "firecrawl_scrape",
      status: "started",
    };

    expect(
      (
        await request(app)
          .post("/v2/mcp/action-logs")
          .set("Authorization", "Bearer test-secret")
          .send(payload)
      ).status,
    ).toBe(202);
    const blocked = await request(app)
      .post("/v2/mcp/action-logs")
      .set("Authorization", "Bearer test-secret")
      .send(payload);

    expect(blocked.status).toBe(429);
    expect(blocked.headers["retry-after"]).toBe("10");
    expect(dbMock.values).toHaveLength(1);
  });
});

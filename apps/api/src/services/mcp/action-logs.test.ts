import { describe, expect, it } from "vitest";
import {
  assertSafeMcpActionLogPayload,
  normalizeMcpActionLogInput,
  decodeMcpActionLogCursor,
  encodeMcpActionLogCursor,
  listMcpActionLogs,
  recordMcpActionLog,
} from "./action-logs";

function createDbMock() {
  const values: any[] = [];
  return {
    values,
    insert() {
      return {
        values(value: any) {
          values.push(value);
          return {
            returning() {
              return Promise.resolve([
                { id: "log_1", created_at: "2026-07-09T00:00:00Z" },
              ]);
            },
          };
        },
      };
    },
  };
}

describe("MCP action logs", () => {
  it("normalizes the safe attribution payload", () => {
    expect(
      normalizeMcpActionLogInput({
        team_id: "00000000-0000-4000-8000-000000000001",
        user_id: "00000000-0000-4000-8000-000000000002",
        api_key_id: 123,
        oauth_client_id: "client_1",
        auth_type: "oauth",
        tool_name: "firecrawl_scrape",
        status: "success",
        request_id: "req_1",
        user_agent: "Claude/1.0",
        client_name: "Claude",
        client_version: "1.0",
        resource: "https://mcp.firecrawl.dev/v2/mcp",
      }),
    ).toMatchObject({
      auth_type: "oauth",
      tool_name: "firecrawl_scrape",
      status: "success",
      api_key_id: 123,
    });
  });

  it("keeps the direct unsafe-field assertion helper fail-closed", () => {
    expect(() =>
      assertSafeMcpActionLogPayload({ api_key: "fc-secret" }),
    ).toThrow("api_key");
    expect(() =>
      assertSafeMcpActionLogPayload({ token: "fco-secret" }),
    ).toThrow("token");
    expect(() =>
      assertSafeMcpActionLogPayload({ url: "https://private.example" }),
    ).toThrow("url");
    expect(() =>
      assertSafeMcpActionLogPayload({
        args: { url: "https://private.example" },
      }),
    ).toThrow("args");
    expect(() =>
      assertSafeMcpActionLogPayload({ client_ip: "192.0.2.1" }),
    ).toThrow("client_ip");
  });

  it("rejects invalid IDs and enums before DB work", () => {
    const base = {
      team_id: "00000000-0000-4000-8000-000000000001",
      auth_type: "oauth",
      tool_name: "firecrawl_scrape",
      status: "started",
    };

    expect(() =>
      normalizeMcpActionLogInput({ ...base, team_id: "not-a-uuid" }),
    ).toThrow("team_id must be a valid UUID");
    expect(() =>
      normalizeMcpActionLogInput({ ...base, user_id: "not-a-uuid" }),
    ).toThrow("user_id must be a valid UUID");
    expect(() =>
      normalizeMcpActionLogInput({ ...base, auth_type: "session" }),
    ).toThrow("auth_type must be oauth, api-key, keyless, or unknown");
    expect(() =>
      normalizeMcpActionLogInput({ ...base, api_key_id: -1 }),
    ).toThrow("api_key_id must be a positive integer");
  });

  it("drops optional unsafe and secret-like metadata without losing the action", () => {
    expect(
      normalizeMcpActionLogInput({
        team_id: "00000000-0000-4000-8000-000000000001",
        auth_type: "oauth",
        tool_name: "firecrawl_scrape",
        status: "success",
        request_id: "Bearer fco_secret_token",
        user_agent: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature",
        client_name: "sk-secretvalue",
        client_version: "fc-secretvalue",
        resource: "fco_secretvalue",
        url: "https://private.example",
        args: { url: "https://private.example" },
        raw_ip: "192.0.2.1",
      }),
    ).toMatchObject({
      tool_name: "firecrawl_scrape",
      request_id: null,
      user_agent: null,
      client_name: null,
      client_version: null,
      resource: null,
    });
  });

  it("encodes stable cursors and rejects invalid cursor input", () => {
    const cursor = encodeMcpActionLogCursor({
      created_at: "2026-07-10T10:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000099",
    });

    expect(decodeMcpActionLogCursor(cursor)).toEqual({
      created_at: "2026-07-10T10:00:00.000Z",
      id: "00000000-0000-4000-8000-000000000099",
    });
    expect(() => decodeMcpActionLogCursor("not-base64-json")).toThrow(
      "cursor is invalid",
    );
  });

  it("fetches one extra row for cursor pagination and returns the next cursor", async () => {
    const rows = [
      {
        id: "00000000-0000-4000-8000-000000000003",
        created_at: "2026-07-10T10:03:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        created_at: "2026-07-10T10:02:00.000Z",
      },
      {
        id: "00000000-0000-4000-8000-000000000001",
        created_at: "2026-07-10T10:01:00.000Z",
      },
    ];
    const calls: any[] = [];
    const db = {
      select() {
        return {
          from() {
            return this;
          },
          where(value: any) {
            calls.push(["where", value]);
            return this;
          },
          orderBy() {
            return this;
          },
          limit(value: number) {
            calls.push(["limit", value]);
            return Promise.resolve(rows);
          },
        };
      },
    };

    const result = await listMcpActionLogs(
      db,
      "00000000-0000-4000-8000-000000000001",
      {
        limit: 2,
        isTeamAdmin: false,
        viewerUserId: "00000000-0000-4000-8000-000000000002",
      },
    );

    expect(calls).toContainEqual(["limit", 3]);
    expect(result.data).toEqual(rows.slice(0, 2));
    expect(decodeMcpActionLogCursor(result.nextCursor!)).toEqual({
      created_at: rows[1].created_at,
      id: rows[1].id,
    });
  });

  it("stores only metadata fields", async () => {
    const db = createDbMock();
    await expect(
      recordMcpActionLog(
        db,
        normalizeMcpActionLogInput({
          team_id: "00000000-0000-4000-8000-000000000001",
          api_key_id: 123,
          auth_type: "api-key",
          tool_name: "firecrawl_map",
          status: "error",
          error_class: "UPSTREAM_ERROR",
        }),
      ),
    ).resolves.toEqual({ id: "log_1", created_at: "2026-07-09T00:00:00Z" });
    expect(db.values[0]).toEqual(
      expect.not.objectContaining({
        api_key: expect.anything(),
        url: expect.anything(),
        args: expect.anything(),
      }),
    );
  });

  it("bounds and sanitizes metadata fields", () => {
    expect(() =>
      normalizeMcpActionLogInput({
        team_id: "00000000-0000-4000-8000-000000000001",
        auth_type: "oauth",
        tool_name: "firecrawl_scrape",
        status: "started",
        resource: "x".repeat(513),
      }),
    ).toThrow("resource must be at most 512 characters");

    expect(() =>
      normalizeMcpActionLogInput({
        team_id: "00000000-0000-4000-8000-000000000001",
        auth_type: "oauth",
        tool_name: "firecrawl_scrape",
        status: "started",
        resource: "https://mcp.firecrawl.dev/v2/mcp\nspoofed",
      }),
    ).toThrow("resource must not contain control characters");

    expect(
      normalizeMcpActionLogInput({
        team_id: "00000000-0000-4000-8000-000000000001",
        auth_type: "oauth",
        tool_name: "firecrawl_scrape",
        status: "started",
        user_agent: "Bearer fco_secret_token",
      }).user_agent,
    ).toBeNull();

    expect(() =>
      normalizeMcpActionLogInput({
        team_id: "00000000-0000-4000-8000-000000000001",
        auth_type: "oauth",
        tool_name: "firecrawl_scrape",
        status: "started",
        client_name: "x".repeat(129),
      }),
    ).toThrow("client_name must be at most 128 characters");

    expect(() =>
      normalizeMcpActionLogInput({
        team_id: "00000000-0000-4000-8000-000000000001",
        auth_type: "oauth",
        tool_name: "x".repeat(129),
        status: "started",
      }),
    ).toThrow("tool_name must be at most 128 characters");

    expect(
      normalizeMcpActionLogInput({
        team_id: "00000000-0000-4000-8000-000000000001",
        auth_type: "oauth",
        tool_name: "firecrawl_scrape",
        status: "started",
        oauth_client_id: "Bearer fco_secret_token",
      }).oauth_client_id,
    ).toBeNull();
  });
});

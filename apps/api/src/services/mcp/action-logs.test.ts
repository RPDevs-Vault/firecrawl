import { describe, expect, it } from "vitest";
import {
  assertSafeMcpActionLogPayload,
  normalizeMcpActionLogInput,
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

  it("rejects secrets, raw URLs, args, and raw IPs", () => {
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

  it("bounds resource metadata", () => {
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
  });
});

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("MCP action log migrations", () => {
  const migrationDir = join(process.cwd(), "apps/api/src/db/migrations");
  const fresh = readFileSync(
    join(migrationDir, "20260709000200_create_mcp_action_logs.sql"),
    "utf8",
  );
  const reconcile = readFileSync(
    join(
      migrationDir,
      "20260709000300_reconcile_mcp_action_log_constraints.sql",
    ),
    "utf8",
  );

  it("enables RLS and denies direct anon/authenticated access", () => {
    for (const sql of [fresh, reconcile]) {
      expect(sql).toContain(
        "alter table public.mcp_action_logs enable row level security",
      );
      expect(sql).toContain(
        "revoke all on table public.mcp_action_logs from anon, authenticated",
      );
      expect(sql).toContain("service_role");
    }
  });

  it("keeps auth/status constraints, metadata-only redaction checks, and pagination indexes", () => {
    for (const sql of [fresh, reconcile]) {
      expect(sql).toContain("mcp_action_logs_auth_type_check");
      expect(sql).toContain("mcp_action_logs_status_check");
      expect(sql).toContain("mcp_action_logs_metadata_safe");
      expect(sql).toContain("eyJ[A-Za-z0-9_-]+\\.");
      expect(sql).toContain("sk-[A-Za-z0-9_-]+");
      expect(sql).toContain("mcp_action_logs_team_created_at_idx");
      expect(sql).toContain("mcp_action_logs_team_user_created_at_idx");
    }
  });
});

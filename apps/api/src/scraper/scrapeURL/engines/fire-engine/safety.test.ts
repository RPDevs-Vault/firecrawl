import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("ioredis", () => {
  class MockRedis {
    status = "ready";
    on = vi.fn(() => this);
    set = vi.fn();
    get = vi.fn(async () => null);
    del = vi.fn();
    expire = vi.fn();
    disconnect = vi.fn();
    quit = vi.fn();
  }

  return {
    default: MockRedis,
    Redis: MockRedis,
  };
});

import { config } from "../../../../config";
import {
  canUseFireEngineForTarget,
  hasFireEngineTargetSsrfProof,
} from "./safety";
import type { Meta } from "../..";
import { buildFallbackList, scrapeURLWithEngine } from "..";

describe("Fire Engine target-side SSRF proof gate", () => {
  const originalProof = config.FIRE_ENGINE_TARGET_SSRF_PROOF;
  const originalUrl = config.FIRE_ENGINE_BETA_URL;

  afterEach(() => {
    config.FIRE_ENGINE_TARGET_SSRF_PROOF = originalProof;
    config.FIRE_ENGINE_BETA_URL = originalUrl;
  });

  it("fails closed unless explicit target-side SSRF proof is configured", () => {
    config.FIRE_ENGINE_TARGET_SSRF_PROOF = false;
    expect(hasFireEngineTargetSsrfProof()).toBe(false);

    config.FIRE_ENGINE_TARGET_SSRF_PROOF = true;
    expect(hasFireEngineTargetSsrfProof()).toBe(true);
  });

  const buildMeta = (overrides: Partial<Meta> = {}) =>
    ({
      id: "test",
      url: "https://example.com/",
      options: { formats: [], maxAge: 3600000 },
      internalOptions: {
        teamId: "test",
        forceEngine: "fire-engine;chrome-cdp",
      },
      featureFlags: new Set(),
      mock: null,
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        error: vi.fn(),
        child: vi.fn().mockReturnThis(),
      },
      ...overrides,
    }) as Meta;

  it("prevents public engine selection from choosing Fire Engine without target-side SSRF proof", async () => {
    config.FIRE_ENGINE_BETA_URL = "https://fire-engine.example";
    config.FIRE_ENGINE_TARGET_SSRF_PROOF = false;

    const fallback = await buildFallbackList(buildMeta());

    expect(fallback.map(x => x.engine)).not.toContain("fire-engine;chrome-cdp");
  });

  it("allows explicit mock replay without target-side SSRF proof", async () => {
    config.FIRE_ENGINE_BETA_URL = undefined;
    config.FIRE_ENGINE_TARGET_SSRF_PROOF = false;

    const meta = buildMeta({ mock: { requests: [], tracker: {} } });
    const fallback = await buildFallbackList(meta);

    expect(canUseFireEngineForTarget(meta)).toBe(true);
    expect(fallback.map(x => x.engine)).toEqual(["fire-engine;chrome-cdp"]);
  });

  it("allows public engine selection to choose Fire Engine when target-side SSRF proof is configured", async () => {
    config.FIRE_ENGINE_BETA_URL = "https://fire-engine.example";
    config.FIRE_ENGINE_TARGET_SSRF_PROOF = true;

    const fallback = await buildFallbackList(buildMeta());

    expect(fallback.map(x => x.engine)).toEqual(["fire-engine;chrome-cdp"]);
  });

  it("prevents direct Fire Engine dispatch without target-side SSRF proof", async () => {
    config.FIRE_ENGINE_TARGET_SSRF_PROOF = false;

    await expect(
      scrapeURLWithEngine(buildMeta(), "fire-engine;chrome-cdp"),
    ).rejects.toThrow("FIRE_ENGINE_TARGET_SSRF_PROOF");
  });
});

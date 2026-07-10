import { afterEach, describe, expect, it } from "vitest";
import { config } from "../../../../config";
import { hasFireEngineTargetSsrfProof } from "./safety";

describe("Fire Engine target-side SSRF proof gate", () => {
  const original = config.FIRE_ENGINE_TARGET_SSRF_PROOF;

  afterEach(() => {
    config.FIRE_ENGINE_TARGET_SSRF_PROOF = original;
  });

  it("fails closed unless explicit target-side SSRF proof is configured", () => {
    config.FIRE_ENGINE_TARGET_SSRF_PROOF = false;
    expect(hasFireEngineTargetSsrfProof()).toBe(false);

    config.FIRE_ENGINE_TARGET_SSRF_PROOF = true;
    expect(hasFireEngineTargetSsrfProof()).toBe(true);
  });
});

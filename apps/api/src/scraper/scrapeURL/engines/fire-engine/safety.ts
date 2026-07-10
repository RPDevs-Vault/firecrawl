import { config } from "../../../../config";

type FireEngineTargetContext = {
  mock?: unknown | null;
};

export function hasFireEngineTargetSsrfProof() {
  return config.FIRE_ENGINE_TARGET_SSRF_PROOF === true;
}

export function canUseFireEngineForTarget(context: FireEngineTargetContext) {
  return hasFireEngineTargetSsrfProof() || context.mock != null;
}

export function assertCanUseFireEngineForTarget(
  context: FireEngineTargetContext,
) {
  if (!canUseFireEngineForTarget(context)) {
    throw new Error(
      "Fire Engine target fetching requires FIRE_ENGINE_TARGET_SSRF_PROOF=true",
    );
  }
}

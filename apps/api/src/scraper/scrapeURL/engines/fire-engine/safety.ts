import { config } from "../../../../config";

export function hasFireEngineTargetSsrfProof() {
  return config.FIRE_ENGINE_TARGET_SSRF_PROOF === true;
}

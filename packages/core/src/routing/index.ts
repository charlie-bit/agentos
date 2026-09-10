/** Public surface of model routing: dialect-neutral selection + health + attribution. */
export {
  selectDialect,
  resolveModelAlias,
  type DialectTag,
  type ModelChannel,
  type ModelLeaseLike,
} from "./channel.js";
export { resolveActiveModel, type ActiveModel, type ResolveActiveResult } from "./active.js";
export { HealthGate, type GateOptions, type PickResult, type Probe, type ProbeResult } from "./health.js";
export {
  appendAttribution,
  formatAttributionLine,
  usageLogPath,
  type Attribution,
  type UsageCounts,
} from "./attribution.js";

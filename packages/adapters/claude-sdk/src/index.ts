// @agentos/adapter-claude-sdk public surface: one turn in, RenderEvents out.
export {
  resolveChannel,
  sdkEnvDelta,
  modelEnv,
  plansToMcpServers,
  allowedToolsFromPlans,
  fsRootsFromPlans,
  collectDrift,
  createInProcessServer,
  buildQueryOptions,
  consumeStream,
  runTurn,
  normalize,
  shortModelName,
  type ModelLease,
  type ResolvedChannel,
  type TurnInput,
  type TurnOutput,
} from "./run.js";

export {
  readTranscript,
  projectDirName,
  type ReadTranscriptOptions,
  type TranscriptWarning,
} from "./transcript.js";

// @agentos/contracts — the owned contract surface of AgentOS: the four sockets.
// Manifests (zod) declare WHAT is mounted; runtime interfaces (TS) define HOW
// core talks to an implementation. Import discipline: this package depends on
// zod only and never imports kernel SDKs or sibling @agentos packages.
export * from "./manifest.js";
export * from "./tool.js";
export * from "./model.js";
export * from "./knowledge.js";
export * from "./entry.js";
export * from "./preset.js";

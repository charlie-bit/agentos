/**
 * Public API of the manifest module: read + judge, nothing else.
 * Mounting semantics (registry/loader) are P3 and deliberately absent here.
 */
export { formatIssues, type ManifestError } from "./errors.js";
export {
  loadManifest,
  loadManifestDir,
  type AnyManifest,
  type LoadDirResult,
  type LoadedManifest,
  type LoadFailure,
  type LoadResult,
} from "./load.js";
export { validatePresetRefs, type ValidationError, type ValidateOptions } from "./validate.js";

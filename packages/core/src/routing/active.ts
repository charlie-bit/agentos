/**
 * Active-model resolution: the three-layer priority chain (spec #208)
 *   request override (--model) > channelModels[channel] > preset.model slot
 * The middle layer is configuration (preset.channelModels), so a channel —
 * the mounted entry name, or a tenant label in shared-preset deployments —
 * can pin its own model without touching the global default.
 * An override may name a MANIFEST or an ALIAS (alias resolves to the manifest
 * that leases it). Failure is a humanized structured error that lists what
 * was available — guessing at model names is not a routing feature.
 */
import type { ModelProviderManifest } from "@agentos/contracts";
import type { ManifestError } from "../manifest/errors.js";

export interface ActiveModel {
  manifest: ModelProviderManifest;
  /** Alias within manifest.models; undefined = single-alias lease (taken) or kernel default. */
  alias?: string;
  /** Resolved real model id; undefined = not overridden (kernel decides). */
  modelId?: string;
  source: "preset" | "channel" | "override";
}

export type ResolveActiveResult = { ok: true; active: ActiveModel } | { ok: false; errors: ManifestError[] };

export function resolveActiveModel(args: {
  presetModel: string;
  override?: string;
  /** Channel/tenant label selecting the middle layer (spec #208). */
  channel?: string;
  /** preset.channelModels: label → manifest name or alias. */
  channelModels?: Readonly<Record<string, string>>;
  models: readonly ModelProviderManifest[];
}): ResolveActiveResult {
  const byName = new Map(args.models.map((m) => [m.name, m]));
  const fail = (path: string, message: string, hint: string): ResolveActiveResult => ({ ok: false, errors: [{ path, message, hint }] });

  if (args.override === undefined || args.override === "") {
    // Middle layer: a channel/tenant label may pin its own model. It is
    // configuration, so an unresolvable label fails loudly instead of
    // silently falling back to the preset slot.
    const channelRef = args.channel === undefined ? undefined : args.channelModels?.[args.channel];
    if (channelRef !== undefined) {
      // A channel entry resolves exactly like an override: manifest name OR
      // alias (both are legitimate config references).
      const channelResult = resolveActiveModel({ presetModel: args.presetModel, override: channelRef, models: args.models });
      if (!channelResult.ok) {
        return {
          ok: false,
          errors: channelResult.errors.map((e) => ({ ...e, path: `channelModels.${args.channel}`, hint: "fix the channel override (manifest name or alias)" })),
        };
      }
      const active = { ...channelResult.active, source: "channel" as const };
      return { ok: true, active };
    }
    const manifest = byName.get(args.presetModel);
    if (!manifest) {
      return fail("model", `preset references model manifest ${JSON.stringify(args.presetModel)}, which was not loaded`, `available: ${args.models.map((m) => m.name).join(", ") || "none"}`);
    }
    const aliases = Object.keys(manifest.models);
    const alias = aliases.length === 1 ? aliases[0] : undefined;
    return {
      ok: true,
      active: { manifest, alias, modelId: alias === undefined ? undefined : manifest.models[alias], source: "preset" },
    };
  }

  const named = byName.get(args.override);
  if (named) {
    const aliases = Object.keys(named.models);
    const alias = aliases.length === 1 ? aliases[0] : undefined;
    return { ok: true, active: { manifest: named, alias, modelId: alias === undefined ? undefined : named.models[alias], source: "override" } };
  }
  const holder = args.models.find((m) => args.override !== undefined && m.models[args.override] !== undefined);
  if (holder) {
    return { ok: true, active: { manifest: holder, alias: args.override, modelId: holder.models[args.override as string], source: "override" } };
  }
  const aliasList = args.models.flatMap((m) => Object.keys(m.models));
  return fail(
    "--model",
    `${JSON.stringify(args.override)} is neither a model manifest nor a known alias`,
    `manifests: [${args.models.map((m) => m.name).join(", ")}] · aliases: [${aliasList.join(", ")}]`,
  );
}

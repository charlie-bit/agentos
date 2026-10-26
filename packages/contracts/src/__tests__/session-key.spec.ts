/**
 * spec #223 — the browser/ledger key convention has one definition.
 */
import { describe, expect, it } from "vitest";
import { browserSessionId, isWebExternalKey, webExternalKey, WEB_SESSION_PREFIX } from "../session-key.js";

describe("web session key (#223)", () => {
  it("round-trips a browser id", () => {
    const id = "3f2a-uuid";
    expect(webExternalKey(id)).toBe(`${WEB_SESSION_PREFIX}${id}`);
    expect(browserSessionId(webExternalKey(id))).toBe(id);
    expect(isWebExternalKey(webExternalKey(id))).toBe(true);
  });

  it("leaves a non-web key alone", () => {
    expect(browserSessionId("cli-123")).toBe("cli-123");
    expect(isWebExternalKey("cli-123")).toBe(false);
  });
});

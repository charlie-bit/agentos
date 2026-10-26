import { describe, expect, it } from "vitest";
import { resolveTheme } from "./theme";

describe("theme resolution (spec #280)", () => {
  it("auto defers to the OS (no pinned attribute)", () => {
    expect(resolveTheme("auto")).toBeNull();
  });
  it("explicit preferences pin light/dark", () => {
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });
});

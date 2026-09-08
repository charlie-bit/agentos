// AgentOS lint discipline.
//
// Core rule: kernel SDKs (Claude Agent SDK / DeepSeek Harness) are RENTED and
// must never leak past the thin adapter shells. The ban below is global; only
// packages/adapters/** is exempted. This is enforced mechanically, not by convention.
import tseslint from "typescript-eslint";

const KERNEL_PACKAGES = ["@anthropic-ai/claude-agent-sdk", "deepseek-harness"];

const banMessage = (pkg) =>
  `'${pkg}' may only be imported from packages/adapters/** — the kernel is rented; ` +
  `everything above the adapter boundary talks to @agentos/contracts types only.`;

export default tseslint.config(
  {
    ignores: ["**/node_modules/**", "**/dist/**", "pm-skills-temp/**", ".reference/**", "skills/**"],
  },
  ...tseslint.configs.recommended,
  {
    name: "agentos/discipline",
    files: ["**/*.ts"],
    rules: {
      "no-console": "error",
      "no-restricted-imports": [
        "error",
        {
          paths: KERNEL_PACKAGES.map((name) => ({ name, message: banMessage(name) })),
        },
      ],
    },
  },
  {
    // Adapters are the designated seam: kernel imports live here and nowhere else.
    name: "agentos/adapters-exemption",
    files: ["packages/adapters/**/*.ts"],
    rules: {
      "no-restricted-imports": "off",
    },
  },
);

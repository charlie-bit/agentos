# Single-process deployment (spec #302). Not a K8s/ArgoCD product: one node,
# one process, one data directory. K8s stays deliberately absent (#178).
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages ./packages
COPY cli ./cli
COPY apps ./apps
COPY config ./config
COPY examples ./examples
COPY knowledge-base ./knowledge-base
COPY scripts ./scripts
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable && mkdir -p /app/.agentos
COPY --from=build /app /app
# Runtime state lives under /app/.agentos; mount a volume here to persist
# sessions, workspaces, drafts, receipts and logs.
VOLUME ["/app/.agentos"]
EXPOSE 8787
# 0.0.0.0 only inside the container's network namespace: the host side is the
# operator's boundary (publish deliberately). The token gate still applies.
CMD ["node", "/app/cli/main.mjs", "serve", "--web", "--host", "0.0.0.0", "--preset", "/app/config/presets/example.yml"]

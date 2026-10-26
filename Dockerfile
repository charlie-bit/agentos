# Single-process deployment (spec #302). Not a K8s/ArgoCD product: one node,
# one process, one data directory. K8s stays deliberately absent (#178).
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages ./packages
COPY cli ./cli
COPY apps ./apps
COPY config ./config
COPY examples ./examples
COPY knowledge-base ./knowledge-base
COPY scripts ./scripts
COPY tsconfig.base.json ./
RUN pnpm install --frozen-lockfile && pnpm build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    AGENTOS_SESSION_DB=/data/.agentos/sessions.db
RUN corepack enable
COPY --from=build /app /app
# All runtime state lives under /data (mount a volume here to persist sessions,
# workspaces, drafts, receipts and logs). The console binds 127.0.0.1 INSIDE
# the container: use --network host (Linux) so it stays loopback-only there.
VOLUME ["/data"]
EXPOSE 8787
WORKDIR /data
CMD ["node", "/app/cli/main.mjs", "serve", "--web", "--preset", "/app/config/presets/example.yml"]

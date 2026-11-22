FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared-types/package.json packages/shared-types/package.json
COPY packages/tef-client/package.json packages/tef-client/package.json
COPY packages/fiscal-engine/package.json packages/fiscal-engine/package.json
COPY apps/central-api/package.json apps/central-api/package.json
COPY apps/central-web/package.json apps/central-web/package.json
COPY apps/cockpit/package.json apps/cockpit/package.json
RUN pnpm install --frozen-lockfile
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps/central-api ./apps/central-api
RUN pnpm --filter @totem-pdv/central-api... build
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /var/lib/print-agent && chown node:node /var/lib/print-agent
USER node
EXPOSE 4000
CMD ["node", "apps/central-api/dist/server.js"]

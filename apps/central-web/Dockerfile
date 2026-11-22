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
COPY packages/shared-types ./packages/shared-types
COPY apps/central-web ./apps/central-web
RUN pnpm --filter @totem-pdv/shared-types build && pnpm --filter @totem-pdv/central-web build
FROM nginx:stable-alpine AS runtime
COPY apps/central-web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build --chown=nginx:nginx /app/apps/central-web/dist /usr/share/nginx/html
USER nginx
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]

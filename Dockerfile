# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/shared/ packages/shared/
COPY apps/web/ apps/web/
RUN corepack enable && pnpm install --frozen-lockfile
RUN pnpm --filter @alfred/shared build
RUN pnpm --filter @alfred/web build

# Stage 2: Serve
FROM nginx:alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

# ─── build stage ─────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /repo

# `VITE_API_BASE` must be baked in at build time — Vite inlines it into the
# bundle. Set via docker-compose build arg or `docker build --build-arg`.
ARG VITE_API_BASE=/api
ENV VITE_API_BASE=$VITE_API_BASE

COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN npm ci --workspaces --include-workspace-root

COPY packages/shared packages/shared
COPY apps/web apps/web

RUN npm run build --workspace @bluefish/shared
RUN npm run build --workspace @bluefish/web


# ─── runtime stage ───────────────────────────────────────────────────
FROM nginx:1.27-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80

# Cyethack HR Portal — production image (multi-stage Docker build)
#
#   docker build -t cyethack-hrm-portal .
#       [--build-arg VITE_SHOW_DEMO_ACCOUNTS=false]
#
#   docker run --rm -p 5000:5000 \
#       -e NODE_ENV=production -e PORT=5000 \
#       -e MONGODB_URI=... \
#       -e JWT_SECRET=... -e JWT_REFRESH_SECRET=... \
#       -e FRONTEND_URL=... -e FRONTEND_DIST=/app/client-dist \
#       cyethack-hrm-portal
#
# Stage 1 builds the Vite + React frontend. Stage 2 runs the Express server
# and serves the frontend from /app/client-dist.
#
# server/public (legacy portal) is excluded from the build context by
# .dockerignore: it is never copied into this image and never overwritten.

# -------- Stage 1: frontend build --------
FROM node:20-alpine AS frontend
WORKDIR /app/client

# Vite inlines import.meta.env.VITE_* at build time. Pass values with
# --build-arg, e.g. --build-arg VITE_SHOW_DEMO_ACCOUNTS=false.
ARG VITE_SHOW_DEMO_ACCOUNTS=false
ENV VITE_SHOW_DEMO_ACCOUNTS=${VITE_SHOW_DEMO_ACCOUNTS}

COPY client/package*.json ./
RUN npm ci --omit=dev

COPY client/ .
RUN npm run build

# -------- Stage 2: server --------
FROM node:20-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=5000
# Served frontend location. Must match the fail-fast check in server/app.js
# (defaults to server/public; we override it here).
ENV FRONTEND_DIST=/app/client-dist

# production dependencies only (devDeps such as mongodb-memory-server excluded)
COPY server/package*.json ./
RUN npm ci --omit=dev

# application source: routes, controllers, models, server.js, assets, etc.
COPY server/ .

# built frontend — copied from the build stage, never from server/public
COPY --from=frontend /app/client/dist /app/client-dist

# uploads are streamed through authenticated routes only; a volume is mounted
# at runtime in production. Make sure the directory exists.
RUN mkdir -p uploads

EXPOSE 5000

# Guard: refuse to build an image without the frontend entrypoint.
# server/app.js also refuses to start in production without
# FRONTEND_DIST/index.html.
RUN test -f /app/client-dist/index.html

# Real start command: import sanity check, then the Express server.
CMD ["npm", "--prefix", "server", "start"]

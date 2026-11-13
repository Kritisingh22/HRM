# ============================================================
# Cyethack HRM Portal — Multi-stage Dockerfile
# Stage 1: Build the React client (Vite)
# Stage 2: Run the Express server (node:20-alpine)
# ============================================================

# ---- Stage 1: Client build -------------------------------------------
FROM node:20-alpine AS client-builder
WORKDIR /app/client

# Install client dependencies
COPY client/package.json client/package-lock.json ./
RUN npm ci --omit=dev

# Copy client source and build
COPY client/ ./
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# ---- Stage 2: Server runtime -----------------------------------------
FROM node:20-alpine
WORKDIR /app

# Install production server dependencies only
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev

# Copy server source (including fonts, scripts, seeds, uploads placeholder)
COPY server/ ./

# Copy built client assets from stage 1
COPY --from=client-builder /app/client/dist ./client-dist

# Create uploads directory (mounted volume in production)
RUN mkdir -p uploads && touch uploads/.gitkeep

# Point the server at the client build output
ENV FRONTEND_DIST=/app/client-dist
ENV NODE_ENV=production
ENV PORT=10000

EXPOSE 10000

# Start with the real start script (runs check-imports + check-public + server.js)
CMD ["npm", "start"]

# ============================================================
# Render settings (set these in the Render dashboard):
#
#   Runtime: Docker
#   Dockerfile path: /Dockerfile
#   Docker context directory: / (repo root)
#
#   Environment variables (build-time):
#     VITE_API_URL = https://cyethack-hrm-portal.onrender.com
#
#   Environment variables (runtime):
#     NODE_ENV = production
#     PORT = 10000
#     MONGODB_URI = <your production MongoDB URI>
#     JWT_SECRET = <strong secret, min 16 chars>
#     JWT_REFRESH_SECRET = <strong secret, min 16 chars>
#     FRONTEND_URL = https://cyethack-hrm-portal.onrender.com
#     SETUP_TOKEN = <blank to disable bootstrap after first admin>
#     PAYROLL_CURRENCY = INR
#     MAX_FAILED_LOGINS = 5
#     ACCOUNT_LOCK_MINUTES = 15
#     DOCUMENT_STORAGE = cloudflare-r2
#     R2_ACCOUNT_ID = <your R2 account ID>
#     R2_ACCESS_KEY_ID = <your R2 access key>
#     R2_SECRET_ACCESS_KEY = <your R2 secret key>
#     R2_BUCKET_NAME = <your R2 bucket name>
#     R2_ENDPOINT = <your R2 endpoint>
#     R2_REGION = auto
#     HEALTH_CHECK_PATH = /health
#
#   Health check: /health (Render will auto-detect from Dockerfile EXPOSE)
# ============================================================

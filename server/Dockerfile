# Cyethack HR Portal — API + served portal
FROM node:20-alpine
WORKDIR /app

# install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev

# app source (includes public/ — the served portal)
COPY . .

# uploads live on a mounted volume in production
RUN mkdir -p uploads

EXPOSE 5000
ENV NODE_ENV=production
CMD ["node", "server.js"]

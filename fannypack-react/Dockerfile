# Backend image for Google Cloud Run (used with Firebase Hosting, see README "Host on Firebase").
# Build context = this folder. The website is built inside too: the backend renders every page
# (titles, share tags, embedded homepage data) from frontend/dist/index.html.

FROM node:22-alpine AS web
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY --from=web /app/frontend/dist /app/frontend/dist
RUN mkdir -p uploads backups && chown -R node:node uploads backups
USER node
# Cloud Run passes PORT (8080)
EXPOSE 8080
CMD ["node", "index.js"]

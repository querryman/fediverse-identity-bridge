# Fediverse Identity Bridge — Sidecar Deployment Dockerfile
# Task 8.1: Docker Configuration

FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --production

# Copy application code
COPY . .

# Expose bridge port (4000 by default)
EXPOSE 4000

# Environment defaults (can be overridden)
ENV BRIDGE_NETWORK=0.0.0.0
ENV BRIDGE_PORT=4000
ENV REDIS_HOST=redis
ENV REDIS_PORT=6379
ENV NODE_ENV=production

# Health check for container orchestration
HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD node -e "const http = require('http'); http.get('http://127.0.0.1:4000/health || process.exit(1), (r) => r.statusCode === 200 ? process.exit(0) : process.exit(1));" || exit 1

# Start bridge service
CMD ["node", "bridge.js"]

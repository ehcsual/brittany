FROM node:22-alpine

WORKDIR /app

# Install dependencies (cached layer)
COPY package*.json ./
RUN npm ci --only=production

# Copy application files
COPY server.js brainstorm.html ./

# Create data directory
RUN mkdir -p /data

ENV NODE_ENV=production
ENV DB_PATH=/data/brittany.db
ENV PORT=7333

EXPOSE 7333

# Mount this volume to persist the SQLite database
VOLUME ["/data"]

CMD ["node", "server.js"]

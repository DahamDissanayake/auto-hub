FROM node:20-alpine
RUN apk add --no-cache python3 make g++ bash
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY src/ ./src/
EXPOSE 7681
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:7681/health || exit 1
CMD ["node", "src/server.js"]

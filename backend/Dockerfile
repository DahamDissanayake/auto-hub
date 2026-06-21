FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
WORKDIR /app
RUN apk add --no-cache dumb-init python3 py3-pip && \
    pip3 install speedtest-cli --break-system-packages
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
EXPOSE 4000
ENTRYPOINT ["dumb-init", "--"]
CMD ["sh", "-c", "node dist/src/seed && node dist/src/main"]

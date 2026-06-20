FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ curl git openssh-client ca-certificates && \
    curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && \
    chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list && \
    apt-get update && apt-get install -y --no-install-recommends gh && \
    rm -rf /var/lib/apt/lists/*
# Create claude user (uid/gid 1001) so SSH can resolve the running uid
RUN groupadd --gid 1001 claude && \
    useradd --uid 1001 --gid 1001 --no-create-home --home-dir /workspace/claude-home --shell /bin/bash claude
ENV HOME=/workspace/claude-home
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY src/ ./src/
EXPOSE 7681
HEALTHCHECK --interval=30s --timeout=5s CMD curl -sf http://localhost:7681/health || exit 1
CMD ["node", "src/server.js"]

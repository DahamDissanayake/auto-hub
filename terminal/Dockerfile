FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ curl git openssh-client ca-certificates \
    sudo vim nano htop jq zip unzip build-essential python3-pip ripgrep tmux docker.io \
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
    && apt-get update && apt-get install -y --no-install-recommends gh \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g @anthropic-ai/claude-code

RUN usermod -l dama -d /home/dama node \
    && groupmod -n dama node \
    && echo 'dama ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/dama \
    && chmod 440 /etc/sudoers.d/dama

ENV HOME=/home/dama
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --production
COPY src/ ./src/
COPY entrypoint.sh ./
RUN chmod +x entrypoint.sh

EXPOSE 7681
HEALTHCHECK --interval=30s --timeout=5s CMD curl -sf http://localhost:7681/health || exit 1
CMD ["./entrypoint.sh"]

#!/bin/bash
set -e

echo "AutoHub Installer"
echo "================="

if ! command -v docker &> /dev/null; then
    echo "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    sudo usermod -aG docker "$USER"
    echo "Docker installed. Please log out and back in, then re-run this script."
    exit 0
fi

if [ -d "auto-hub" ]; then
    cd auto-hub && git pull
else
    git clone https://github.com/yourusername/auto-hub.git
    cd auto-hub
fi

if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env from .env.example"
    echo "Please edit .env with your settings, then re-run this script."
    exit 1
fi

docker compose up -d --build
echo ""
echo "AutoHub is running at http://localhost"
echo "Login with the ADMIN_PASSWORD from your .env file."

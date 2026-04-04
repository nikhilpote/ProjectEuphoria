#!/bin/bash
# Run once on a fresh Ubuntu 24.04 EC2 instance
set -euo pipefail

echo "=== Updating system ==="
sudo apt update && sudo apt upgrade -y

echo "=== Installing Docker ==="
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu

echo "=== Installing Docker Compose plugin ==="
sudo apt install -y docker-compose-plugin

echo "=== Creating app directory ==="
sudo mkdir -p /opt/euphoria
sudo chown ubuntu:ubuntu /opt/euphoria

echo "=== Done ==="
echo "Log out and back in for Docker group to take effect."
echo "Then run deploy.sh from your local machine."

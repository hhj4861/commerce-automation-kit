#!/usr/bin/env bash
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
# Cap container logs before Docker first starts: the boot disk is 20 GiB.
install -d -m 0755 /etc/docker
if ! test -f /etc/docker/daemon.json; then
  printf '%s\n' '{"log-driver": "json-file", "log-opts": {"max-size": "10m", "max-file": "3"}}' > /etc/docker/daemon.json
fi
apt-get update
apt-get install -y docker.io docker-compose-v2 git curl python3-venv
systemctl enable --now docker
install -d -m 0700 /opt/shared-ai
if ! test -x /opt/shared-ai/venv/bin/python; then
  python3 -m venv /opt/shared-ai/venv
fi
/opt/shared-ai/venv/bin/python -m pip install --disable-pip-version-check PyYAML==6.0.3
docker compose version
# Application source, API keys, and admin setup are installed separately.
# No secrets or developer OAuth sessions are placed in VM metadata.

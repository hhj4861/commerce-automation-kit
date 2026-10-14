FROM node:20.19.3-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv libpq5 ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY services/topic-discovery/requirements.txt /app/requirements.txt
RUN python3 -m venv /opt/discovery-venv && /opt/discovery-venv/bin/pip install --no-cache-dir --no-deps --require-hashes -r /app/requirements.txt
ENV PATH="/opt/discovery-venv/bin:$PATH"
COPY packages/litellm-client/jev.mjs packages/litellm-client/jev.mjs
COPY services/topic-discovery/cloudrun-auth.mjs services/topic-discovery/pgstore.py services/topic-discovery/native_review.py services/topic-discovery/service.py services/topic-discovery/server.py services/topic-discovery/jev-bridge.mjs services/topic-discovery/
ENV PYTHONDONTWRITEBYTECODE=1 DISCOVERY_BIND=0.0.0.0
USER node
CMD ["python3", "services/topic-discovery/server.py"]

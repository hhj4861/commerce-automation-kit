FROM node:20.19.3-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY packages/litellm-client/jev.mjs packages/litellm-client/jev.mjs
COPY services/topic-discovery/service.py services/topic-discovery/server.py services/topic-discovery/jev-bridge.mjs services/topic-discovery/
ENV PYTHONDONTWRITEBYTECODE=1 DISCOVERY_BIND=0.0.0.0
USER node
CMD ["python3", "services/topic-discovery/server.py"]

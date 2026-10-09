# LiteLLM for Cloud Run: the VM's reviewed digest plus a committed, secret-free config.
# Build with --build-arg TARGET=staging|production. The config stays outside /app (the
# image WORKDIR holding the entrypoint and Prisma schema).
FROM ghcr.io/berriai/litellm@sha256:87f34979b9f8cb274fac90ca8a4fdda07d8480de22755562a26adeb95ce20d02
ARG TARGET
COPY ${TARGET}.json /etc/litellm/config.json
CMD ["--config", "/etc/litellm/config.json", "--host", "0.0.0.0", "--port", "8080"]

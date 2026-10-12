# Cloud Run edge: the reviewed Caddy digest with its routing file baked in, so a revision
# rollback also restores routes. Build with --build-arg VARIANT=staging.
FROM docker.io/library/caddy@sha256:0c994536bddb66445885237f1a5dcc1916bccea922661c76b4e9fc24061f9b52
ARG VARIANT
COPY Caddyfile.${VARIANT} /etc/caddy/Caddyfile

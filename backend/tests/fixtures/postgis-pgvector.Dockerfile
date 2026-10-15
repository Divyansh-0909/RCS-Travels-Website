FROM postgis/postgis:17-3.5@sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6

# Bullseye's authenticated PGDG packages moved to the official archive.
# Keep the existing PostgreSQL/PostGIS binaries and install only this extension.
RUN sed -i 's/apt.postgresql.org/apt-archive.postgresql.org/' /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends --no-upgrade postgresql-17-pgvector=0.8.6-1.pgdg11+1 \
    && rm -rf /var/lib/apt/lists/*

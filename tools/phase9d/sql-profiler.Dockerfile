# Disposable instrumentation only. Preserve the existing server/extension binaries.
FROM rcs-test-postgis-pgvector:0fd7cb460542f723 AS builder
COPY profiler-vendor /build/input
RUN echo '9f43e428d4145d3212b68a70970cc5b736ce544b4bec2f1d6f010225787ddef4  /build/input/postgresql-server-dev-17.deb' | sha256sum -c - \
    && echo '7743f4d8be3415d50f9c1018c7e176c0b16df6760998f3a18ad2a12f2349a1d3  /build/input/plpgsql-check.tar.gz' | sha256sum -c - \
    && sed -i 's@http://deb.debian.org/debian-security@https://archive.debian.org/debian-security@g' /etc/apt/sources.list \
    && apt-get update && apt-get install -y --no-install-recommends gcc make libc6-dev \
    && dpkg-deb -x /build/input/postgresql-server-dev-17.deb / \
    && mkdir /build/source && tar -xzf /build/input/plpgsql-check.tar.gz -C /build/source --strip-components=1 \
    && cd /build/source && make USE_PGXS=1 PG_CONFIG=/usr/lib/postgresql/17/bin/pg_config with_llvm=no \
    && make USE_PGXS=1 PG_CONFIG=/usr/lib/postgresql/17/bin/pg_config with_llvm=no install
FROM rcs-test-postgis-pgvector:0fd7cb460542f723
COPY --from=builder /usr/lib/postgresql/17/lib/plpgsql_check.so /usr/lib/postgresql/17/lib/plpgsql_check.so
COPY --from=builder /usr/share/postgresql/17/extension/plpgsql_check* /usr/share/postgresql/17/extension/

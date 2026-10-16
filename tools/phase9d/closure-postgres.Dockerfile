# syntax=docker/dockerfile:1
# Fresh managed-cloud rehearsal. No change to the accepted historical recipes.
FROM postgis/postgis:17-3.5@sha256:01a6a70e41e6c4467c8f55f6063555ed72db2d6662cd0d571040d42eadaeb6f6 AS extensions
RUN --mount=type=secret,id=proxy_ca,required=true,mode=0444 \
    sed -i 's@http://apt.postgresql.org@https://apt-archive.postgresql.org@;s@http://deb.debian.org@https://deb.debian.org@g' /etc/apt/sources.list.d/pgdg.list /etc/apt/sources.list \
    && apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update --error-on=any \
    && apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca install -y --no-install-recommends --no-upgrade postgresql-17-pgvector=0.8.6-1.pgdg11+1
FROM extensions AS profiler
COPY profiler-vendor /build/input
RUN --mount=type=secret,id=proxy_ca,required=true,mode=0444 \
    echo '9f43e428d4145d3212b68a70970cc5b736ce544b4bec2f1d6f010225787ddef4  /build/input/postgresql-server-dev-17.deb' | sha256sum -c - \
    && echo '7743f4d8be3415d50f9c1018c7e176c0b16df6760998f3a18ad2a12f2349a1d3  /build/input/plpgsql-check.tar.gz' | sha256sum -c - \
    && sed -i 's@https://deb.debian.org/debian-security@https://archive.debian.org/debian-security@g' /etc/apt/sources.list \
    && apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca update --error-on=any \
    && apt-get -o Acquire::https::CaInfo=/run/secrets/proxy_ca install -y --no-install-recommends gcc make libc6-dev \
    && dpkg-deb -x /build/input/postgresql-server-dev-17.deb / \
    && mkdir /build/source && tar -xzf /build/input/plpgsql-check.tar.gz -C /build/source --strip-components=1 \
    && cd /build/source && make USE_PGXS=1 PG_CONFIG=/usr/lib/postgresql/17/bin/pg_config with_llvm=no \
    && make USE_PGXS=1 PG_CONFIG=/usr/lib/postgresql/17/bin/pg_config with_llvm=no install
FROM extensions
COPY --from=profiler /usr/lib/postgresql/17/lib/plpgsql_check.so /usr/lib/postgresql/17/lib/plpgsql_check.so
COPY --from=profiler /usr/share/postgresql/17/extension/plpgsql_check* /usr/share/postgresql/17/extension/

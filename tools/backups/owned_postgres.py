"""Finite disposable PostgreSQL server; ownership checked before cleanup.

No Docker startup, global prune, existing-volume cleanup or host settings here.
"""
import json
import os
import re
import subprocess
import time
import uuid

import psycopg
from psycopg import sql

from backup import Refused, require, database_connect


class OwnedPostgres:
    def __init__(self, image):
        require(re.fullmatch(r"(?:[^\s]+@)?sha256:[a-f0-9]{64}", image), "PINNED_IMAGE_REQUIRED")
        self.image = image
        self.name = "rcs-backup-" + uuid.uuid4().hex
        self.volume = self.name + "-data"
        self.network = self.name + "-net"
        self.password = uuid.uuid4().hex + uuid.uuid4().hex
        self.database = "rcs_restore_test_" + uuid.uuid4().hex
        self.created = False
        self.resources = None

    def docker(self, args, *, env=None, check=True):
        result = subprocess.run(["docker", *args], env=env, capture_output=True, timeout=90)
        if check:
            require(result.returncode == 0, "OWNED_DOCKER_OPERATION_FAILED")
        return result

    def __enter__(self):
        try:
            self.docker(["volume", "create", "--label", "rcs.backup.owner=" + self.name, self.volume])
            self.docker(["network", "create", "--label", "rcs.backup.owner=" + self.name, self.network])
            env = os.environ.copy()
            env.update(POSTGRES_PASSWORD=self.password, POSTGRES_DB=self.database)
            self.docker(["run", "-d", "--name", self.name, "--label", "rcs.backup.owner=" + self.name,
                         "--network", self.network, "--memory", "768m", "--cpus", "0.75", "--pids-limit", "128",
                         "--ulimit", "core=0", "--mount", "type=volume,source=" + self.volume + ",target=/var/lib/postgresql/data",
                         "-p", "127.0.0.1::5432", "-e", "POSTGRES_PASSWORD", "-e", "POSTGRES_DB", self.image,
                         "postgres", "-c", "log_statement=none", "-c", "log_min_error_statement=panic",
                         "-c", "log_parameter_max_length_on_error=0"], env=env)
            self.created = True
            details = json.loads(self.docker(["inspect", self.name]).stdout)[0]
            host = details["HostConfig"]
            require(host["Memory"] == 805306368 and host["NanoCpus"] == 750000000 and host["PidsLimit"] == 128, "RESOURCE_READBACK_FAILED")
            self.resources = {"image": details["Image"], "memory_bytes": host["Memory"], "nano_cpus": host["NanoCpus"], "pids": host["PidsLimit"], "network_internal": False,
                              "network_boundary": "owned bridge, loopback-only port; outbound network not fenced"}
            # The container inspect immediately after start can precede port publication.
            ports = details["NetworkSettings"]["Ports"].get("5432/tcp")
            for _ in range(10):
                if ports:
                    break
                time.sleep(1)
                details = json.loads(self.docker(["inspect", self.name]).stdout)[0]
                ports = details["NetworkSettings"]["Ports"].get("5432/tcp")
            require(ports, "LOOPBACK_PORT_UNAVAILABLE")
            port = ports[0]["HostPort"]
            self.url = f"postgresql://postgres:{self.password}@localhost:{port}/{self.database}"
            for _ in range(45):
                try:
                    with database_connect(self.url, connect_timeout=2):
                        break
                except psycopg.OperationalError:
                    time.sleep(1)
            else:
                raise Refused("OWNED_DATABASE_START_TIMEOUT")
            # The image initializes PostGIS in its initial database. Restore must
            # use an actually empty template0 database, never relax that guard.
            fresh = "rcs_restore_test_" + uuid.uuid4().hex
            with database_connect(self.url, autocommit=True) as admin:
                admin.execute(sql.SQL("CREATE DATABASE {} TEMPLATE template0").format(sql.Identifier(fresh)))
            self.database = fresh
            self.url = self.url.rsplit("/", 1)[0] + "/" + fresh
            return self
        except Exception:
            self.__exit__(None, None, None)
            raise

    def __exit__(self, *_):
        if self.created:
            details = json.loads(self.docker(["inspect", self.name]).stdout)[0]
            require(details["Config"]["Labels"].get("rcs.backup.owner") == self.name, "CLEANUP_OWNERSHIP_FAILED")
            self.docker(["stop", "--time", "10", self.name])
            self.docker(["rm", self.name])
            self.created = False
        for kind, name in (("volume", self.volume), ("network", self.network)):
            result = self.docker([kind, "inspect", name], check=False)
            if result.returncode == 0:
                item = json.loads(result.stdout)[0]
                require(item.get("Labels", {}).get("rcs.backup.owner") == self.name, "CLEANUP_OWNERSHIP_FAILED")
                self.docker([kind, "rm", name])

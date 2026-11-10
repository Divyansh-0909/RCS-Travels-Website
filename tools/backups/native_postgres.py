"""Small, owned Windows PostgreSQL fixture for synthetic tests; no Docker or hosted URL."""
import json
import os
from pathlib import Path
import socket
import subprocess
import uuid

import psycopg


class NativePostgres:
    def __init__(self):
        self.owner = uuid.uuid4().hex
        self.root = Path(os.environ["LOCALAPPDATA"]) / "RCSProofloop" / "native-synthetic" / self.owner
        self.data = self.root / "data"
        self.binary = Path(r"C:\Program Files\PostgreSQL\18\bin")
        self.password = uuid.uuid4().hex + uuid.uuid4().hex
        self.started = False
        self.stopped = False
        self.env = {key: os.environ[key] for key in ("PATH", "SystemRoot", "WINDIR", "USERPROFILE", "TEMP", "TMP", "LOCALAPPDATA", "APPDATA") if key in os.environ}

    def command(self, args, label, timeout=60):
        with (self.root / (label + ".stdout.private.log")).open("xb") as out, (self.root / (label + ".stderr.private.log")).open("xb") as err:
            result = subprocess.run(args, env=self.env, stdout=out, stderr=err, timeout=timeout,
                                    creationflags=subprocess.CREATE_NO_WINDOW)
        if result.returncode:
            raise RuntimeError("OWNED_NATIVE_" + label.upper() + "_FAILED")

    def connect(self, user="proofloop_owner", password=None, **kwargs):
        if not self.started:
            raise RuntimeError("OWNED_NATIVE_SERVER_NOT_STARTED")
        return psycopg.connect(host="127.0.0.1", port=self.port, dbname="postgres", user=user,
                               password=self.password if password is None else password, connect_timeout=5,
                               sslmode="disable", options="-c statement_timeout=15000 -c lock_timeout=5000", **kwargs)

    def __enter__(self):
        if os.name != "nt" or not (self.binary / "initdb.exe").is_file():
            raise RuntimeError("WINDOWS_NATIVE_POSTGRES_REQUIRED")
        self.root.mkdir(parents=True, exist_ok=False)
        # DACL only: no administrator/SACL or host service changes.
        script = r"""
$ErrorActionPreference='Stop'
$d=New-Object IO.DirectoryInfo($env:RCS_NATIVE_PRIVATE)
if (($d.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'LINK_REFUSED' }
$a=$d.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
$a.SetAccessRuleProtection($true,$false)
foreach($r in @($a.GetAccessRules($true,$false,[Security.Principal.SecurityIdentifier]))) { [void]$a.RemoveAccessRuleSpecific($r) }
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
foreach($id in @($sid,(New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
 $r=New-Object Security.AccessControl.FileSystemAccessRule($id,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
 $a.AddAccessRule($r)
}
$d.SetAccessControl($a)
$v=$d.GetAccessControl([Security.AccessControl.AccessControlSections]::Access)
$rules=@($v.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
if (-not $v.AreAccessRulesProtected -or $rules.Count -ne 2 -or @($rules | Where-Object {$_.IdentityReference.Value -notin @($sid.Value,'S-1-5-18') -or $_.AccessControlType -ne 'Allow'}).Count -ne 0) { throw 'ACL_READBACK_FAILED' }
"""
        env = dict(self.env, RCS_NATIVE_PRIVATE=str(self.root))
        acl = subprocess.run(["powershell.exe", "-NoProfile", "-Command", script], env=env, capture_output=True, timeout=15)
        if acl.returncode:
            raise RuntimeError("OWNED_NATIVE_ACL_FAILED")
        (self.root / "ownership.json").write_text(json.dumps({"owner": self.owner, "data": str(self.data)}), encoding="utf-8")
        password_file = self.root / "init-password.private"
        password_file.write_text(self.password, encoding="ascii")
        try:
            self.command([str(self.binary / "initdb.exe"), "-D", str(self.data), "-U", "proofloop_owner", "--encoding=UTF8", "--locale=C",
                          "--auth-host=scram-sha-256", "--auth-local=scram-sha-256", "--pwfile=" + str(password_file), "--no-instructions"], "initdb")
        finally:
            password_file.unlink(missing_ok=True)
        with socket.socket() as reservation:
            reservation.bind(("127.0.0.1", 0))
            self.port = reservation.getsockname()[1]
        settings = {"listen_addresses": "'127.0.0.1'", "port": str(self.port), "shared_buffers": "'32MB'", "work_mem": "'1MB'",
                    "maintenance_work_mem": "'16MB'", "max_connections": "8", "max_parallel_workers": "0", "jit": "off",
                    "max_wal_size": "'128MB'", "min_wal_size": "'32MB'", "log_statement": "'none'", "log_min_error_statement": "'panic'",
                    "log_parameter_max_length_on_error": "0", "log_connections": "off"}
        with (self.data / "postgresql.conf").open("a", encoding="utf-8") as config:
            config.write("\n# Owned synthetic fixture only\n" + "\n".join(key + " = " + value for key, value in settings.items()) + "\n")
        try:
            self.command([str(self.binary / "pg_ctl.exe"), "-D", str(self.data), "-l", str(self.root / "server.private.log"), "-w", "-t", "30", "start"], "start", 40)
            self.started = True
            with self.connect() as conn:
                identity = conn.execute("SELECT current_user,current_database(),host(inet_server_addr()),inet_server_port(),current_setting('data_directory')").fetchone()
                (self.root / "observed-identity.private.json").write_text(json.dumps({"identity": identity, "expected_data": str(self.data), "expected_port": self.port}, default=str), encoding="utf-8")
                if identity[:4] != ("proofloop_owner", "postgres", "127.0.0.1", self.port) or Path(identity[4]).resolve() != self.data.resolve():
                    raise RuntimeError("OWNED_NATIVE_IDENTITY_FAILED")
                self.identity = {"user": identity[0], "database": identity[1], "host": identity[2], "port": identity[3],
                                 "version": conn.execute("SHOW server_version").fetchone()[0], "shared_buffers": conn.execute("SHOW shared_buffers").fetchone()[0],
                                 "work_mem": conn.execute("SHOW work_mem").fetchone()[0], "max_connections": conn.execute("SHOW max_connections").fetchone()[0],
                                 "hard_process_memory_cap": "NOT_ESTABLISHED_BY_POSTGRES_GUCS", "profiling_loaded": False}
                if conn.execute("SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='plpgsql_check')").fetchone()[0]:
                    raise RuntimeError("UNEXPECTED_PROFILER")
            return self
        except Exception:
            # pg_ctl stop is scoped to the newly owned directory, including a partial startup.
            if (self.data / "postmaster.pid").is_file():
                self.started = True
                self.__exit__(None, None, None)
            raise

    def __exit__(self, *_):
        if self.started:
            marker = json.loads((self.root / "ownership.json").read_text())
            if marker != {"owner": self.owner, "data": str(self.data)} or self.data.resolve().parent != self.root.resolve():
                raise RuntimeError("OWNED_NATIVE_CLEANUP_REFUSED")
            self.command([str(self.binary / "pg_ctl.exe"), "-D", str(self.data), "-m", "fast", "-w", "-t", "20", "stop"], "stop", 30)
            self.started = False
            self.stopped = not (self.data / "postmaster.pid").exists()
            if not self.stopped:
                raise RuntimeError("OWNED_NATIVE_SHUTDOWN_UNVERIFIED")

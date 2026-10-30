#!/usr/bin/env python3
"""Isolated macOS ARM MariaDB. No system installation or remote database access."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
import re
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from local_download import verified_download

ROOT = Path(__file__).resolve().parents[1]
REAL_STATE = Path(os.environ["P3_STATE_DIR"]) / "database"
# MariaDB's installer shell script does not quote its basedir search correctly.
# A workspace-specific, verified symlink avoids spaces without moving any data.
REAL_STATE.mkdir(parents=True, exist_ok=True, mode=0o700)
STATE = Path(tempfile.gettempdir()) / ("sprtaya-phase3-" + hashlib.sha256(str(ROOT).encode()).hexdigest()[:12])
if STATE.is_symlink():
    if STATE.resolve() != REAL_STATE.resolve():
        raise RuntimeError("The portable runtime alias belongs to a different directory.")
elif STATE.exists():
    raise RuntimeError("The portable runtime alias is occupied.")
else:
    STATE.symlink_to(REAL_STATE, target_is_directory=True)
CELLAR = STATE / "cellar"
if not CELLAR.exists():
    shared = Path(os.environ["P2_RUNTIME_DIR"]) / "cellar"
    if shared.is_dir():
        CELLAR.symlink_to(shared, target_is_directory=True)
    else:
        CELLAR.mkdir()
PORT = 33078
SOCKET = STATE / "mariadb.sock"
DBS = ("sprtaya_phase3_disposable_local", "sprtaya_phase3_disposable_test")


def private_json(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")
    path.chmod(0o600)


def metadata(name):
    with urllib.request.urlopen("https://formulae.brew.sh/api/formula/" + name + ".json", timeout=60) as response:
        return json.load(response)


def install():
    if sys.platform != "darwin" or os.uname().machine != "arm64":
        raise RuntimeError("This portable bottle bootstrap supports macOS ARM64. Use MariaDB 11.8 on loopback on other systems.")
    STATE.mkdir(parents=True, exist_ok=True)
    STATE.chmod(0o700)
    CELLAR.mkdir(exist_ok=True)
    downloads = STATE / "downloads"
    downloads.mkdir(exist_ok=True)
    installed = {}

    def package(name):
        if name in installed:
            return
        info = metadata(name)
        files = info["bottle"]["stable"]["files"]
        tag = next((t for t in ("arm64_sequoia", "arm64_sonoma", "arm64_ventura", "all") if t in files), None)
        if not tag:
            raise RuntimeError("No compatible macOS bottle for " + name)
        item = files[tag]
        installed[name] = {"version": info["versions"]["stable"], "sha256": item["sha256"], "url": item["url"], "tag": tag}
        for dependency in info["dependencies"]:
            # Groonga/Mroonga is an optional storage-engine plugin. This isolated
            # runtime uses InnoDB; downloading its dictionary engines is unnecessary.
            if dependency != "groonga":
                package(dependency)

    package("mariadb@11.8")
    private_json(STATE / "packages.json", installed)

    def download_package(entry):
        name, item = entry
        archive = downloads / (item["sha256"] + ".tar.gz")
        if not archive.exists() or hashlib.sha256(archive.read_bytes()).hexdigest() != item["sha256"]:
            url = item["url"]
            repository = urllib.parse.urlparse(url).path.removeprefix("/v2/").split("/blobs/")[0]
            token_url = "https://ghcr.io/token?service=ghcr.io&scope=" + urllib.parse.quote("repository:" + repository + ":pull")
            with urllib.request.urlopen(token_url, timeout=60) as response:
                token = json.load(response)["token"]
            verified_download(url, archive, "sha256", item["sha256"], {"Authorization": "Bearer " + token})
        prefix = CELLAR / name
        if not prefix.exists():
            subprocess.run(["/usr/bin/tar", "-xzf", str(archive), "-C", str(CELLAR)], check=True)
        print("Verified portable package:", name, item["version"], flush=True)

    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(download_package, installed.items()))


def prefix():
    candidates = sorted((CELLAR / "mariadb@11.8").glob("*/bin/mariadbd"))
    if not candidates:
        raise RuntimeError("Run setup first to obtain the portable MariaDB runtime.")
    return candidates[-1].parents[1]


def runtime_env():
    env = os.environ.copy()
    libraries = [str(p) for p in CELLAR.glob("*/*/lib") if p.is_dir()]
    env["DYLD_LIBRARY_PATH"] = ":".join(libraries)
    env["DYLD_FALLBACK_LIBRARY_PATH"] = ":".join(libraries)
    env["PATH"] = str(prefix() / "bin") + ":" + env.get("PATH", "")
    return env


def client_args(program="mariadb", initial=False):
    args = [str(prefix() / "bin" / program)]
    if initial:
        args += ["--no-defaults", "--socket=" + str(SOCKET), "--user=root"]
    else:
        args += ["--defaults-file=" + str(STATE / "root-client.cnf")]
    return args


def query(sql, initial=False):
    result = subprocess.run(client_args(initial=initial) + ["--batch", "--skip-column-names"],
                            input=sql, text=True, capture_output=True, env=runtime_env())
    if result.returncode:
        raise RuntimeError("Local MariaDB SQL command failed: " + result.stderr[-1000:])
    return result.stdout


def alive():
    pidfile = STATE / "mariadb.pid"
    if not pidfile.exists():
        return False
    try:
        os.kill(int(pidfile.read_text().strip()), 0)
        return True
    except (ProcessLookupError, ValueError):
        return False


def start(initial=False):
    if alive():
        return
    base = prefix()
    (STATE / "tmp").mkdir(exist_ok=True)
    args = [str(base / "bin/mariadbd"), "--no-defaults", "--basedir=" + str(base),
            "--datadir=" + str(STATE / "data"), "--plugin-dir=" + str(base / "lib/plugin"),
            "--socket=" + str(SOCKET), "--pid-file=" + str(STATE / "mariadb.pid"),
            "--log-error=" + str(STATE / "mariadb.log"), "--tmpdir=" + str(STATE / "tmp"),
            "--bind-address=127.0.0.1", "--port=" + str(PORT), "--character-set-server=utf8mb4",
            "--collation-server=utf8mb4_unicode_ci", "--skip-name-resolve"]
    if initial:
        args.append("--skip-networking")
    with (STATE / "launcher.log").open("ab") as log:
        process = subprocess.Popen(args, env=runtime_env(), stdout=log, stderr=log, start_new_session=True)
    for _ in range(80):
        if process.poll() is not None:
            raise RuntimeError("Local MariaDB exited. Inspect .local/phase2/mariadb.log and launcher.log.")
        try:
            query("SELECT 1;", initial=initial)
            print("Local MariaDB ready (socket only)." if initial else "Local MariaDB ready at 127.0.0.1:" + str(PORT), flush=True)
            return
        except RuntimeError:
            time.sleep(0.25)
    raise RuntimeError("Local MariaDB startup timed out.")


def stop(initial=False):
    if not alive():
        return
    result = subprocess.run(client_args("mariadb-admin", initial) + ["shutdown"], env=runtime_env(), capture_output=True)
    if result.returncode:
        raise RuntimeError("Could not stop this workspace's local MariaDB.")
    for _ in range(80):
        if not alive():
            return
        time.sleep(0.1)


def write_environment(credentials):
    for database, filename in zip(DBS, ("env.local", "env.test")):
        values = {
            "DATABASE_TARGET": "local", "APP_ENV": "local", "STAGING_SITE": "0",
            "DATABASE_URL": f"mysql://sprtaya_phase3:{credentials['app']}@127.0.0.1:{PORT}/{database}",
            "BETTER_AUTH_SECRET": credentials["auth"], "BETTER_AUTH_URL": "http://localhost:3003",
            "AUTH_TRUSTED_ORIGINS": "http://localhost:3003", "CATALOG_SOURCE": "mysql",
        }
        if filename == "env.test":
            values["PHASE2_DB_INTEGRATION"] = "1"
        target = STATE / filename
        target.write_text("\n".join(k + "=" + v for k, v in values.items()) + "\n")
        target.chmod(0o600)


def setup():
    if not list((CELLAR / "mariadb@11.8").glob("*/bin/mariadbd")):
        install()
    credentials_file = STATE / "credentials.json"
    if credentials_file.exists():
        credentials = json.loads(credentials_file.read_text())
    else:
        credentials = {k: secrets.token_hex(32) for k in ("root", "app", "auth")}
        private_json(credentials_file, credentials)
    if not (STATE / "data/mysql").exists():
        base = prefix()
        # macOS SIP strips DYLD_* when /bin/sh starts the installer. Restore
        # the verified local library paths immediately before execing MariaDB.
        wrapper = STATE / "mariadbd-bootstrap"
        libraries = ":".join(str(p) for p in CELLAR.glob("*/*/lib") if p.is_dir())
        wrapper.write_text("#!/usr/bin/python3\nimport os,sys\n"
                           + "env=os.environ.copy()\n"
                           + "env['DYLD_LIBRARY_PATH']=" + repr(libraries) + "\n"
                           + "env['DYLD_FALLBACK_LIBRARY_PATH']=" + repr(libraries) + "\n"
                           + "binary=" + repr(str(base / "bin/mariadbd")) + "\n"
                           + "os.execve(binary,[binary,*sys.argv[1:]],env)\n")
        wrapper.chmod(0o700)
        installer_env = runtime_env()
        installer_env["MYSQLD_BOOTSTRAP"] = str(wrapper)
        subprocess.run([str(base / "bin/mariadb-install-db"), "--no-defaults", "--basedir=" + str(base),
                        "--datadir=" + str(STATE / "data"), "--auth-root-authentication-method=normal",
                        "--skip-test-db"], env=installer_env, check=True, stdout=subprocess.DEVNULL)
        start(initial=True)
        sql = "\n".join("CREATE DATABASE IF NOT EXISTS `" + name + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" for name in DBS)
        sql += "\nCREATE USER 'sprtaya_phase3'@'127.0.0.1' IDENTIFIED BY '" + credentials["app"] + "';"
        sql += "\n" + "\n".join("GRANT ALL PRIVILEGES ON `" + name + "`.* TO 'sprtaya_phase3'@'127.0.0.1';" for name in DBS)
        sql += "\nALTER USER 'root'@'localhost' IDENTIFIED BY '" + credentials["root"] + "';"
        query(sql, initial=True)
        config = STATE / "root-client.cnf"
        config.write_text("[client]\nuser=root\npassword=" + credentials["root"] + "\nsocket=\"" + str(SOCKET) + "\"\n")
        config.chmod(0o600)
        stop()
    write_environment(credentials)
    start()
    # The upstream installer creates additional passwordless root identities.
    # This private development server retains only the password-protected socket root.
    extra_roots = query("SELECT CONCAT('DROP USER ',QUOTE(User),'@',QUOTE(Host),';') FROM mysql.user WHERE User='root' AND Host<>'localhost';")
    if extra_roots.strip():
        query(extra_roots)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("setup", "start", "stop", "status", "sql", "backup"))
    parser.add_argument("--verify", action="store_true", help="Restore a local snapshot into a new disposable verification database and compare table counts.")
    args = parser.parse_args()
    if args.command == "setup":
        setup()
    elif args.command == "start":
        start()
    elif args.command == "stop":
        stop()
    elif args.command == "status":
        print(query("SELECT VERSION(), @@hostname, @@port, @@bind_address;"), end="")
    elif args.command == "sql":
        print(query(sys.stdin.read()), end="")
    elif args.command == "backup":
        backup_dir = STATE / "backups"
        backup_dir.mkdir(exist_ok=True)
        destination = backup_dir / (time.strftime("%Y%m%d-%H%M%S") + ".sql")
        with destination.open("wb") as output:
            subprocess.run(client_args("mariadb-dump") + ["--single-transaction", "--databases", *DBS], env=runtime_env(), stdout=output, check=True)
        destination.chmod(0o600)
        print("Local backup:", destination.resolve())
        if args.verify:
            tables_verified = verify_restore(destination)
            evidence = {"backup":destination.name,"sha256":hashlib.sha256(destination.read_bytes()).hexdigest(),"databases":list(DBS),"port":PORT,"verified":True,"verifiedAt":time.time(),"verificationKind":"exact-artifact-v1","tablesVerified":tables_verified}
            private_json(Path(str(destination)+".verified.json"),evidence)


def verify_restore(destination):
    # Restore the exact artifact being certified, never a second dump of newer state.
    destination = destination.resolve()
    if destination.parent != (STATE / "backups").resolve():
        raise RuntimeError("Backup artifact is outside the private backup directory.")
    artifact = destination.read_text()
    aliases = {DBS[0]:"sprtaya_phase3_exact_restore_local",DBS[1]:"sprtaya_phase3_exact_restore_test"}
    selectors = re.findall(r"^(?:CREATE DATABASE[^\n]*|USE [^\n]*)$",artifact,re.M)
    if len(selectors)!=4 or any(not any("`"+name+"`" in line for name in DBS) for line in selectors):
        raise RuntimeError("Unexpected database selectors in backup; refusing restore.")
    for restore in aliases.values():
        if query("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='"+restore+"';").strip():
            raise RuntimeError("An exact-artifact restore target exists; refusing to overwrite it.")
    rewritten=artifact
    for source,restore in aliases.items():
        rewritten=re.sub(r"^(CREATE DATABASE[^\n]*?|USE )`"+re.escape(source)+r"`",lambda m:m.group(1)+"`"+restore+"`",rewritten,flags=re.M)
    verified={}
    try:
        subprocess.run(client_args(),input=rewritten.encode(),env=runtime_env(),check=True,stdout=subprocess.DEVNULL)
        for source,restore in aliases.items():
            tables=query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='"+source+"' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;").splitlines()
            restored=query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='"+restore+"' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;").splitlines()
            if tables!=restored:raise RuntimeError("Restored table inventory differs; quiesce local writers and retry.")
            for table in tables:
                if not table.replace("_", "").isalnum():raise RuntimeError("Unexpected table identifier.")
                for sql in ["SELECT COUNT(*) FROM `{database}`.`"+table+"`;", "SELECT * FROM `{database}`.`"+table+"` ORDER BY 1;"]:
                    original_data=query(sql.format(database=source));restored_data=query(sql.format(database=restore))
                    if hashlib.sha256(original_data.encode()).digest()!=hashlib.sha256(restored_data.encode()).digest():
                        raise RuntimeError("Artifact comparison differs: "+table+". Quiesce local writers and retry.")
            verified[source]=len(tables)
            print("Exact backup artifact restored: "+str(len(tables))+" tables match row counts and data digests.")
        return verified
    finally:
        # Names are fixed and cannot refer to accepted/hosted databases.
        for restore in aliases.values():query("DROP DATABASE IF EXISTS `"+restore+"`;")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)

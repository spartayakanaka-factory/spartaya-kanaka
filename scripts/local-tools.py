#!/usr/bin/env python3
"""Download pinned, checksum-verified local tools; never install globally."""
import base64
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request
from local_download import verified_download

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / ".local/phase2/tools"


def pnpm():
    target = TOOLS / "pnpm"
    if (target / "bin/pnpm.cjs").exists():
        return
    with urllib.request.urlopen("https://registry.npmjs.org/pnpm/11.24.0", timeout=30) as response:
        info = json.load(response)
    digest = base64.b64decode(info["dist"]["integrity"].split("-", 1)[1]).hex()
    archive = TOOLS / "pnpm-11.24.0.tgz"
    verified_download(info["dist"]["tarball"], archive, "sha512", digest)
    target.mkdir(exist_ok=True)
    subprocess.run(["tar", "-xzf", str(archive), "-C", str(target), "--strip-components=1"], check=True)
    print("Verified local pnpm 11.24.0", flush=True)


def media():
    target = TOOLS / "weed"
    if target.exists():
        return
    archive = TOOLS / "seaweedfs-4.51-darwin-arm64.tar.gz"
    verified_download("https://github.com/seaweedfs/seaweedfs/releases/download/4.51/darwin_arm64.tar.gz", archive, "sha256", "80000b9ee9129194740d5a766851a536ab8b14c46d18895399fc4bbef2d53c8d")
    subprocess.run(["tar", "-xzf", str(archive), "-C", str(TOOLS), "weed"], check=True)
    target.chmod(0o755)
    print("Verified local SeaweedFS 4.51", flush=True)


if __name__ == "__main__":
    TOOLS.mkdir(parents=True, exist_ok=True)
    with ThreadPoolExecutor(max_workers=2) as pool:
        list(pool.map(lambda task: task(), (pnpm, media)))

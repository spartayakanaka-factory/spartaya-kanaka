"""Bounded parallel downloads for portable tools, always verified before use."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import re
import urllib.request


def verified_download(url, target, algorithm, expected, headers=None):
    if target.exists() and hashlib.new(algorithm, target.read_bytes()).hexdigest() == expected:
        return
    request_headers = {"User-Agent": "sprtaya-local-development", **(headers or {})}
    probe = urllib.request.Request(url, headers={**request_headers, "Range": "bytes=0-0"})
    with urllib.request.urlopen(probe, timeout=120) as response:
        match = re.fullmatch(r"bytes 0-0/(\d+)", response.headers.get("Content-Range", ""))
        if response.status != 206 or not match:
            with target.open("wb") as output:
                while chunk := response.read(256 * 1024):
                    output.write(chunk)
            total = None
        else:
            total = int(match.group(1))
    if total:
        chunk_size = 2 * 1024 * 1024
        ranges = [(start, min(total - 1, start + chunk_size - 1)) for start in range(0, total, chunk_size)]
        existing = target.stat().st_size if target.exists() else 0

        def part(bounds):
            start, end = bounds
            destination = target.with_name(target.name + ".part-" + str(start))
            size = end - start + 1
            if destination.exists() and destination.stat().st_size == size:
                return destination
            if existing >= end + 1:
                with target.open("rb") as source:
                    source.seek(start)
                    destination.write_bytes(source.read(size))
                return destination
            req = urllib.request.Request(url, headers={**request_headers, "Range": f"bytes={start}-{end}"})
            with urllib.request.urlopen(req, timeout=120) as response:
                if response.status != 206 or response.headers.get("Content-Range") != f"bytes {start}-{end}/{total}":
                    raise RuntimeError("Tool server returned an unexpected byte range.")
                with destination.open("wb") as output:
                    while chunk := response.read(256 * 1024):
                        output.write(chunk)
            if destination.stat().st_size != size:
                raise RuntimeError("Incomplete portable tool download.")
            return destination

        with ThreadPoolExecutor(max_workers=4) as pool:
            parts = list(pool.map(part, ranges))
        completed = target.with_name(target.name + ".complete")
        with completed.open("wb") as output:
            for path in parts:
                with path.open("rb") as source:
                    while chunk := source.read(1024 * 1024):
                        output.write(chunk)
        completed.replace(target)
        for path in parts:
            path.unlink()
    if hashlib.new(algorithm, target.read_bytes()).hexdigest() != expected:
        raise RuntimeError("Portable tool checksum mismatch: " + target.name)

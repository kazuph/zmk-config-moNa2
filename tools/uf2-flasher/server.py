#!/usr/bin/env python3

import argparse
import json
import mimetypes
import os
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote


APP_DIR = Path(os.environ["MONA2_APP_DIR"]).resolve()
REPO_ROOT = Path(os.environ["MONA2_REPO_ROOT"]).resolve()
FIRMWARE_ROOT = Path(os.environ["MONA2_FIRMWARE_ROOT"]).expanduser().resolve()
STUDIO_DIST_ENV = os.environ.get("MONA2_STUDIO_DIST")
STUDIO_DIST = Path(STUDIO_DIST_ENV).resolve() if STUDIO_DIST_ENV else None


def repo_short_sha():
    try:
        return subprocess.check_output(
            ["git", "-C", str(REPO_ROOT), "rev-parse", "--short", "HEAD"],
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except subprocess.CalledProcessError:
        return None


def read_manifest(directory):
    manifest = directory / "SOURCE_COMMIT"
    values = {}
    if not manifest.is_file():
        return values

    for line in manifest.read_text(encoding="utf-8").splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            values[key] = value
    return values


def classify_file(name):
    lower = name.lower()
    if lower.startswith("mona2_r ") and lower.endswith(".uf2"):
        return "right"
    if lower.startswith("mona2_l ") and lower.endswith(".uf2"):
        return "left"
    if lower.startswith("settings_reset-") and lower.endswith(".uf2"):
        return "reset"
    return "unknown"


def firmware_directory():
    short_sha = repo_short_sha()
    if short_sha:
        candidate = FIRMWARE_ROOT / short_sha
        if candidate.is_dir():
            return candidate

    if not FIRMWARE_ROOT.is_dir():
        return None

    directories = [path for path in FIRMWARE_ROOT.iterdir() if path.is_dir()]
    if not directories:
        return None
    return max(directories, key=lambda path: path.stat().st_mtime)


def firmware_payload():
    directory = firmware_directory()
    if directory is None:
        return {
            "available": False,
            "root": str(FIRMWARE_ROOT),
            "directory": None,
            "manifest": {},
            "files": [],
        }

    manifest = read_manifest(directory)
    files = []
    for path in sorted(directory.glob("*.uf2")):
        kind = classify_file(path.name)
        if kind == "unknown":
            continue
        files.append(
            {
                "name": path.name,
                "kind": kind,
                "size": path.stat().st_size,
                "url": f"/firmware/{directory.name}/{path.name}",
            }
        )

    return {
        "available": bool(files),
        "root": str(FIRMWARE_ROOT),
        "directory": str(directory),
        "shortCommit": directory.name,
        "manifest": manifest,
        "files": files,
    }


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_GET(self):
        if self.path == "/api/firmware":
            self.send_json(firmware_payload())
            return

        if self.path.startswith("/firmware/"):
            self.send_firmware(include_body=True)
            return

        if self.path in ("/zmk.svg", "/vite.svg"):
            self.send_studio_asset(self.path.removeprefix("/"), include_body=True)
            return

        if self.path == "/studio":
            self.send_response(308)
            self.send_header("Location", "/studio/")
            self.end_headers()
            return

        if self.path.startswith("/studio/"):
            self.send_studio(include_body=True)
            return

        super().do_GET()

    def do_HEAD(self):
        if self.path.startswith("/firmware/"):
            self.send_firmware(include_body=False)
            return

        if self.path in ("/zmk.svg", "/vite.svg"):
            self.send_studio_asset(self.path.removeprefix("/"), include_body=False)
            return

        if self.path == "/studio" or self.path.startswith("/studio/"):
            self.send_studio(include_body=False)
            return

        super().do_HEAD()

    def send_json(self, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_firmware(self, include_body):
        parts = self.path.removeprefix("/firmware/").split("/", 1)
        if len(parts) != 2:
            self.send_error(404)
            return

        commit_dir = unquote(parts[0])
        file_name = unquote(parts[1])
        firmware_path = (FIRMWARE_ROOT / commit_dir / file_name).resolve()
        allowed_dir = (FIRMWARE_ROOT / commit_dir).resolve()

        if not str(firmware_path).startswith(str(allowed_dir) + os.sep):
            self.send_error(403)
            return
        if firmware_path.suffix.lower() != ".uf2" or not firmware_path.is_file():
            self.send_error(404)
            return

        ctype = mimetypes.guess_type(str(firmware_path))[0] or "application/octet-stream"
        body = firmware_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Disposition", f'attachment; filename="{firmware_path.name}"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)

    def send_studio(self, include_body):
        if STUDIO_DIST is None or not STUDIO_DIST.is_dir():
            self.send_error(404, "ZMK Studio build is missing")
            return

        relative = unquote(self.path.split("?", 1)[0]).removeprefix("/studio/")
        if relative in ("", "."):
            relative = "index.html"

        studio_path = (STUDIO_DIST / relative).resolve()
        if not str(studio_path).startswith(str(STUDIO_DIST) + os.sep):
            self.send_error(403)
            return

        if not studio_path.is_file():
            studio_path = STUDIO_DIST / "index.html"

        ctype = mimetypes.guess_type(str(studio_path))[0] or "application/octet-stream"
        body = studio_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)

    def send_studio_asset(self, file_name, include_body):
        if STUDIO_DIST is None or not STUDIO_DIST.is_dir():
            self.send_error(404)
            return

        studio_path = (STUDIO_DIST / file_name).resolve()
        if not str(studio_path).startswith(str(STUDIO_DIST) + os.sep):
            self.send_error(403)
            return
        if not studio_path.is_file():
            self.send_error(404)
            return

        ctype = mimetypes.guess_type(str(studio_path))[0] or "application/octet-stream"
        body = studio_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        if include_body:
            self.wfile.write(body)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=14242)
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Serving moNa2 web tools on http://{args.host}:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()

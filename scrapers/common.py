"""Shared HTTP helpers: polite session with retries, throttling, and an optional on-disk cache."""
from __future__ import annotations

import hashlib
import json
import re
import time
from pathlib import Path

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
CACHE_DIR = ROOT / ".cache"

USER_AGENT = "UCI-Planner-Scraper/0.1 (student course planning project)"


class Fetcher:
    """requests.Session wrapper that throttles requests and caches raw responses.

    Caching means re-running a parser after a code change doesn't re-hit the servers.
    Pass use_cache=False (or --no-cache on the CLI) to force fresh data.
    """

    def __init__(self, delay: float = 1.0, use_cache: bool = True):
        self.delay = delay
        self.use_cache = use_cache
        self._last = 0.0
        self.session = requests.Session()
        self.session.headers["User-Agent"] = USER_AGENT
        retry = Retry(total=4, backoff_factor=2, status_forcelist=(429, 500, 502, 503, 504),
                      allowed_methods=("GET", "POST"))
        self.session.mount("https://", HTTPAdapter(max_retries=retry))
        CACHE_DIR.mkdir(exist_ok=True)

    def _cache_path(self, method: str, url: str, data: dict | None) -> Path:
        key = json.dumps([method, url, data], sort_keys=True)
        return CACHE_DIR / (hashlib.sha1(key.encode()).hexdigest() + ".bin")

    def fetch(self, url: str, data: dict | None = None) -> bytes:
        method = "POST" if data is not None else "GET"
        path = self._cache_path(method, url, data)
        if self.use_cache and path.exists():
            return path.read_bytes()

        wait = self.delay - (time.monotonic() - self._last)
        if wait > 0:
            time.sleep(wait)
        resp = self.session.request(method, url, data=data, timeout=60)
        self._last = time.monotonic()
        resp.raise_for_status()
        path.write_bytes(resp.content)
        return resp.content


def clean(text: str | None) -> str:
    """Collapse whitespace (including &nbsp;) into single spaces."""
    if not text:
        return ""
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


def write_json(obj, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  wrote {path.relative_to(ROOT)}")

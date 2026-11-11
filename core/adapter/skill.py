"""Skill Adapter: runs the day-trader-skill CLIs as subprocesses and normalises their output.

Contract (blueprint 6.4): fixed argv (no shell), allow-listed scripts, `python -I`, a timeout, a sanitised env,
the shared working directory where trader/ lives. Exit codes carry meaning and are mapped to
ok / blocked / empty / error. Where a tool prints text only, the adapter reads the JSON file it writes.
"""
from __future__ import annotations

import asyncio
import hashlib
import copy
import json
import os
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path

from ..config import ENV, REPO, WORKDIR

SCRIPTS = {
    "trader-scanner": "scan.py", "trader-news": "news.py", "trader-entry": "entry.py", "trader-exit": "exit.py",
    "trader-timemachine": "timemachine.py", "trader-budget": "size.py", "trader-risk": "check.py",
    "trader-broker": "ticket.py", "trader-alerts": "alerts.py", "trader-analyst": "facts.py",
    "trader-deals": "deals.py",
}

# per-skill exit-code meaning (repo docs): risk 1 = at least one BLOCK; scanner 1 = nothing found
EXIT_MAP = {
    "trader-risk": {0: "ok", 1: "blocked"},
    "trader-scanner": {0: "ok", 1: "empty"},
    "trader-broker": {0: "ok", 1: "blocked"},
    "trader-alerts": {0: "ok", 1: "empty"},
    "trader-deals": {0: "ok", 1: "empty"},     # check: 1 = nothing rang; clock: 1 = market closed
}

WATCHED = ["trader/watchlist.json", "trader/entry.json", "trader/plan.json", "trader/timemachine.json",
           "trader/orders.json", "trader/prices.json", "trader/portfolio.json", "trader/alerts.json",
           "trader/metrics.json", "trader/state/news.json", "trader/state/risk.json",
           "trader/state/broker.json", "trader/state/alerts.json", "trader/state/deals.json"]


@dataclass
class ToolResult:
    tool: str
    ok: bool
    status: str
    code: int
    data: object = None
    text: str = ""
    stderr: str = ""
    files: list = field(default_factory=list)
    ms: int = 0
    argv: list = field(default_factory=list)
    evidence: list = field(default_factory=list)

    def to_dict(self):
        d = asdict(self)
        d["argv"] = [a for a in self.argv if not a.startswith(sys.executable)]
        return d

    def digest(self) -> str:
        return hashlib.sha256(json.dumps(self.data, sort_keys=True, default=str).encode()
                              + self.text.encode()).hexdigest()[:16]


def _safe_env() -> dict:
    keep = ("PATH", "SYSTEMROOT", "SYSTEMDRIVE", "TEMP", "TMP", "WINDIR", "COMSPEC", "LANG", "HOME",
            "USERPROFILE", "APPDATA", "LOCALAPPDATA")
    env = {k: os.environ[k] for k in keep if k in os.environ}
    env["PYTHONIOENCODING"] = "utf-8"
    env["PYTHONUTF8"] = "1"
    env["SEC_USER_AGENT"] = ENV["sec_user_agent"]
    return env


def _snapshot() -> dict[str, float]:
    out = {}
    for rel in WATCHED:
        p = WORKDIR / rel
        if p.exists():
            out[rel] = p.stat().st_mtime_ns
    return out


def file_evidence(rel: str) -> dict | None:
    p = WORKDIR / rel
    if not p.exists():
        return None
    return {"file": rel, "sha256": hashlib.sha256(p.read_bytes()).hexdigest()[:16]}


def _run_blocking(argv: list[str], timeout: float) -> tuple[int, str, str]:
    try:
        proc = subprocess.run(argv, cwd=str(WORKDIR), env=_safe_env(), capture_output=True, timeout=timeout,
                              creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
        return proc.returncode, proc.stdout.decode("utf-8", "replace"), proc.stderr.decode("utf-8", "replace")
    except subprocess.TimeoutExpired:
        return 124, "", f"timed out after {timeout:.0f}s"


async def run_skill(skill: str, args: list[str], *, timeout: float = 90, want_json: bool = True,
                    read_file: str | None = None) -> ToolResult:
    if skill not in SCRIPTS:
        raise ValueError(f"skill not allow-listed: {skill}")
    script = REPO / skill / SCRIPTS[skill]
    argv = [sys.executable, "-I", str(script), *[str(a) for a in args]]
    before = _snapshot()
    t0 = time.perf_counter()
    code, out, err = await asyncio.to_thread(_run_blocking, argv, timeout)
    ms = int((time.perf_counter() - t0) * 1000)
    after = _snapshot()
    changed = [k for k, v in after.items() if before.get(k) != v]
    status = EXIT_MAP.get(skill, {0: "ok"}).get(code, "error")
    data = None
    if want_json and out.strip().startswith(("{", "[")):
        try:
            data = json.loads(out)
        except ValueError:
            data = None
    if data is None and read_file:
        p = WORKDIR / read_file
        if p.exists():
            try:
                data = json.loads(p.read_text(encoding="utf-8"))
            except ValueError:
                data = None
    if status == "error" and code == 1 and data is not None:
        status = "empty"        # the repo's convention: exit 1 with a valid report = "nothing to report"
    evidence = [e for e in (file_evidence(c) for c in changed) if e]
    return ToolResult(tool=skill, ok=status in ("ok", "empty", "blocked"), status=status, code=code, data=data,
                      text=out if data is None else "", stderr=err.strip()[-2000:], files=changed, ms=ms,
                      argv=argv, evidence=evidence)


_READ_CACHE: dict[str, tuple[int, int, object]] = {}   # path -> (mtime_ns, size, parsed JSON)


def read_trader(rel: str, default=None):
    """Read a trader/ JSON file. Parsed results are cached by (mtime, size), so the 2 Hz tick loop no longer
    re-parses broker.json on every call; callers get a deep copy and may mutate it freely."""
    p = WORKDIR / "trader" / rel
    try:
        st = p.stat()
    except OSError:
        _READ_CACHE.pop(str(p), None)
        return default
    hit = _READ_CACHE.get(str(p))
    if hit and hit[0] == st.st_mtime_ns and hit[1] == st.st_size:
        return copy.deepcopy(hit[2])
    try:
        doc = json.loads(p.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return default
    _READ_CACHE[str(p)] = (st.st_mtime_ns, st.st_size, doc)
    return copy.deepcopy(doc)


def write_trader(rel: str, doc) -> None:
    p = WORKDIR / "trader" / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(doc, indent=2, default=str), encoding="utf-8")


_ = Path

#!/usr/bin/env python3
"""Preflight port check - refuse to start on a port something else already owns.

Run automatically by `make up`. Ports come from .env (or the defaults below) so
changing a port is a one-line edit, never a hunt through compose files.

Exit 0 = all clear. Exit 1 = collision, with the offending port named and a
suggested free block printed.
"""
from __future__ import annotations

import os
import socket
import sys
from pathlib import Path

# name -> (env var, default)
PORTS: dict[str, tuple[str, int]] = {
    "web": ("WEB_PORT", 8420),
    "api": ("API_PORT", 8421),
    "db": ("DB_PORT", 8422),
    "redis": ("REDIS_PORT", 8423),
}

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"


def load_env() -> dict[str, str]:
    values: dict[str, str] = {}
    if ENV_FILE.exists():
        for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = raw.split("#", 1)[0].strip()
            if "=" in line:
                k, v = line.split("=", 1)
                values[k.strip()] = v.strip()
    values.update({k: v for k, v in os.environ.items() if k in
                   {var for var, _ in PORTS.values()}})
    return values


def in_use(port: int) -> bool:
    """True if something is already LISTENing on this port."""
    for family, addr in ((socket.AF_INET, ("127.0.0.1", port)),):
        with socket.socket(family, socket.SOCK_STREAM) as s:
            s.settimeout(0.4)
            if s.connect_ex(addr) == 0:
                return True
    # Also try to bind - catches listeners that refuse connections.
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            s.bind(("0.0.0.0", port))
        except OSError:
            return True
    return False


def find_free_block(size: int, start: int = 8420, stop: int = 9600) -> list[int] | None:
    for base in range(start, stop, 10):
        block = list(range(base, base + size))
        if not any(in_use(p) for p in block):
            return block
    return None


def main() -> int:
    env = load_env()
    clashes: list[tuple[str, int]] = []

    print("Port preflight:")
    for name, (var, default) in PORTS.items():
        port = int(env.get(var, default))
        busy = in_use(port)
        print(f"  {name:<6} {port:<6} {'IN USE  <-- collision' if busy else 'free'}")
        if busy:
            clashes.append((name, port))

    if not clashes:
        print("All ports free.")
        return 0

    print("\nRefusing to start: " +
          ", ".join(f"{n} port {p}" for n, p in clashes) + " already in use.")
    block = find_free_block(len(PORTS))
    if block:
        print("\nA free block is available. Put this in .env:")
        for (name, (var, _)), port in zip(PORTS.items(), block):
            print(f"  {var}={port}   # {name}")
    print("\nIdentify the current owner with:")
    print("  powershell -Command \"Get-NetTCPConnection -State Listen -LocalPort "
          f"{clashes[0][1]} | %{{ Get-Process -Id $_.OwningProcess }}\"")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())

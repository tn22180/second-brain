"""Aggregate today's raw signal from all enabled sources into one text blob."""
import importlib

SECTIONS = [
    ("sessions", "Claude Code activity (prompts today)"),
    ("gitlog",   "Git commits today"),
    ("daily",    "Open loops"),
    ("inbox",    "Manual inbox jots"),
]


def collect(cfg, date) -> str:
    parts = [f"# Raw signal for {date}"]
    for key, title in SECTIONS:
        if not cfg["sources"].get(key):
            continue
        mod = importlib.import_module(f"sources.{key}")
        try:
            body = mod.collect(cfg, date)
        except Exception as e:  # one bad source must not kill the day
            body = f"(source error: {e})"
        parts.append(f"\n## {title}\n{body}")
    return "\n".join(parts)

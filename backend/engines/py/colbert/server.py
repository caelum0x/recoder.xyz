"""ColBERT ANN index search HTTP service (index-backed, degrade-safe).

Serves a prebuilt ColBERT index via ``Searcher`` over a small HTTP surface.
Unlike ``rerank_server.py`` (which scores caller-supplied passages on the fly),
this endpoint searches a prebuilt index and requires both a built index and the
heavy ``torch`` / ``colbert`` stack.

Design constraints:

- **No import-time heavy side-effects.** The ``Searcher`` is NOT constructed at
  module import time. Building it eagerly would crash the whole sidecar on a
  bare interpreter (no torch) or when ``INDEX_NAME`` / ``INDEX_ROOT`` are unset.
  Instead it is loaded lazily on first ``/api/search`` and cached, so the
  service BOOTS and answers ``/health`` truthfully even when search is not yet
  possible.

- **Honest degrade.** When torch/colbert are missing or the index is not
  configured, ``/api/search`` returns a ``503`` with a truthful reason rather
  than a stack trace, and ``/health`` reports ``search_available: false``.

Environment:
    INDEX_NAME    Name of the prebuilt ColBERT index.
    INDEX_ROOT    Directory containing the index.
    PORT          Port to bind when run as a script.
    COLBERT_HOST  Interface to bind. Defaults to "127.0.0.1" (loopback).

Boot:
    INDEX_NAME=<name> INDEX_ROOT=<dir> PORT=8894 python server.py
"""

import math
import os
from functools import lru_cache

from dotenv import load_dotenv
from flask import Flask, request, jsonify

load_dotenv()

app = Flask(__name__)
counter = {"api": 0}


@lru_cache(maxsize=1)
def _probe_capability():
    """Lazily check whether index search is possible, cached once.

    Returns ``(available, reason)``. Verifies the heavy imports AND that the
    index location is configured. Never constructs the Searcher (that is
    deferred to ``_get_searcher``), so ``/health`` stays cheap.
    """
    index_name = os.getenv("INDEX_NAME")
    index_root = os.getenv("INDEX_ROOT")
    if not index_name or not index_root:
        return False, "index not configured (set INDEX_NAME and INDEX_ROOT)"
    try:
        import torch  # noqa: F401
        from colbert import Searcher  # noqa: F401
        from colbert.infra import Run, RunConfig, ColBERTConfig  # noqa: F401

        return True, None
    except Exception as exc:  # pragma: no cover - only without deps
        return False, str(exc)


@lru_cache(maxsize=1)
def _get_searcher():
    """Construct and cache the ColBERT Searcher on first use.

    Only reached after ``_probe_capability`` confirmed imports + configuration,
    so the heavy imports here are guaranteed to succeed.
    """
    from colbert import Searcher

    return Searcher(index=os.getenv("INDEX_NAME"), index_root=os.getenv("INDEX_ROOT"))


@lru_cache(maxsize=1000000)
def api_search_query(query, k):
    if k is None:
        k = 10
    k = min(int(k), 100)
    searcher = _get_searcher()
    pids, ranks, scores = searcher.search(query, k=100)
    pids, ranks, scores = pids[:k], ranks[:k], scores[:k]
    probs = [math.exp(score) for score in scores]
    probs = [prob / sum(probs) for prob in probs]
    topk = []
    for pid, rank, score, prob in zip(pids, ranks, scores, probs):
        text = searcher.collection[pid]
        d = {"text": text, "pid": pid, "rank": rank, "score": score, "prob": prob}
        topk.append(d)
    topk = list(sorted(topk, key=lambda p: (-1 * p["score"], p["pid"])))
    return {"query": query, "topk": topk}


@app.route("/api/search", methods=["GET"])
def api_search():
    available, reason = _probe_capability()
    if not available:
        # Honest degrade: search cannot run (no torch/index). Non-2xx lets the
        # caller fall back instead of surfacing a stack trace.
        return jsonify({"error": "search unavailable: %s" % reason}), 503

    counter["api"] += 1
    try:
        return jsonify(api_search_query(request.args.get("query"), request.args.get("k")))
    except Exception as exc:  # pragma: no cover - runtime model/index failure
        return jsonify({"error": "search failed: %s" % exc}), 500


@app.route("/health", methods=["GET"])
def health():
    available, reason = _probe_capability()
    return jsonify(
        {
            "search_available": available,
            "index_name": os.getenv("INDEX_NAME"),
            "index_root": os.getenv("INDEX_ROOT"),
            "reason": reason,
        }
    )


if __name__ == "__main__":
    host = os.environ.get("COLBERT_HOST", "127.0.0.1")
    app.run(host, int(os.getenv("PORT", "8894")))

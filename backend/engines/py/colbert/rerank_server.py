"""Clean, side-effect-free ColBERT late-interaction rerank HTTP service.

This module exposes a small loopback HTTP surface that scores caller-supplied
candidate passages against a query using ColBERT late interaction (MaxSim), and
returns the passages reranked by score. Unlike ``server.py`` (which serves a
prebuilt ANN index via ``Searcher``), this service scores passages on the fly,
so it does NOT require a built index — only a ColBERT checkpoint.

Design constraints (why this file looks the way it does):

- **No import-time heavy side-effects.** ``torch`` and the ``colbert`` model are
  NOT imported at module import time. Importing this module (and
  ``python -m py_compile``) succeeds on a bare interpreter with only Flask
  present. The heavy import happens lazily, the first time a rerank is actually
  requested, inside ``_probe_capability`` / ``_load_checkpoint``. This lets the
  sidecar BOOT and answer ``/health`` truthfully even when ``torch`` is absent.

- **Honest degrade, never fake success.** When ``torch``/``colbert`` cannot be
  imported (e.g. torch not installed under disk pressure), ``/rerank`` returns a
  ``503`` with a truthful ``rerank unavailable: <reason>`` message instead of
  crashing. The Node-side ``RerankerPort`` is degrade-safe: on any non-2xx it
  falls back to the original retrieval order, so a truthful 503 is the correct
  contract, not an error to hide.

Endpoints:
    GET  /health   -> {"rerank_available": bool, "checkpoint": str,
                       "torch": str | None, "reason": str | None}
    POST /rerank   -> body {"query": str, "passages": [str, ...]}
                      returns {"results": [{"index": int, "score": float}, ...]}
    POST /score    -> body {"query": str, "passages": [str, ...]}
                      returns {"scores": [float, ...]} aligned to input order
                      (raw MaxSim scores, no reordering — richer surface for
                      callers that want to fuse ColBERT scores with their own).

Environment:
    COLBERT_CHECKPOINT  Path or HF id of the ColBERT checkpoint. Defaults to
                        "colbert-ir/colbertv2.0".
    PORT                Port to bind when run as a script. Defaults to 8893.
    RERANK_HOST         Interface to bind when run as a script. Defaults to
                        "127.0.0.1" (loopback). Set "0.0.0.0" to expose widely.

Boot:
    PORT=8893 python rerank_server.py
"""

import os
from functools import lru_cache

from flask import Flask, jsonify, request

DEFAULT_CHECKPOINT = "colbert-ir/colbertv2.0"

app = Flask(__name__)


@lru_cache(maxsize=1)
def _probe_capability():
    """Lazily determine whether real reranking is possible.

    Attempts the heavy ``torch`` + ``colbert`` imports exactly once and caches
    the outcome. Returns ``(available: bool, torch_version: str | None,
    reason: str | None)``. Called only from request handlers, never at import
    time, so the module stays side-effect-free and the sidecar boots without
    torch installed.
    """
    try:
        import torch  # noqa: F401
        from colbert.modeling.checkpoint import Checkpoint  # noqa: F401
        from colbert.infra import ColBERTConfig  # noqa: F401

        return True, getattr(torch, "__version__", "unknown"), None
    except Exception as exc:  # pragma: no cover - exercised only without deps
        return False, None, str(exc)


@lru_cache(maxsize=1)
def _load_checkpoint():
    """Lazily load the ColBERT checkpoint once.

    Only reached after ``_probe_capability`` confirmed the heavy symbols import,
    so the imports here are guaranteed to succeed. Kept separate from the probe
    so ``/health`` can report capability without paying model-load cost.
    """
    from colbert.modeling.checkpoint import Checkpoint
    from colbert.infra import ColBERTConfig

    checkpoint_name = os.getenv("COLBERT_CHECKPOINT", DEFAULT_CHECKPOINT)
    config = ColBERTConfig()
    return Checkpoint(checkpoint_name, colbert_config=config)


def _late_interaction_scores(query, passages):
    """Compute ColBERT MaxSim late-interaction scores for each passage.

    Returns a list of floats aligned to ``passages``. Pure scoring helper; the
    HTTP layer handles ordering and error mapping. ``torch`` is imported lazily
    by ``_load_checkpoint`` before this runs.
    """
    checkpoint = _load_checkpoint()

    # Encode query (Q) and passages (D) into token-level embeddings.
    query_embedding = checkpoint.queryFromText([query])
    doc_embeddings = checkpoint.docFromText(passages)

    scores = []
    for doc_embedding in doc_embeddings:
        # MaxSim: for each query token, take the max similarity over doc tokens,
        # then sum over query tokens. ``@`` is matmul; ``.max(dim)`` reduces.
        similarity = query_embedding[0] @ doc_embedding.transpose(0, 1)
        max_per_query_token = similarity.max(dim=1).values
        scores.append(float(max_per_query_token.sum().item()))
    return scores


def _validate_payload():
    """Parse and validate the shared {query, passages} request body.

    Returns ``(query, passages, error_response)``. On success ``error_response``
    is ``None``; on failure the first two are ``None`` and a Flask 400 response
    tuple is returned.
    """
    payload = request.get_json(silent=True) or {}
    query = payload.get("query")
    passages = payload.get("passages")

    if not isinstance(query, str) or not isinstance(passages, list):
        return (
            None,
            None,
            (jsonify({"error": "expected JSON body {query: str, passages: [str]}"}), 400),
        )
    return query, passages, None


@app.route("/rerank", methods=["POST"])
def rerank():
    query, passages, error = _validate_payload()
    if error is not None:
        return error

    available, _torch_version, reason = _probe_capability()
    if not available:
        # Degrade-safe: tell the caller reranking is unavailable so it can fall
        # back to the original order. Non-2xx triggers the Node fallback path.
        return jsonify({"error": "rerank unavailable: %s" % reason}), 503

    if not passages:
        return jsonify({"results": []})

    try:
        scores = _late_interaction_scores(query, passages)
    except Exception as exc:  # pragma: no cover - runtime model failure
        return jsonify({"error": "rerank failed: %s" % exc}), 500

    ranked = sorted(
        ({"index": i, "score": s} for i, s in enumerate(scores)),
        key=lambda r: -r["score"],
    )
    return jsonify({"results": ranked})


@app.route("/score", methods=["POST"])
def score():
    """Return raw MaxSim scores aligned to input order (no reordering).

    Useful for callers that fuse ColBERT late-interaction scores with their own
    signals (e.g. reciprocal-rank fusion) rather than taking the reranked order.
    """
    query, passages, error = _validate_payload()
    if error is not None:
        return error

    available, _torch_version, reason = _probe_capability()
    if not available:
        return jsonify({"error": "score unavailable: %s" % reason}), 503

    if not passages:
        return jsonify({"scores": []})

    try:
        scores = _late_interaction_scores(query, passages)
    except Exception as exc:  # pragma: no cover - runtime model failure
        return jsonify({"error": "score failed: %s" % exc}), 500

    return jsonify({"scores": scores})


@app.route("/health", methods=["GET"])
def health():
    """Report true rerank capability without loading the model.

    ``rerank_available`` reflects whether torch + colbert import cleanly. When
    false, ``reason`` carries the import error so operators see the honest
    blocker (e.g. "No module named 'torch'") instead of a silent degrade.
    """
    available, torch_version, reason = _probe_capability()
    return jsonify(
        {
            "rerank_available": available,
            "checkpoint": os.getenv("COLBERT_CHECKPOINT", DEFAULT_CHECKPOINT),
            "torch": torch_version,
            "reason": reason,
        }
    )


if __name__ == "__main__":  # pragma: no cover
    app.run(os.getenv("RERANK_HOST", "127.0.0.1"), int(os.getenv("PORT", "8893")))

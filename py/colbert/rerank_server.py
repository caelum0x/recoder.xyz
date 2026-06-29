"""Thin, additive ColBERT late-interaction rerank HTTP endpoint.

This module exposes a single ``POST /rerank`` endpoint that scores a list of
candidate passages against a query using ColBERT late interaction, and returns
the passages reranked by score. Unlike ``server.py`` (which serves a prebuilt
ANN index via ``Searcher``), this endpoint scores caller-supplied passages
on the fly, so it does NOT require a built index.

Design constraints:
- The heavy ``torch`` / ``colbert`` imports are guarded. Importing this module
  (and ``python -m py_compile``) succeeds even when those deps are absent; the
  endpoint then reports that reranking is unavailable rather than crashing.
- The Node-side ``RerankerPort`` is degrade-safe: if this endpoint is missing or
  returns an error, the caller falls back to the original retrieval order. This
  endpoint mirrors that contract by failing softly with a clear JSON error.

Request body (JSON):
    {"query": "...", "passages": ["passage a", "passage b", ...]}

Response body (JSON):
    {"results": [{"index": <original_index>, "score": <float>}, ...]}

``index`` refers to the position of the passage in the request ``passages``
array, sorted descending by late-interaction ``score``.

Environment:
    COLBERT_CHECKPOINT  Path or HF id of the ColBERT checkpoint. Defaults to
                        "colbert-ir/colbertv2.0".
    PORT                Port to bind when run as a script. Defaults to 8893.
"""

import os
from functools import lru_cache

from flask import Flask, jsonify, request

# Guarded heavy import: keep ``py_compile`` / module import working without torch
# or the colbert package installed. ``RERANK_AVAILABLE`` gates real scoring.
try:  # pragma: no cover - depends on heavy optional deps
    import torch  # noqa: F401
    from colbert.modeling.checkpoint import Checkpoint
    from colbert.infra import ColBERTConfig

    RERANK_AVAILABLE = True
    IMPORT_ERROR = None
except Exception as exc:  # pragma: no cover - exercised only without deps
    RERANK_AVAILABLE = False
    IMPORT_ERROR = str(exc)


DEFAULT_CHECKPOINT = "colbert-ir/colbertv2.0"

app = Flask(__name__)


@lru_cache(maxsize=1)
def _load_checkpoint():
    """Lazily load the ColBERT checkpoint once.

    Only called when ``RERANK_AVAILABLE`` is True, so the heavy symbols are
    guaranteed to be importable at this point.
    """
    checkpoint_name = os.getenv("COLBERT_CHECKPOINT", DEFAULT_CHECKPOINT)
    config = ColBERTConfig()
    return Checkpoint(checkpoint_name, colbert_config=config)


def _late_interaction_scores(query, passages):
    """Compute ColBERT MaxSim late-interaction scores for each passage.

    Returns a list of floats aligned to ``passages``. Pure scoring helper; the
    HTTP layer handles ordering and error mapping.
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


@app.route("/rerank", methods=["POST"])
def rerank():
    payload = request.get_json(silent=True) or {}
    query = payload.get("query")
    passages = payload.get("passages")

    if not isinstance(query, str) or not isinstance(passages, list):
        return (
            jsonify({"error": "expected JSON body {query: str, passages: [str]}"}),
            400,
        )

    if not RERANK_AVAILABLE:
        # Degrade-safe: tell the caller reranking is unavailable so it can fall
        # back to the original order. Non-2xx triggers the Node fallback path.
        return (
            jsonify({"error": "rerank unavailable: %s" % IMPORT_ERROR}),
            503,
        )

    if not passages:
        return jsonify({"results": []})

    try:
        scores = _late_interaction_scores(query, passages)
    except Exception as exc:  # pragma: no cover - runtime model failure
        return (jsonify({"error": "rerank failed: %s" % exc}), 500)

    ranked = sorted(
        ({"index": i, "score": s} for i, s in enumerate(scores)),
        key=lambda r: -r["score"],
    )
    return jsonify({"results": ranked})


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"rerank_available": RERANK_AVAILABLE})


if __name__ == "__main__":  # pragma: no cover
    app.run("0.0.0.0", int(os.getenv("PORT", "8893")))

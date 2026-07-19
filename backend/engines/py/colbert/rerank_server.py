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

This module ALSO exposes index-management + batch surfaces (added for the deep
backend fusion). List/drop/stats are pure filesystem + JSON — they work on a
bare interpreter (no torch), so index inventory degrades truthfully rather than
crashing. Batch rerank and index *build* need the heavy stack and honestly 503
when torch/colbert are absent, exactly like ``/rerank``.

Endpoints:
    GET    /health                     -> {"rerank_available": bool, "checkpoint": str,
                                           "torch": str | None, "reason": str | None,
                                           "index_root": str}
    POST   /rerank                      -> body {"query": str, "passages": [str, ...]}
                                           returns {"results": [{"index","score"}, ...]}
    POST   /score                       -> body {"query": str, "passages": [str, ...]}
                                           returns {"scores": [float, ...]} (input order)
    POST   /rerank/batch                -> body {"batch": [{"query","passages"}, ...]}
                                           returns {"results": [{"query_index",
                                           "results": [{"index","score"}, ...]}, ...]}
    GET    /collections                 -> {"index_root", "collections": [summary, ...],
                                           "reason": str | None}   (filesystem only)
    POST   /collections                 -> body {"name","passages":[str],"overwrite"?}
                                           builds a REAL ColBERT index; 503 w/o torch
    GET    /collections/<name>/stats    -> index summary (documents/embeddings/bytes)
    DELETE /collections/<name>          -> {"name","dropped":bool,"removed_files":int}

Environment:
    COLBERT_CHECKPOINT  Path or HF id of the ColBERT checkpoint. Defaults to
                        "colbert-ir/colbertv2.0".
    COLBERT_INDEX_ROOT  Directory holding built ColBERT indexes (one subdir per
                        collection). Falls back to INDEX_ROOT, then ColBERT's own
                        default "<cwd>/experiments/default/indexes".
    PORT                Port to bind when run as a script. Defaults to 8893.
    RERANK_HOST         Interface to bind when run as a script. Defaults to
                        "127.0.0.1" (loopback). Set "0.0.0.0" to expose widely.

Boot:
    PORT=8893 python rerank_server.py
"""

import json
import os
import re
import shutil
from functools import lru_cache

from flask import Flask, jsonify, request

DEFAULT_CHECKPOINT = "colbert-ir/colbertv2.0"

# Collection names map to on-disk directories, so restrict them to a safe,
# traversal-proof character class (no slashes, dots-only, or path escapes).
COLLECTION_NAME_RE = re.compile(r"^[A-Za-z0-9._-]+$")

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


@app.route("/rerank/batch", methods=["POST"])
def rerank_batch():
    """Rerank several ``{query, passages}`` items in one round-trip (real MaxSim).

    Body: ``{"batch": [{"query": str, "passages": [str, ...]}, ...]}``. Returns
    ``{"results": [{"query_index": i, "results": [{index, score}, ...]}, ...]}``
    with each item's passages reordered best-first. Amortizes the per-call HTTP
    and checkpoint-warm cost across many queries. Degrade-safe: a single 503 when
    torch/colbert are absent lets the caller fall back to identity order for the
    whole batch, mirroring ``/rerank``.
    """
    payload = request.get_json(silent=True) or {}
    batch = payload.get("batch")
    if not isinstance(batch, list):
        return jsonify({"error": "expected JSON body {batch: [{query, passages}]}"}), 400

    items = []
    for entry in batch:
        if not isinstance(entry, dict):
            return jsonify({"error": "each batch item must be an object {query, passages}"}), 400
        query = entry.get("query")
        passages = entry.get("passages")
        if (
            not isinstance(query, str)
            or not isinstance(passages, list)
            or not all(isinstance(p, str) for p in passages)
        ):
            return jsonify({"error": "each batch item must be {query: str, passages: [str]}"}), 400
        items.append((query, passages))

    available, _torch_version, reason = _probe_capability()
    if not available:
        return jsonify({"error": "rerank unavailable: %s" % reason}), 503

    results = []
    try:
        for query_index, (query, passages) in enumerate(items):
            if not passages:
                results.append({"query_index": query_index, "results": []})
                continue
            scores = _late_interaction_scores(query, passages)
            ranked = sorted(
                ({"index": i, "score": s} for i, s in enumerate(scores)),
                key=lambda r: -r["score"],
            )
            results.append({"query_index": query_index, "results": ranked})
    except Exception as exc:  # pragma: no cover - runtime model failure
        return jsonify({"error": "rerank failed: %s" % exc}), 500

    return jsonify({"results": results})


def _index_root():
    """Resolve the ColBERT index root WITHOUT importing torch.

    Honors ``COLBERT_INDEX_ROOT``, then ``INDEX_ROOT``, else ColBERT's own
    default (``<cwd>/experiments/default/indexes``). Pure filesystem, so the
    inventory endpoints stay side-effect-free and answer truthfully on a bare
    interpreter.
    """
    explicit = os.getenv("COLBERT_INDEX_ROOT") or os.getenv("INDEX_ROOT")
    if explicit:
        return explicit
    return os.path.join(os.getcwd(), "experiments", "default", "indexes")


def _valid_name(name):
    """True when ``name`` is a safe, non-escaping collection identifier."""
    return isinstance(name, str) and name not in (".", "..") and bool(COLLECTION_NAME_RE.match(name))


def _index_dir(name):
    """Absolute index directory for ``name``, or ``None`` if invalid/escaping.

    Contains the resolved path within the index root so a crafted name can never
    read or delete outside it (defense-in-depth on top of ``_valid_name``).
    """
    if not _valid_name(name):
        return None
    root = os.path.abspath(_index_root())
    candidate = os.path.abspath(os.path.join(root, name))
    try:
        if os.path.commonpath([root, candidate]) != root or candidate == root:
            return None
    except ValueError:  # pragma: no cover - different drives on Windows
        return None
    return candidate


def _is_built_index(directory):
    """A built ColBERT index is any directory holding a top-level metadata.json."""
    return os.path.isfile(os.path.join(directory, "metadata.json"))


def _dir_bytes(directory):
    """Total on-disk size (bytes) of ``directory``; unreadable files are skipped."""
    total = 0
    for dirpath, _dirs, files in os.walk(directory):
        for fname in files:
            try:
                total += os.path.getsize(os.path.join(dirpath, fname))
            except OSError:  # pragma: no cover - transient fs race
                pass
    return total


def _read_metadata(directory):
    """Load a built index's top-level metadata.json, or ``{}`` when unreadable."""
    try:
        with open(os.path.join(directory, "metadata.json")) as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return {}


def _collection_summary(name, directory):
    """Filesystem-only summary for one built index (no torch, no model load).

    ``documents`` is derived from ColBERT's ``num_embeddings / avg_doclen`` and
    is ``None`` when the metadata predates those fields, so the number is never
    fabricated.
    """
    meta = _read_metadata(directory)
    num_embeddings = meta.get("num_embeddings")
    avg_doclen = meta.get("avg_doclen")
    documents = None
    if (
        isinstance(num_embeddings, (int, float))
        and isinstance(avg_doclen, (int, float))
        and avg_doclen
    ):
        documents = int(round(num_embeddings / avg_doclen))
    return {
        "name": name,
        "documents": documents,
        "embeddings": num_embeddings,
        "partitions": meta.get("num_partitions"),
        "chunks": meta.get("num_chunks"),
        "bytes": _dir_bytes(directory),
    }


@app.route("/collections", methods=["GET"])
def list_collections():
    """List built ColBERT indexes under the index root (filesystem only).

    Does NOT require torch: a collection is any subdir holding a metadata.json.
    Truthful when the root is absent (empty list + a ``reason``) instead of
    erroring, so callers can distinguish "no indexes" from "engine broken".
    """
    root = _index_root()
    if not os.path.isdir(root):
        return jsonify(
            {"index_root": root, "collections": [], "reason": "index root does not exist"}
        )
    collections = []
    for entry in sorted(os.listdir(root)):
        directory = os.path.join(root, entry)
        if os.path.isdir(directory) and _is_built_index(directory):
            collections.append(_collection_summary(entry, directory))
    return jsonify({"index_root": root, "collections": collections, "reason": None})


@app.route("/collections/<name>/stats", methods=["GET"])
def collection_stats(name):
    """Index stats for one collection (documents/embeddings/partitions/bytes)."""
    directory = _index_dir(name)
    if directory is None:
        return jsonify({"error": "invalid collection name"}), 400
    if not (os.path.isdir(directory) and _is_built_index(directory)):
        return jsonify({"error": "collection not found: %s" % name, "exists": False}), 404
    summary = _collection_summary(name, directory)
    summary["exists"] = True
    summary["index_path"] = directory
    return jsonify(summary)


@app.route("/collections/<name>", methods=["DELETE"])
def drop_collection(name):
    """Drop a built ColBERT index (remove its directory). Filesystem only."""
    directory = _index_dir(name)
    if directory is None:
        return jsonify({"error": "invalid collection name"}), 400
    if not os.path.isdir(directory):
        return jsonify({"error": "collection not found: %s" % name, "dropped": False}), 404
    try:
        removed = sum(len(files) for _dir, _sub, files in os.walk(directory))
        shutil.rmtree(directory)
    except OSError as exc:
        return jsonify({"error": "drop failed: %s" % exc}), 500
    return jsonify({"name": name, "dropped": True, "removed_files": removed})


def _build_index(name, passages):
    """Run the REAL ColBERT indexer to build ``name`` under the index root.

    Only reached after ``_probe_capability`` confirmed torch + colbert import, so
    the heavy imports here are guaranteed to succeed. Runs single-rank and
    fork-free so it is safe inside the Flask process, and writes under the
    resolved index root so the inventory endpoints see it immediately. Uses
    ``force_silent_overwrite`` to avoid the CLI's interactive 20s erase pause.
    """
    from colbert import Indexer
    from colbert.infra import Run, RunConfig, ColBERTConfig

    checkpoint_name = os.getenv("COLBERT_CHECKPOINT", DEFAULT_CHECKPOINT)
    index_root = os.path.abspath(_index_root())
    with Run().context(RunConfig(nranks=1, avoid_fork_if_possible=True)):
        config = ColBERTConfig(index_root=index_root)
        indexer = Indexer(checkpoint=checkpoint_name, config=config)
        indexer.index(name=name, collection=list(passages), overwrite="force_silent_overwrite")
        return indexer.get_index()


@app.route("/collections", methods=["POST"])
def create_collection():
    """Build a ColBERT index from caller-supplied passages (real indexer).

    Body: ``{"name": str, "passages": [str, ...], "overwrite"?: bool}``. Requires
    torch + colbert and honestly 503s when they are absent (the Node adapter
    surfaces that truthfully rather than faking a build). Refuses to clobber an
    existing collection unless ``overwrite`` is set.
    """
    payload = request.get_json(silent=True) or {}
    name = payload.get("name")
    passages = payload.get("passages")
    overwrite = bool(payload.get("overwrite", False))

    if not _valid_name(name):
        return jsonify({"error": "invalid collection name (allowed chars: A-Za-z0-9._-)"}), 400
    if not isinstance(passages, list) or not all(isinstance(p, str) for p in passages):
        return jsonify({"error": "expected passages: [str, ...]"}), 400
    if not passages:
        return jsonify({"error": "passages must be non-empty to build an index"}), 400

    directory = _index_dir(name)
    if directory is None:
        return jsonify({"error": "invalid collection name"}), 400
    if _is_built_index(directory) and not overwrite:
        return jsonify({"error": "collection exists: %s (pass overwrite=true)" % name}), 409

    available, _torch_version, reason = _probe_capability()
    if not available:
        return jsonify({"error": "index build unavailable: %s" % reason}), 503

    try:
        index_path = _build_index(name, passages)
    except Exception as exc:  # pragma: no cover - heavy runtime path
        return jsonify({"error": "index build failed: %s" % exc}), 500

    summary = _collection_summary(name, index_path)
    summary["index_path"] = index_path
    summary["created"] = True
    return jsonify(summary)


@app.route("/health", methods=["GET"])
def health():
    """Report true rerank capability without loading the model.

    ``rerank_available`` reflects whether torch + colbert import cleanly. When
    false, ``reason`` carries the import error so operators see the honest
    blocker (e.g. "No module named 'torch'") instead of a silent degrade.
    ``index_root`` is surfaced so operators can see where collections resolve.
    """
    available, torch_version, reason = _probe_capability()
    return jsonify(
        {
            "rerank_available": available,
            "checkpoint": os.getenv("COLBERT_CHECKPOINT", DEFAULT_CHECKPOINT),
            "torch": torch_version,
            "reason": reason,
            "index_root": _index_root(),
        }
    )


if __name__ == "__main__":  # pragma: no cover
    app.run(os.getenv("RERANK_HOST", "127.0.0.1"), int(os.getenv("PORT", "8893")))

#!/usr/bin/env python3
"""Assert the Recoder Envoy bootstrap is FAIL-CLOSED at its governance gate.

Static string-grep is not enough: a config could carry an `ext_authz` filter
that is `failure_mode_allow: true` (fail-OPEN) and a naive `grep ext_authz`
would still pass. This walks the PARSED YAML and proves the real posture:

  1. At least one HTTP `ext_authz` filter exists  -> the edge is governed.
  2. EVERY `ext_authz` filter sets failure_mode_allow=false -> on an unreachable
     authz upstream Envoy DENIES (fail-closed / hostile-by-default).
  3. Each ext_authz points at the `recoder_ext_authz` cluster AND that cluster is
     actually defined in static_resources.clusters -> no dangling governance gate.

Exit 0 = fail-closed verified. Exit 1 = a posture violation (printed to stderr).
Usage: check-fail-closed.py <envoy-bootstrap.yaml>
"""
import sys

try:
    import yaml
except Exception as exc:  # pragma: no cover - caller already gates on PyYAML
    print(f"check-fail-closed: PyYAML unavailable: {exc}", file=sys.stderr)
    sys.exit(2)

EXT_AUTHZ_TYPE_SUFFIX = "filters.http.ext_authz.v3.ExtAuthz"


def _walk(node):
    """Yield every dict in a nested YAML structure (depth-first)."""
    if isinstance(node, dict):
        yield node
        for v in node.values():
            yield from _walk(v)
    elif isinstance(node, list):
        for v in node:
            yield from _walk(v)


def _is_ext_authz(filt):
    """A parsed http_filter dict is an ext_authz filter."""
    if not isinstance(filt, dict):
        return False
    if filt.get("name") == "envoy.filters.http.ext_authz":
        return True
    tc = filt.get("typed_config")
    if isinstance(tc, dict) and str(tc.get("@type", "")).endswith(EXT_AUTHZ_TYPE_SUFFIX):
        return True
    return False


def _typed_config(filt):
    tc = filt.get("typed_config")
    return tc if isinstance(tc, dict) else {}


def main(path):
    with open(path) as fh:
        doc = yaml.safe_load(fh)
    if not isinstance(doc, dict):
        print(f"check-fail-closed: {path}: not a YAML mapping", file=sys.stderr)
        return 1

    ext_authz_filters = [n for n in _walk(doc) if _is_ext_authz(n)]
    if not ext_authz_filters:
        print(
            f"check-fail-closed: {path}: NO ext_authz filter — the edge is "
            f"UNGOVERNED (no governance gate)",
            file=sys.stderr,
        )
        return 1

    # Gather defined cluster names so we can prove the authz cluster is real.
    defined_clusters = set()
    for clu in (doc.get("static_resources", {}) or {}).get("clusters", []) or []:
        if isinstance(clu, dict) and isinstance(clu.get("name"), str):
            defined_clusters.add(clu["name"])

    problems = []
    for filt in ext_authz_filters:
        tc = _typed_config(filt)
        # 1) Fail-closed posture. The key MUST be present and explicitly false.
        #    A MISSING failure_mode_allow defaults to false in Envoy, but for a
        #    security-critical edge we require it to be stated explicitly so the
        #    posture is auditable and cannot silently flip on a default change.
        if "failure_mode_allow" not in tc:
            problems.append(
                "ext_authz missing explicit failure_mode_allow (must be "
                "set false for an auditable fail-closed edge)"
            )
        elif tc.get("failure_mode_allow") is not False:
            problems.append(
                f"ext_authz failure_mode_allow={tc.get('failure_mode_allow')!r} "
                f"— FAIL-OPEN edge (must be false)"
            )
        # 2) The authz call must target the recoder_ext_authz governance cluster.
        cluster = (
            (tc.get("http_service", {}) or {})
            .get("server_uri", {})
            .get("cluster")
        )
        if cluster != "recoder_ext_authz":
            problems.append(
                f"ext_authz http_service.server_uri.cluster={cluster!r} "
                f"(expected 'recoder_ext_authz')"
            )
        elif cluster not in defined_clusters:
            problems.append(
                "ext_authz targets cluster 'recoder_ext_authz' which is NOT "
                "defined in static_resources.clusters (dangling governance gate)"
            )

    if problems:
        for p in problems:
            print(f"check-fail-closed: {path}: {p}", file=sys.stderr)
        return 1

    print(
        f"check-fail-closed: {path}: fail-closed OK "
        f"({len(ext_authz_filters)} ext_authz filter(s), failure_mode_allow=false, "
        f"-> recoder_ext_authz)"
    )
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("usage: check-fail-closed.py <envoy-bootstrap.yaml>", file=sys.stderr)
        sys.exit(2)
    sys.exit(main(sys.argv[1]))

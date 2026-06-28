"""External processor integrations, owned as first-party adapters.

Each integration implements the billing services' processor ports on top of a real SDK
that is imported lazily, strictly behind the adapter boundary, so the billing spine
AST-compiles and imports without the SDK installed.
"""

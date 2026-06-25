# Continuum <-> Graphiti sidecar (graphiti-core 0.29.x). Temporal knowledge graph on Neo4j.
# Embeddings + reranker on OpenAI; extraction LLM = OpenAI (default) or Anthropic. Run from this dir:
#   OPENAI_API_KEY=... NEO4J_PASSWORD=... uvicorn sidecar:app --port 8000
import os
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI
from pydantic import BaseModel
from graphiti_core import Graphiti
from graphiti_core.nodes import EpisodeType
from graphiti_core.llm_client.openai_client import OpenAIClient
from graphiti_core.llm_client.anthropic_client import AnthropicClient
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.embedder.openai import OpenAIEmbedder, OpenAIEmbedderConfig
from graphiti_core.cross_encoder.openai_reranker_client import OpenAIRerankerClient

OAI_KEY = os.environ["OPENAI_API_KEY"]   # embeddings + reranker (Anthropic has no embeddings API)
EMB_MODEL = os.environ.get("GRAPHITI_EMB_MODEL", "text-embedding-3-small")
EMB_DIM = int(os.environ.get("GRAPHITI_EMB_DIM", "1536"))

# The extraction LLM is the cost driver (several calls/episode). Switchable via GRAPHITI_LLM_PROVIDER:
#   anthropic (default) — Claude Sonnet+Haiku; reliable, ~$3-6/question. Use for the canonical run.
#   openai              — gpt-4o-mini; graphiti's native/tuned strict-structured-output path,
#                         ~15-20x cheaper. Use for scale-out (n>1/category) on the $20 OpenAI key.
# Open/local models are NOT an option for extraction: they can't satisfy graphiti's strict
# schemas (EdgeDuplicate/NodeResolutions) → pydantic ValidationError. Use a frontier model.
PROVIDER = os.environ.get("GRAPHITI_LLM_PROVIDER", "openai").lower()
if PROVIDER == "openai":
    LLM_MODEL = os.environ.get("GRAPHITI_LLM_MODEL", "gpt-4o-mini")
    llm = OpenAIClient(config=LLMConfig(api_key=OAI_KEY, model=LLM_MODEL, small_model=LLM_MODEL))
else:
    ANTHROPIC_KEY = os.environ["ANTHROPIC_API_KEY"]
    LLM_MODEL = os.environ.get("GRAPHITI_LLM_MODEL", "claude-sonnet-4-6")
    LLM_SMALL = os.environ.get("GRAPHITI_LLM_SMALL", "claude-haiku-4-5-20251001")
    llm = AnthropicClient(config=LLMConfig(api_key=ANTHROPIC_KEY, model=LLM_MODEL, small_model=LLM_SMALL))
emb = OpenAIEmbedder(config=OpenAIEmbedderConfig(api_key=OAI_KEY, embedding_model=EMB_MODEL, embedding_dim=EMB_DIM))
cross = OpenAIRerankerClient(config=LLMConfig(api_key=OAI_KEY, model="gpt-4o-mini"))
NEO4J_URI = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("NEO4J_PASSWORD", "password")
graphiti = Graphiti(NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, llm_client=llm, embedder=emb, cross_encoder=cross)


@asynccontextmanager
async def lifespan(_app):
    try:
        await graphiti.build_indices_and_constraints()
    except Exception as e:
        print("build_indices warning:", e)
    yield
    try:
        await graphiti.close()
    except Exception:
        pass


app = FastAPI(lifespan=lifespan)


# ---------------------------------------------------------------------------------------------
# Richer episode -> graph mapping (2026-06). BACKWARD-COMPATIBLE: the wire shape is unchanged —
# /add still accepts {text,name,group_id,date} and /search still returns {uuid,fact,name}. New
# fields are all OPTIONAL additions:
#   /add   : app/title/source_mix/salience + LOCALLY pre-extracted entities[] / relations[] (from
#            daemon/graph.mjs entitiesFor). We fold those hints + provenance into the episode body
#            so graphiti's extractor anchors on real names instead of re-discovering them, and we
#            promote app/salience into source_description for better edge attribution.
#   /search: optional entity focus + since/until ISO bounds → temporal filtering of returned edges
#            on each edge's valid_at (falling back to created_at), plus valid_at/invalid_at in the
#            result so callers can reason about WHEN a fact held. Old callers that send neither get
#            the original behaviour and the original three keys (extra keys are additive).
# ---------------------------------------------------------------------------------------------


class Entity(BaseModel):
    name: str
    kind: str | None = None


class Relation(BaseModel):
    subject: str
    predicate: str
    object: str


class AddReq(BaseModel):
    text: str
    name: str = "memory"
    group_id: str = "default"
    date: str | None = None
    # optional richer episode context (ignored by old clients)
    app: str | None = None
    title: str | None = None
    source_mix: list[str] = []
    salience: float | None = None
    entities: list[Entity] = []
    relations: list[Relation] = []


class SearchReq(BaseModel):
    query: str
    k: int = 5
    group_id: str = "default"
    # optional temporal scoping (ignored by old clients)
    entity: str | None = None
    since: str | None = None
    until: str | None = None


def _parse_iso(s: str | None):
    if not s:
        return None
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
        return d if d.tzinfo else d.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _enrich_body(r: AddReq) -> str:
    # Prepend a compact, deterministic hint block so the extraction LLM anchors on the entities and
    # relations we already found locally. Plain text — graphiti reads episode_body as prose.
    lines: list[str] = []
    if r.entities:
        lines.append("Entities: " + ", ".join(e.name for e in r.entities[:24]))
    if r.relations:
        lines.append("Relations: " + "; ".join(f"{x.subject} {x.predicate} {x.object}" for x in r.relations[:24]))
    return ("\n".join(lines) + "\n\n" + r.text) if lines else r.text


@app.post("/add")
async def add(r: AddReq):
    ref = _parse_iso(r.date) or datetime.now(timezone.utc)
    desc = "continuum capture"
    if r.app:
        desc += f" · {r.app}"
    if r.salience is not None:
        desc += f" · salience={r.salience:.2f}"
    await graphiti.add_episode(
        name=r.title or r.name, episode_body=_enrich_body(r), source=EpisodeType.text,
        source_description=desc, reference_time=ref, group_id=r.group_id,
    )
    return {"ok": True}


@app.post("/search")
async def search(r: SearchReq):
    # Entity focus narrows the query string; bounds filter the returned edges by validity window.
    query = f"{r.entity}: {r.query}" if r.entity and r.entity not in r.query else r.query
    since, until = _parse_iso(r.since), _parse_iso(r.until)
    edges = await graphiti.search(query, group_ids=[r.group_id], num_results=r.k)

    def _within(e) -> bool:
        if not since and not until:
            return True
        t = getattr(e, "valid_at", None) or getattr(e, "created_at", None)
        if t is None:
            return True  # undated edges are never filtered out
        if since and t < since:
            return False
        if until and t > until:
            return False
        return True

    def _iso(t):
        return t.isoformat() if t is not None else None

    return {"results": [
        {
            "uuid": getattr(e, "uuid", None),
            "fact": getattr(e, "fact", None),
            "name": getattr(e, "name", None),
            "valid_at": _iso(getattr(e, "valid_at", None)),
            "invalid_at": _iso(getattr(e, "invalid_at", None)),
        }
        for e in edges if _within(e)
    ]}


@app.get("/health")
async def health():
    return {"ok": True}

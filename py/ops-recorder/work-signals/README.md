# Work Signals

Small FastAPI service that detects stuck GitHub and Linear work, normalizes it
into `WorkSignal` objects, and generates handoff prompts for agent execution.

## Local Setup

```bash
cd work-signals
python -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set real values in `.env`. `OPS_RECORDER_API_KEY` is required unless
`OPS_RECORDER_AUTH_DISABLED=true` is explicitly set for local-only testing.

```bash
uvicorn main:app --reload --host 127.0.0.1 --port 8000
```

## API

All `/work-signals` endpoints require:

```bash
X-API-Key: $OPS_RECORDER_API_KEY
```

Health is intentionally public:

```bash
curl http://127.0.0.1:8000/health
```

Trigger GitHub sync:

```bash
curl -X POST http://127.0.0.1:8000/work-signals/sync/github \
  -H "X-API-Key: $OPS_RECORDER_API_KEY"
```

Trigger Linear sync:

```bash
curl -X POST http://127.0.0.1:8000/work-signals/sync/linear \
  -H "X-API-Key: $OPS_RECORDER_API_KEY"
```

### Ingest + query surface (for the Recoder backend)

This service is consumed by `docker-backend` at the `/work-signals` edge
(http-edge per `docs/architecture/INTEGRATION-PLAN.md` §d.4 / WIRE-UP #10).
The backend does not need the GitHub/Linear *sync* paths: it pushes already
detected stuck work in and queries the normalized signals back out.

Ingest one already-detected stuck item (no GitHub/Linear token needed by this
service):

```bash
curl -X POST http://127.0.0.1:8000/work-signals/ingest \
  -H "X-API-Key: $OPS_RECORDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
        "source": "github",
        "item_type": "pull_request",
        "title": "Add retry to payment webhook",
        "source_url": "https://github.com/org/repo/pull/42",
        "detected_reason": "Failing CI for 3 days",
        "priority": "high"
      }'
```

The response is the normalized `WorkSignal` (handoff prompt already filled).
`id` is the deterministic `(source, source_url)` hash, so re-ingesting the same
item overwrites rather than duplicates.

Ingest a batch in one call (`POST /work-signals/ingest/batch`, body is a JSON
array of the same shape; returns `{ status, ingested, ids }`).

Query the normalized signals (sorted high → medium → low, then oldest first):

```bash
curl http://127.0.0.1:8000/work-signals -H "X-API-Key: $OPS_RECORDER_API_KEY"
curl http://127.0.0.1:8000/work-signals/<id> -H "X-API-Key: $OPS_RECORDER_API_KEY"
```

Mark resolved / re-open:

```bash
curl -X PATCH http://127.0.0.1:8000/work-signals/<id>/status \
  -H "X-API-Key: $OPS_RECORDER_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"resolved": true}'
```

The full ingest payload contract lives in `api/ingest.py`
(`WorkSignalIngest`). Required: `source`, `item_type`, `title`, `source_url`,
`detected_reason`, `priority`. Optional: `assignee`, `status`,
`why_it_matters`, `recommended_next_action`, `created_at` (safe defaults fill
the rest).

## Safety Notes

- Keep `HOST=127.0.0.1` for local use.
- Do not expose this service publicly without putting it behind Recoder auth or
  another trusted gateway.
- Use a GitHub token with the minimum read-only scopes needed for the target
  repository.
- Dependencies are pinned in `requirements.txt`; update intentionally and run
  the checks below.

## Checks

```bash
python -m compileall -q .
pytest
bandit -r . --exclude ./tests -q
detect-secrets scan .
pip-audit -r requirements.txt
```

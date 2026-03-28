#!/bin/bash
KEY="dyt_8532c63d57a211830b617731b30787d913870bfc0d82479a3ad6ff6e916e1946"

echo "=== Check sandboxes ==="
curl -s "http://localhost:3900/api/sandbox" -H "Authorization: Bearer $KEY" | python3 -c "
import json,sys
items=json.load(sys.stdin).get('items',[])
print(f'{len(items)} sandboxes')
for s in items[:5]:
    print(f'  {s[\"id\"][:12]} state={s[\"state\"]}')
"

echo ""
echo "=== Create sandbox with 12hr timeout ==="
RESULT=$(curl -s -X POST "http://localhost:3900/api/sandbox" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $KEY" \
  -d '{"image":"daytonaio/workspace:0.5.0-slim","labels":{"test":"preview-test"},"autoStopInterval":43200,"autoArchiveInterval":43200,"public":true}')
SID=$(echo "$RESULT" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
echo "Created: $SID"

echo "Waiting 10s for sandbox to start..."
sleep 10

STATE=$(curl -s "http://localhost:3900/api/sandbox/$SID" -H "Authorization: Bearer $KEY" | python3 -c "import json,sys; print(json.load(sys.stdin).get('state','?'))")
echo "State: $STATE"

if [ "$STATE" != "started" ]; then
  echo "FAILED: sandbox not started"
  exit 1
fi

echo ""
echo "=== Write HTML file ==="
curl -s "http://localhost:3900/api/toolbox/$SID/toolbox/process/execute" \
  -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $KEY" \
  -d '{"command":"printf \"<h1>Recoder Preview Works!</h1><p>Sandbox: '"$SID"'</p>\" > /home/daytona/index.html"}'

echo ""
echo "=== Start Python HTTP server ==="
curl -s "http://localhost:3900/api/toolbox/$SID/toolbox/process/execute" \
  -X POST -H "Content-Type: application/json" -H "Authorization: Bearer $KEY" \
  -d '{"command":"nohup python3 -m http.server 5173 --bind 0.0.0.0 --directory /home/daytona > /dev/null 2>&1 & sleep 2 && curl -s http://localhost:5173/"}'

echo ""
echo ""
echo "=== Preview URL ==="
echo "https://5173-$SID.sandbox.recoder.xyz"
echo ""
echo "Test from host:"
curl -s -w "\nHTTP:%{http_code}" "https://5173-$SID.sandbox.recoder.xyz/" 2>&1 | tail -3

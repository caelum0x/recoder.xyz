#!/bin/bash

# Add error helper import to files that need it
FILES_TO_FIX=(
  "src/middleware/errorHandler.ts"
  "src/middleware/rate-limit.ts"
  "src/middleware/auth.ts"
  "src/utils/build-executor.ts"
  "src/models/api-key.ts"
  "src/integrations/claude-code/run.ts"
  "src/routes/multi-tenant.ts"
  "src/routes/enhanced-analytics.ts"
  "src/routes/data-portability.ts"
  "src/routes/soc2-compliance.ts"
  "src/routes/multi-modal-ai.ts"
  "src/routes/webhooks.ts"
  "src/routes/predictive-error-detection.ts"
  "src/routes/router.ts"
  "src/routes/analytics.ts"
  "src/routes/i18n.ts"
  "src/routes/collaboration.ts"
  "src/routes/rag.ts"
  "src/routes/api-keys.ts"
  "src/routes/cost-optimization.ts"
  "src/routes/matchmaking-api.ts"
  "src/routes/game-analytics-api.ts"
  "src/routes/mobile-api.ts"
  "src/routes/solidity-api.ts"
  "src/routes/theme-preferences.ts"
  "src/routes/subscriptions.ts"
  "src/routes/responsive-design.ts"
  "src/routes/analytics-export.ts"
  "src/routes/blockchain-api.ts"
  "src/routes/game-development/unreal.ts"
  "src/routes/database-backup.ts"
  "src/routes/auth.ts"
  "src/services/websocket.ts"
  "src/services/advanced-rag-learning.ts"
  "src/services/analytics-service.ts"
  "src/services/data-portability.ts"
  "src/services/api-gateway-enhanced.ts"
  "src/services/semantic-search.ts"
  "src/services/database-optimization.ts"
  "src/services/usage-tracking.ts"
  "src/services/pattern-recognition-ml.ts"
  "src/services/ai-router.ts"
  "src/services/rag-enhanced-ai.ts"
  "src/services/solidity-compiler.ts"
  "src/services/blockchain-compiler.ts"
  "src/services/intelligent-failover.ts"
  "src/services/vector-database.ts"
  "src/services/code-analysis.ts"
  "src/services/database-backup.ts"
  "src/services/ai-provider-manager.ts"
)

for file in "${FILES_TO_FIX[@]}"; do
  if [ -f "$file" ]; then
    echo "Processing $file..."
    
    # Check if import already exists
    if ! grep -q "getErrorMessage" "$file"; then
      # Find the right place to add import - after last import
      if grep -q "^import.*from.*;" "$file"; then
        # Add import after the last import statement
        sed -i '/^import.*from.*;$/a\
import { getErrorMessage } from '\''../utils/error-helpers'\'';' "$file"
      else
        # Add at the beginning if no imports
        sed -i '1i\
import { getErrorMessage } from '\''./utils/error-helpers'\'';' "$file"
      fi
    fi
    
    # Replace error.message patterns
    sed -i 's/error\.message/getErrorMessage(error)/g' "$file"
    
    echo "Fixed $file"
  else
    echo "File $file not found, skipping..."
  fi
done

echo "Error fixing script completed!"
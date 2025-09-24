#!/bin/bash

# Fix async Express route handler return types
FILES=(
  "src/routes/multi-tenant.ts"
  "src/routes/analytics-report-scheduling-fixed.ts" 
  "src/routes/analytics-report-sharing.ts"
  "src/routes/webhooks.ts"
  "src/routes/matchmaking-api.ts"
  "src/routes/analytics-report-scheduling.ts"
  "src/routes/game-analytics-api.ts"
  "src/routes/mobile-api.ts"
  "src/routes/analytics-report-export-fixed.ts"
  "src/routes/solidity-api.ts"
  "src/routes/user-account.ts"
  "src/routes/subscriptions.ts"
  "src/routes/game-development-api.ts"
  "src/routes/blockchain-api.ts"
  "src/routes/auth.ts"
  "src/services/api-gateway-enhanced.ts"
)

for file in "${FILES[@]}"; do
  if [ -f "$file" ]; then
    echo "Adding Promise<void> return types to $file"
    
    # Fix various async route handler patterns
    # Pattern 1: async (req: Request, res: Response) => {
    sed -i.bak 's/async (req: Request, res: Response) => {/async (req: Request, res: Response): Promise<void> => {/g' "$file"
    
    # Pattern 2: async (req: express.Request, res: express.Response) => {
    sed -i.bak 's/async (req: express.Request, res: express.Response) => {/async (req: express.Request, res: express.Response): Promise<void> => {/g' "$file"
    
    # Pattern 3: async (req, res) => { (with any type)
    sed -i.bak 's/async (req: any, res: any) => {/async (req: any, res: any): Promise<void> => {/g' "$file"
    
    echo "Fixed $file"
  else
    echo "File $file not found"
  fi
done

echo "Async handler return type fixing completed!"
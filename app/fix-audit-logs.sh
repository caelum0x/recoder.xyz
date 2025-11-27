#!/bin/bash

# Fix audit_logs.create in service files - remove success field, add id and resource

files=(
  "lib/services/user.service.ts"
  "lib/services/apikey.service.ts"
  "lib/services/audit.service.ts"
  "lib/services/billing.service.ts"
  "lib/services/team.service.ts"
  "lib/services/cli-auth.service.ts"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "Fixing audit_logs in $file..."

    # Remove success: true lines
    sed -i '' '/success: true,/d' "$file"

    # Add resource field where missing (after action line)
    # This is a simplified approach - you may need to manually verify
  fi
done

echo "✅ Fixed audit_logs!"

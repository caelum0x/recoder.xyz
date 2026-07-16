#!/bin/bash

# Fix Better Auth status -> isPending migration
files=(
  "app/billing/invoices/page.tsx"
  "app/billing/payment-methods/page.tsx"
  "app/billing/subscription/page.tsx"
  "app/billing/upgrade/page.tsx"
  "app/checkout/page.tsx"
  "app/cli/auth/page.tsx"
  "app/dashboard/api-keys/page.tsx"
  "app/onboarding/choose-plan/page.tsx"
  "app/onboarding/complete/page.tsx"
  "app/onboarding/setup-api-key/page.tsx"
  "app/onboarding/setup-profile/page.tsx"
  "app/onboarding/welcome/page.tsx"
  "app/playground/page.tsx"
  "app/settings/premium/page.tsx"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "Fixing $file..."

    # Replace: const { data: session, status } = useSession(); -> const { data: session, isPending } = useSession();
    sed -i '' 's/const { data: session, status } = useSession();/const { data: session, isPending } = useSession();/g' "$file"

    # Replace: status === 'unauthenticated' -> !session && !isPending
    sed -i '' "s/status === 'unauthenticated'/!session \&\& !isPending/g" "$file"

    # Replace: status === 'authenticated' -> session && !isPending
    sed -i '' "s/status === 'authenticated'/session \&\& !isPending/g" "$file"

    # Replace: status === 'loading' -> isPending
    sed -i '' "s/status === 'loading'/isPending/g" "$file"

    # Replace: status !== 'loading' -> !isPending
    sed -i '' "s/status !== 'loading'/!isPending/g" "$file"

    # Fix dependencies array: [status, -> [session, isPending,
    sed -i '' 's/\[status,/[session, isPending,/g' "$file"

    # Fix dependencies array: , status] -> , session, isPending]
    sed -i '' 's/, status\]/, session, isPending]/g' "$file"
  fi
done

echo "✅ All files fixed!"

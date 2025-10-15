#!/bin/bash

# Phase 4: Billing API Endpoints
mkdir -p app/api/billing/dashboard
mkdir -p app/api/billing/invoices  
mkdir -p app/api/billing/subscription
mkdir -p app/api/billing/payment-methods

# Phase 4: Billing Pages
mkdir -p app/billing/invoices
mkdir -p app/billing/subscription
mkdir -p app/billing/payment-methods

# Phase 3: Dashboard Pages
mkdir -p app/dashboard/usage
mkdir -p app/dashboard/overview

# Phase 2: Settings Pages  
mkdir -p app/settings/account
mkdir -p app/settings/profile
mkdir -p app/settings/security
mkdir -p app/settings/notifications

echo "✅ All directories created successfully"
echo ""
echo "Created directories for:"
echo "- Billing pages (invoices, subscription, payment-methods)"
echo "- Dashboard pages (usage, overview)"
echo "- Settings pages (account, profile, security, notifications)"
echo "- API endpoints for all features"

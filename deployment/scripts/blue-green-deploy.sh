#!/bin/bash

# 🔵 Blue-Green Deployment Script for Recoder.xyz
# Deploys to staging environment then switches traffic

set -e

SCALE_FACTOR=${1:-1.0}
NAMESPACE="recoder-production"
STAGING_NAMESPACE="recoder-staging"

echo "🔵 Starting blue-green deployment with scale factor: ${SCALE_FACTOR}x"

# Create staging namespace if it doesn't exist
kubectl create namespace $STAGING_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -

# Deploy to staging (green) environment
echo "🟢 Deploying to green environment..."
kubectl apply -f deployment/kubernetes/staging/ -n $STAGING_NAMESPACE

# Update staging images
kubectl set image deployment/recoder-web \
  recoder-web=ghcr.io/$GITHUB_REPOSITORY/recoder-web:$GITHUB_SHA \
  -n $STAGING_NAMESPACE

kubectl set image deployment/recoder-chat \
  recoder-chat=ghcr.io/$GITHUB_REPOSITORY/recoder-chat:$GITHUB_SHA \
  -n $STAGING_NAMESPACE

# Wait for staging deployment
echo "⏳ Waiting for staging deployment..."
kubectl rollout status deployment/recoder-web -n $STAGING_NAMESPACE --timeout=600s
kubectl rollout status deployment/recoder-chat -n $STAGING_NAMESPACE --timeout=600s

# Run health checks on staging
echo "🏥 Running health checks on staging..."
sleep 30

# Test staging environment
STAGING_WEB_IP=$(kubectl get svc recoder-web -n $STAGING_NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
STAGING_CHAT_IP=$(kubectl get svc recoder-chat -n $STAGING_NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

if curl -f http://$STAGING_WEB_IP/health && curl -f http://$STAGING_CHAT_IP/health; then
  echo "✅ Staging health checks passed"
  
  # Switch traffic to green environment
  echo "🔄 Switching traffic to green environment..."
  
  # Update production services to point to staging deployments
  kubectl patch service recoder-web -n $NAMESPACE -p '{"spec":{"selector":{"app":"recoder-web","environment":"staging"}}}'
  kubectl patch service recoder-chat -n $NAMESPACE -p '{"spec":{"selector":{"app":"recoder-chat","environment":"staging"}}}'
  
  # Wait for traffic switch
  sleep 10
  
  # Clean up old production deployments
  echo "🗑️ Cleaning up blue environment..."
  kubectl delete deployment recoder-web-old recoder-chat-old -n $NAMESPACE --ignore-not-found=true
  
  echo "✅ Blue-green deployment completed successfully"
else
  echo "❌ Staging health checks failed - aborting deployment"
  exit 1
fi
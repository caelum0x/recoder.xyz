#!/bin/bash

# 📦 Rolling Deployment Script for Recoder.xyz
# Performs zero-downtime rolling updates

set -e

SCALE_FACTOR=${1:-1.0}
NAMESPACE="recoder-production"

echo "🚀 Starting rolling deployment with scale factor: ${SCALE_FACTOR}x"

# Calculate replica counts based on scale factor
WEB_REPLICAS=$(echo "3 * $SCALE_FACTOR" | bc | xargs printf "%.0f")
CHAT_REPLICAS=$(echo "5 * $SCALE_FACTOR" | bc | xargs printf "%.0f")

echo "📊 Target replicas: Web=$WEB_REPLICAS, Chat=$CHAT_REPLICAS"

# Update deployment images
kubectl set image deployment/recoder-web \
  recoder-web=ghcr.io/$GITHUB_REPOSITORY/recoder-web:$GITHUB_SHA \
  -n $NAMESPACE

kubectl set image deployment/recoder-chat \
  recoder-chat=ghcr.io/$GITHUB_REPOSITORY/recoder-chat:$GITHUB_SHA \
  -n $NAMESPACE

# Scale deployments
kubectl scale deployment recoder-web --replicas=$WEB_REPLICAS -n $NAMESPACE
kubectl scale deployment recoder-chat --replicas=$CHAT_REPLICAS -n $NAMESPACE

# Wait for rollout to complete
echo "⏳ Waiting for rollouts to complete..."
kubectl rollout status deployment/recoder-web -n $NAMESPACE --timeout=600s
kubectl rollout status deployment/recoder-chat -n $NAMESPACE --timeout=600s

echo "✅ Rolling deployment completed successfully"
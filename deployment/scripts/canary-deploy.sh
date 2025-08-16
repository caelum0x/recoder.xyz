#!/bin/bash

# 🐤 Canary Deployment Script for Recoder.xyz
# Gradually shifts traffic to new version

set -e

SCALE_FACTOR=${1:-1.0}
NAMESPACE="recoder-production"

echo "🐤 Starting canary deployment with scale factor: ${SCALE_FACTOR}x"

# Deploy canary version (10% of traffic initially)
echo "📦 Deploying canary version..."

# Create canary deployments
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: recoder-web-canary
  namespace: $NAMESPACE
  labels:
    app: recoder-web
    version: canary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: recoder-web
      version: canary
  template:
    metadata:
      labels:
        app: recoder-web
        version: canary
    spec:
      containers:
      - name: recoder-web
        image: ghcr.io/$GITHUB_REPOSITORY/recoder-web:$GITHUB_SHA
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: SKIP_ENV_VALIDATION
          value: "true"
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: recoder-chat-canary
  namespace: $NAMESPACE
  labels:
    app: recoder-chat
    version: canary
spec:
  replicas: 1
  selector:
    matchLabels:
      app: recoder-chat
      version: canary
  template:
    metadata:
      labels:
        app: recoder-chat
        version: canary
    spec:
      containers:
      - name: recoder-chat
        image: ghcr.io/$GITHUB_REPOSITORY/recoder-chat:$GITHUB_SHA
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
EOF

# Wait for canary deployments
echo "⏳ Waiting for canary deployments..."
kubectl rollout status deployment/recoder-web-canary -n $NAMESPACE --timeout=300s
kubectl rollout status deployment/recoder-chat-canary -n $NAMESPACE --timeout=300s

# Configure traffic splitting (10% to canary)
echo "🚦 Configuring traffic split (10% canary, 90% stable)..."

# Update services for traffic splitting
kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: recoder-web-canary
  namespace: $NAMESPACE
spec:
  selector:
    app: recoder-web
    version: canary
  ports:
  - port: 80
    targetPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: recoder-chat-canary
  namespace: $NAMESPACE
spec:
  selector:
    app: recoder-chat
    version: canary
  ports:
  - port: 80
    targetPort: 3000
EOF

# Monitor canary for 5 minutes
echo "📊 Monitoring canary performance for 5 minutes..."
MONITOR_START=$(date +%s)
MONITOR_DURATION=300  # 5 minutes

while [[ $(($(date +%s) - $MONITOR_START)) -lt $MONITOR_DURATION ]]; do
  # Check canary health
  CANARY_WEB_IP=$(kubectl get svc recoder-web-canary -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
  CANARY_CHAT_IP=$(kubectl get svc recoder-chat-canary -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
  
  if ! curl -f http://$CANARY_WEB_IP/health || ! curl -f http://$CANARY_CHAT_IP/health; then
    echo "❌ Canary health check failed - rolling back"
    kubectl delete deployment recoder-web-canary recoder-chat-canary -n $NAMESPACE
    kubectl delete service recoder-web-canary recoder-chat-canary -n $NAMESPACE
    exit 1
  fi
  
  echo "✅ Canary health check passed ($(date))"
  sleep 30
done

# Gradually increase canary traffic
echo "📈 Gradually increasing canary traffic..."

# 25% traffic to canary
kubectl scale deployment recoder-web-canary --replicas=2 -n $NAMESPACE
kubectl scale deployment recoder-chat-canary --replicas=2 -n $NAMESPACE
sleep 60

# 50% traffic to canary
kubectl scale deployment recoder-web-canary --replicas=3 -n $NAMESPACE
kubectl scale deployment recoder-chat-canary --replicas=3 -n $NAMESPACE
kubectl scale deployment recoder-web --replicas=3 -n $NAMESPACE
kubectl scale deployment recoder-chat --replicas=3 -n $NAMESPACE
sleep 60

# Final health check
if curl -f http://$CANARY_WEB_IP/health && curl -f http://$CANARY_CHAT_IP/health; then
  echo "✅ Canary promotion successful"
  
  # Promote canary to production
  kubectl set image deployment/recoder-web \
    recoder-web=ghcr.io/$GITHUB_REPOSITORY/recoder-web:$GITHUB_SHA \
    -n $NAMESPACE
    
  kubectl set image deployment/recoder-chat \
    recoder-chat=ghcr.io/$GITHUB_REPOSITORY/recoder-chat:$GITHUB_SHA \
    -n $NAMESPACE
  
  # Clean up canary resources
  kubectl delete deployment recoder-web-canary recoder-chat-canary -n $NAMESPACE
  kubectl delete service recoder-web-canary recoder-chat-canary -n $NAMESPACE
  
  echo "✅ Canary deployment completed successfully"
else
  echo "❌ Final canary health check failed - rolling back"
  kubectl delete deployment recoder-web-canary recoder-chat-canary -n $NAMESPACE
  kubectl delete service recoder-web-canary recoder-chat-canary -n $NAMESPACE
  exit 1
fi
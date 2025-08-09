#!/bin/bash

# Unified Authentication System Deployment Script
# Deploy authentication across all 12+ Recoder.xyz platforms

set -e  # Exit on any error

echo "🔐 DEPLOYING UNIFIED AUTHENTICATION SYSTEM"
echo "============================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="recoder-production"
AUTH_SERVICE_VERSION="v1.0.0"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-recoder}"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if kubectl is available
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed or not in PATH"
        exit 1
    fi
    
    # Check if docker is available
    if ! command -v docker &> /dev/null; then
        log_error "docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check cluster connectivity
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot connect to Kubernetes cluster"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Phase 1: Build and Push Auth Service Docker Images
build_auth_services() {
    log_info "Building authentication service Docker images..."
    
    # Backend Auth Service
    log_info "Building backend auth service..."
    docker build -t ${DOCKER_REGISTRY}/auth-backend:${AUTH_SERVICE_VERSION} \
        -f backend/Dockerfile.auth backend/
    docker push ${DOCKER_REGISTRY}/auth-backend:${AUTH_SERVICE_VERSION}
    
    # Auth Database Migration
    log_info "Building auth database migration..."
    docker build -t ${DOCKER_REGISTRY}/auth-migration:${AUTH_SERVICE_VERSION} \
        -f database/Dockerfile.auth-migration database/
    docker push ${DOCKER_REGISTRY}/auth-migration:${AUTH_SERVICE_VERSION}
    
    log_success "Docker images built and pushed"
}

# Phase 2: Deploy Core Authentication Infrastructure
deploy_auth_infrastructure() {
    log_info "Deploying authentication infrastructure..."
    
    # Create namespace if it doesn't exist
    kubectl create namespace ${NAMESPACE} --dry-run=client -o yaml | kubectl apply -f -
    
    # Deploy authentication secrets
    log_info "Creating authentication secrets..."
    kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: auth-secrets
  namespace: ${NAMESPACE}
type: Opaque
data:
  jwt-secret: $(echo -n "${JWT_SECRET:-$(openssl rand -base64 32)}" | base64)
  jwt-refresh-secret: $(echo -n "${JWT_REFRESH_SECRET:-$(openssl rand -base64 32)}" | base64)
  encryption-key: $(echo -n "${ENCRYPTION_KEY:-$(openssl rand -base64 32)}" | base64)
  database-url: $(echo -n "${DATABASE_URL}" | base64)
  redis-url: $(echo -n "${REDIS_URL}" | base64)
EOF

    # Deploy Redis for session storage
    log_info "Deploying Redis for session storage..."
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-redis
  namespace: ${NAMESPACE}
spec:
  replicas: 3
  selector:
    matchLabels:
      app: auth-redis
  template:
    metadata:
      labels:
        app: auth-redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        command: ["redis-server"]
        args: ["--appendonly", "yes", "--requirepass", "\$(REDIS_PASSWORD)"]
        env:
        - name: REDIS_PASSWORD
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: redis-password
        volumeMounts:
        - name: redis-data
          mountPath: /data
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "200m"
      volumes:
      - name: redis-data
        persistentVolumeClaim:
          claimName: auth-redis-pvc
---
apiVersion: v1
kind: Service
metadata:
  name: auth-redis-service
  namespace: ${NAMESPACE}
spec:
  selector:
    app: auth-redis
  ports:
  - port: 6379
    targetPort: 6379
  type: ClusterIP
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: auth-redis-pvc
  namespace: ${NAMESPACE}
spec:
  accessModes:
    - ReadWriteOnce
  resources:
    requests:
      storage: 10Gi
EOF

    # Deploy Authentication Service
    log_info "Deploying core authentication service..."
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: auth-service
  namespace: ${NAMESPACE}
  labels:
    app: auth-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: auth-service
  template:
    metadata:
      labels:
        app: auth-service
    spec:
      containers:
      - name: auth-service
        image: ${DOCKER_REGISTRY}/auth-backend:${AUTH_SERVICE_VERSION}
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: PORT
          value: "3000"
        - name: JWT_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: jwt-secret
        - name: JWT_REFRESH_SECRET
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: jwt-refresh-secret
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: database-url
        - name: REDIS_URL
          value: "redis://auth-redis-service:6379"
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 10
          periodSeconds: 5
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
---
apiVersion: v1
kind: Service
metadata:
  name: auth-service
  namespace: ${NAMESPACE}
spec:
  selector:
    app: auth-service
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
EOF

    log_success "Authentication infrastructure deployed"
}

# Phase 3: Update All Platform Configurations
update_platform_configs() {
    log_info "Updating platform configurations for unified auth..."
    
    # Update Backend Services
    log_info "Updating backend services..."
    kubectl patch deployment backend -n ${NAMESPACE} -p '{
        "spec": {
            "template": {
                "spec": {
                    "containers": [{
                        "name": "backend",
                        "env": [
                            {"name": "AUTH_SERVICE_URL", "value": "http://auth-service"},
                            {"name": "UNIFIED_AUTH_ENABLED", "value": "true"}
                        ]
                    }]
                }
            }
        }
    }'
    
    # Update Chat Platform
    log_info "Updating chat platform..."
    kubectl patch deployment chat-platform -n ${NAMESPACE} -p '{
        "spec": {
            "template": {
                "spec": {
                    "containers": [{
                        "name": "chat-platform",
                        "env": [
                            {"name": "AUTH_SERVICE_URL", "value": "http://auth-service"},
                            {"name": "NEXTAUTH_URL", "value": "https://chat.recoder.xyz"},
                            {"name": "NEXTAUTH_SECRET", "valueFrom": {"secretKeyRef": {"name": "auth-secrets", "key": "jwt-secret"}}}
                        ]
                    }]
                }
            }
        }
    }'
    
    # Update Web Platform
    log_info "Updating web platform..."
    kubectl patch deployment web-platform -n ${NAMESPACE} -p '{
        "spec": {
            "template": {
                "spec": {
                    "containers": [{
                        "name": "web-platform",
                        "env": [
                            {"name": "AUTH_SERVICE_URL", "value": "http://auth-service"},
                            {"name": "UNIFIED_AUTH_ENABLED", "value": "true"}
                        ]
                    }]
                }
            }
        }
    }'
    
    # Update Production Engine
    log_info "Updating production engine..."
    kubectl patch deployment production-engine -n ${NAMESPACE} -p '{
        "spec": {
            "template": {
                "spec": {
                    "containers": [{
                        "name": "production-engine",
                        "env": [
                            {"name": "AUTH_SERVICE_URL", "value": "http://auth-service"},
                            {"name": "SERVICE_AUTH_ENABLED", "value": "true"}
                        ]
                    }]
                }
            }
        }
    }'
    
    log_success "Platform configurations updated"
}

# Phase 4: Run Database Migrations
run_auth_migrations() {
    log_info "Running authentication database migrations..."
    
    kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: auth-migration-$(date +%s)
  namespace: ${NAMESPACE}
spec:
  template:
    spec:
      containers:
      - name: migration
        image: ${DOCKER_REGISTRY}/auth-migration:${AUTH_SERVICE_VERSION}
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: auth-secrets
              key: database-url
        command: ["npm", "run", "migrate:deploy"]
      restartPolicy: Never
  backoffLimit: 3
EOF

    # Wait for migration to complete
    log_info "Waiting for database migration to complete..."
    kubectl wait --for=condition=complete job -l job-name=auth-migration --timeout=300s -n ${NAMESPACE}
    
    log_success "Database migrations completed"
}

# Phase 5: Deploy Platform-Specific Auth Components
deploy_platform_auth() {
    log_info "Deploying platform-specific authentication components..."
    
    # OAuth Callback Service
    log_info "Deploying OAuth callback service..."
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: oauth-callback-service
  namespace: ${NAMESPACE}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: oauth-callback-service
  template:
    metadata:
      labels:
        app: oauth-callback-service
    spec:
      containers:
      - name: oauth-callback
        image: ${DOCKER_REGISTRY}/oauth-callback:${AUTH_SERVICE_VERSION}
        ports:
        - containerPort: 3000
        env:
        - name: AUTH_SERVICE_URL
          value: "http://auth-service"
        - name: GOOGLE_CLIENT_ID
          valueFrom:
            secretKeyRef:
              name: oauth-secrets
              key: google-client-id
        - name: GOOGLE_CLIENT_SECRET
          valueFrom:
            secretKeyRef:
              name: oauth-secrets
              key: google-client-secret
        - name: GITHUB_CLIENT_ID
          valueFrom:
            secretKeyRef:
              name: oauth-secrets
              key: github-client-id
        - name: GITHUB_CLIENT_SECRET
          valueFrom:
            secretKeyRef:
              name: oauth-secrets
              key: github-client-secret
---
apiVersion: v1
kind: Service
metadata:
  name: oauth-callback-service
  namespace: ${NAMESPACE}
spec:
  selector:
    app: oauth-callback-service
  ports:
  - port: 80
    targetPort: 3000
EOF

    # Session Sync Service
    log_info "Deploying session synchronization service..."
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: session-sync-service
  namespace: ${NAMESPACE}
spec:
  replicas: 2
  selector:
    matchLabels:
      app: session-sync-service
  template:
    metadata:
      labels:
        app: session-sync-service
    spec:
      containers:
      - name: session-sync
        image: ${DOCKER_REGISTRY}/session-sync:${AUTH_SERVICE_VERSION}
        ports:
        - containerPort: 8080
        env:
        - name: REDIS_URL
          value: "redis://auth-redis-service:6379"
        - name: AUTH_SERVICE_URL
          value: "http://auth-service"
---
apiVersion: v1
kind: Service
metadata:
  name: session-sync-service
  namespace: ${NAMESPACE}
spec:
  selector:
    app: session-sync-service
  ports:
  - port: 8080
    targetPort: 8080
EOF

    log_success "Platform-specific auth components deployed"
}

# Phase 6: Update API Gateway and Ingress
update_gateway_config() {
    log_info "Updating API Gateway configuration..."
    
    # Update API Gateway to route auth requests
    kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: auth-ingress
  namespace: ${NAMESPACE}
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
spec:
  tls:
  - hosts:
    - auth.recoder.xyz
    secretName: auth-tls-secret
  rules:
  - host: auth.recoder.xyz
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: auth-service
            port:
              number: 80
      - path: /oauth
        pathType: Prefix
        backend:
          service:
            name: oauth-callback-service
            port:
              number: 80
      - path: /sync
        pathType: Prefix
        backend:
          service:
            name: session-sync-service
            port:
              number: 8080
EOF

    log_success "API Gateway configuration updated"
}

# Phase 7: Validate Deployment
validate_deployment() {
    log_info "Validating authentication deployment..."
    
    # Check service health
    log_info "Checking service health..."
    
    # Wait for services to be ready
    kubectl wait --for=condition=available deployment/auth-service --timeout=300s -n ${NAMESPACE}
    kubectl wait --for=condition=available deployment/oauth-callback-service --timeout=300s -n ${NAMESPACE}
    kubectl wait --for=condition=available deployment/session-sync-service --timeout=300s -n ${NAMESPACE}
    
    # Test authentication endpoint
    log_info "Testing authentication endpoints..."
    
    AUTH_SERVICE_IP=$(kubectl get service auth-service -n ${NAMESPACE} -o jsonpath='{.spec.clusterIP}')
    
    # Health check
    if kubectl run test-pod --image=curlimages/curl --rm -i --restart=Never -- curl -s http://${AUTH_SERVICE_IP}/health; then
        log_success "Auth service health check passed"
    else
        log_error "Auth service health check failed"
        exit 1
    fi
    
    # Test JWT endpoint
    if kubectl run test-pod --image=curlimages/curl --rm -i --restart=Never -- curl -s http://${AUTH_SERVICE_IP}/auth/validate; then
        log_success "Auth validation endpoint responding"
    else
        log_warning "Auth validation endpoint test failed (expected without token)"
    fi
    
    log_success "Authentication deployment validation completed"
}

# Phase 8: Update Browser Extensions and Desktop Apps
update_client_configs() {
    log_info "Creating client configuration updates..."
    
    # Create browser extension config
    cat > browser-extension/auth-config.js << EOF
// Auto-generated authentication configuration
const AUTH_CONFIG = {
  authServiceUrl: 'https://auth.recoder.xyz',
  oauthCallbackUrl: 'https://auth.recoder.xyz/oauth/callback',
  supportedProviders: ['google', 'github'],
  tokenStorageKey: 'recoder_auth_token',
  refreshTokenStorageKey: 'recoder_refresh_token',
  syncEnabled: true,
  syncUrl: 'wss://auth.recoder.xyz/sync'
};

window.RecoderAuthConfig = AUTH_CONFIG;
EOF
    
    # Create desktop app config
    cat > recoder-desktop/auth-config.json << EOF
{
  "authServiceUrl": "https://auth.recoder.xyz",
  "oauthCallbackUrl": "recoder://auth/callback",
  "supportedProviders": ["google", "github"],
  "secureStorage": true,
  "biometricAuth": true,
  "syncEnabled": true
}
EOF
    
    # Create CLI config
    cat > packages/cli/auth-config.json << EOF
{
  "authServiceUrl": "https://auth.recoder.xyz",
  "interactiveAuth": true,
  "callbackPort": 8080,
  "tokenStorage": "keychain",
  "fallbackStorage": "file"
}
EOF
    
    log_success "Client configuration files updated"
}

# Phase 9: Deploy Monitoring and Alerting
deploy_auth_monitoring() {
    log_info "Deploying authentication monitoring..."
    
    kubectl apply -f - <<EOF
apiVersion: v1
kind: Service
metadata:
  name: auth-monitoring
  namespace: ${NAMESPACE}
  labels:
    app: auth-monitoring
spec:
  ports:
  - port: 9090
    name: metrics
  selector:
    app: auth-service
---
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: auth-service-monitor
  namespace: ${NAMESPACE}
spec:
  selector:
    matchLabels:
      app: auth-service
  endpoints:
  - port: metrics
    interval: 30s
    path: /metrics
EOF

    log_success "Authentication monitoring deployed"
}

# Main execution
main() {
    echo "🚀 Starting Unified Authentication Deployment"
    echo "Time: $(date)"
    echo "Namespace: ${NAMESPACE}"
    echo "Version: ${AUTH_SERVICE_VERSION}"
    echo ""
    
    check_prerequisites
    build_auth_services
    deploy_auth_infrastructure
    run_auth_migrations
    update_platform_configs
    deploy_platform_auth
    update_gateway_config
    validate_deployment
    update_client_configs
    deploy_auth_monitoring
    
    echo ""
    echo "🎉 UNIFIED AUTHENTICATION DEPLOYMENT COMPLETE!"
    echo "=============================================="
    echo ""
    echo "✅ Services Deployed:"
    echo "   - Core Authentication Service"
    echo "   - OAuth Callback Service" 
    echo "   - Session Sync Service"
    echo "   - Redis Session Storage"
    echo "   - Authentication Monitoring"
    echo ""
    echo "🔗 Endpoints:"
    echo "   - Auth Service: https://auth.recoder.xyz"
    echo "   - OAuth: https://auth.recoder.xyz/oauth"
    echo "   - Sync: https://auth.recoder.xyz/sync"
    echo ""
    echo "📱 Platforms Updated:"
    echo "   - Backend Services"
    echo "   - Chat Platform" 
    echo "   - Web Platform"
    echo "   - Production Engine"
    echo "   - Browser Extensions (config ready)"
    echo "   - Desktop Apps (config ready)"
    echo "   - CLI Tools (config ready)"
    echo ""
    echo "🎯 Next Steps:"
    echo "   1. Update browser extensions with new auth config"
    echo "   2. Release new desktop app versions"
    echo "   3. Deploy CLI updates"
    echo "   4. Monitor authentication metrics"
    echo ""
    log_success "Ready for unified authentication across all platforms!"
}

# Run main function
main "$@"
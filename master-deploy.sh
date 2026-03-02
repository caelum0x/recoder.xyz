#!/bin/bash

# MASTER DEPLOYMENT SCRIPT - Recoder.xyz Ecosystem
# Deploy all 12+ platforms in coordinated sequence for market domination
# DEPRECATED: use deploy.yml workflow + docker-compose.deploy.yml.
# Override only for forensic/legacy use:
#   ALLOW_LEGACY_DEPLOY=1 bash master-deploy.sh

if [[ "${ALLOW_LEGACY_DEPLOY:-0}" != "1" ]]; then
  echo "ERROR: master-deploy.sh is deprecated and blocked by default."
  echo "Use deploy.yml and docker-compose.deploy.yml instead."
  echo "If you explicitly need this legacy path, run with ALLOW_LEGACY_DEPLOY=1."
  exit 1
fi

set -e
trap 'echo "❌ Deployment failed at line $LINENO"' ERR

# Colors and formatting
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
NAMESPACE="recoder-production"
VERSION="v1.0.0"
DOCKER_REGISTRY="${DOCKER_REGISTRY:-recoder}"
DEPLOYMENT_ID="deploy_$(date +%s)"

echo -e "${PURPLE}"
echo "██████╗ ███████╗ ██████╗ ██████╗ ███████╗██████╗    ██╗  ██╗██╗   ██╗███████╗"
echo "██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔════╝██╔══██╗   ╚██╗██╔╝╚██╗ ██╔╝╚══███╔╝"
echo "██████╔╝█████╗  ██║     ██║   ██║█████╗  ██████╔╝    ╚███╔╝  ╚████╔╝   ███╔╝ "
echo "██╔══██╗██╔══╝  ██║     ██║   ██║██╔══╝  ██╔══██╗    ██╔██╗   ╚██╔╝   ███╔╝  "
echo "██║  ██║███████╗╚██████╗╚██████╔╝███████╗██║  ██║██╗██╔╝ ██╗   ██║   ███████╗"
echo "╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝"
echo -e "${NC}"
echo ""
echo -e "${CYAN}🚀 MASTER DEPLOYMENT - AI CODING INDUSTRY DOMINATION${NC}"
echo -e "${BLUE}=============================================================${NC}"
echo "Deployment ID: $DEPLOYMENT_ID"
echo "Version: $VERSION"
echo "Timestamp: $(date)"
echo ""

# Helper functions
log_phase() {
    echo -e "\n${PURPLE}🔸 PHASE: $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════${NC}"
}

log_step() {
    echo -e "\n${CYAN}▶️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Pre-deployment checks
check_prerequisites() {
    log_phase "PRE-DEPLOYMENT VALIDATION"
    
    log_step "Checking required tools..."
    local missing_tools=()
    
    for tool in kubectl docker npm node; do
        if ! command -v $tool &> /dev/null; then
            missing_tools+=($tool)
        fi
    done
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi
    
    log_step "Checking cluster connectivity..."
    kubectl cluster-info --request-timeout=10s > /dev/null
    
    log_step "Checking Docker registry access..."
    docker info > /dev/null
    
    log_step "Verifying environment variables..."
    required_vars=(
        "JWT_SECRET"
        "DATABASE_URL" 
        "REDIS_URL"
        "ANTHROPIC_API_KEY"
        "GROQ_API_KEY"
    )
    
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            log_warning "$var not set - using defaults"
        fi
    done
    
    log_success "Prerequisites validation completed"
}

# Phase 1: Infrastructure Deployment
deploy_infrastructure() {
    log_phase "INFRASTRUCTURE DEPLOYMENT"
    
    log_step "Creating production namespace..."
    kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    
    log_step "Deploying monitoring stack..."
    kubectl apply -f monitoring/comprehensive-dashboard.yaml
    
    log_step "Deploying secrets management..."
    kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: recoder-secrets
  namespace: $NAMESPACE
type: Opaque
data:
  jwt-secret: $(echo -n "${JWT_SECRET:-$(openssl rand -base64 32)}" | base64)
  database-url: $(echo -n "$DATABASE_URL" | base64)
  redis-url: $(echo -n "$REDIS_URL" | base64)
  anthropic-api-key: $(echo -n "$ANTHROPIC_API_KEY" | base64)
  groq-api-key: $(echo -n "$GROQ_API_KEY" | base64)
  google-api-key: $(echo -n "$GOOGLE_API_KEY" | base64)
EOF
    
    log_step "Deploying PostgreSQL cluster..."
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: postgres-primary
  namespace: $NAMESPACE
spec:
  serviceName: postgres-primary
  replicas: 1
  selector:
    matchLabels:
      app: postgres-primary
  template:
    metadata:
      labels:
        app: postgres-primary
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        env:
        - name: POSTGRES_DB
          value: recoder_production
        - name: POSTGRES_USER
          value: recoder
        - name: POSTGRES_PASSWORD
          valueFrom:
            secretKeyRef:
              name: recoder-secrets
              key: postgres-password
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi" 
            cpu: "1000m"
  volumeClaimTemplates:
  - metadata:
      name: postgres-storage
    spec:
      accessModes: ["ReadWriteOnce"]
      resources:
        requests:
          storage: 50Gi
---
apiVersion: v1
kind: Service
metadata:
  name: postgres-primary
  namespace: $NAMESPACE
spec:
  selector:
    app: postgres-primary
  ports:
  - port: 5432
    targetPort: 5432
EOF

    log_step "Deploying Redis cluster..."
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis-cluster
  namespace: $NAMESPACE
spec:
  replicas: 3
  selector:
    matchLabels:
      app: redis-cluster
  template:
    metadata:
      labels:
        app: redis-cluster
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        command: ["redis-server"]
        args: ["--cluster-enabled", "yes", "--appendonly", "yes"]
        ports:
        - containerPort: 6379
        - containerPort: 16379
        resources:
          requests:
            memory: "256Mi"
            cpu: "100m"
          limits:
            memory: "512Mi"
            cpu: "200m"
---
apiVersion: v1
kind: Service
metadata:
  name: redis-cluster
  namespace: $NAMESPACE
spec:
  selector:
    app: redis-cluster
  ports:
  - port: 6379
    targetPort: 6379
EOF

    log_success "Infrastructure deployment completed"
}

# Phase 2: Core Services Deployment
deploy_core_services() {
    log_phase "CORE SERVICES DEPLOYMENT"
    
    log_step "Building and deploying Enhanced API Gateway..."
    docker build -t $DOCKER_REGISTRY/api-gateway:$VERSION -f backend/Dockerfile.gateway backend/
    docker push $DOCKER_REGISTRY/api-gateway:$VERSION
    
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway
  namespace: $NAMESPACE
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api-gateway
  template:
    metadata:
      labels:
        app: api-gateway
    spec:
      containers:
      - name: api-gateway
        image: $DOCKER_REGISTRY/api-gateway:$VERSION
        ports:
        - containerPort: 8080
        env:
        - name: NODE_ENV
          value: production
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: recoder-secrets
              key: redis-url
        readinessProbe:
          httpGet:
            path: /health
            port: 8080
        livenessProbe:
          httpGet:
            path: /health
            port: 8080
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
  name: api-gateway
  namespace: $NAMESPACE
spec:
  selector:
    app: api-gateway
  ports:
  - port: 80
    targetPort: 8080
  type: LoadBalancer
EOF
    
    log_step "Deploying Backend Services..."
    docker build -t $DOCKER_REGISTRY/backend:$VERSION backend/
    docker push $DOCKER_REGISTRY/backend:$VERSION
    
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: backend-services
  namespace: $NAMESPACE
spec:
  replicas: 5
  selector:
    matchLabels:
      app: backend-services
  template:
    metadata:
      labels:
        app: backend-services
    spec:
      containers:
      - name: backend
        image: $DOCKER_REGISTRY/backend:$VERSION
        ports:
        - containerPort: 3001
        env:
        - name: NODE_ENV
          value: production
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: recoder-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: recoder-secrets
              key: redis-url
        - name: ANTHROPIC_API_KEY
          valueFrom:
            secretKeyRef:
              name: recoder-secrets
              key: anthropic-api-key
        resources:
          requests:
            memory: "1Gi"
            cpu: "500m"
          limits:
            memory: "2Gi"
            cpu: "1000m"
---
apiVersion: v1
kind: Service
metadata:
  name: backend-services
  namespace: $NAMESPACE
spec:
  selector:
    app: backend-services
  ports:
  - port: 3001
    targetPort: 3001
EOF
    
    log_step "Deploying Production Engine..."
    docker build -t $DOCKER_REGISTRY/production-engine:$VERSION production-engine/
    docker push $DOCKER_REGISTRY/production-engine:$VERSION
    
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: production-engine
  namespace: $NAMESPACE
spec:
  replicas: 3
  selector:
    matchLabels:
      app: production-engine
  template:
    metadata:
      labels:
        app: production-engine
    spec:
      containers:
      - name: production-engine
        image: $DOCKER_REGISTRY/production-engine:$VERSION
        ports:
        - containerPort: 3002
        env:
        - name: NODE_ENV
          value: production
        - name: BACKEND_URL
          value: http://backend-services:3001
        resources:
          requests:
            memory: "2Gi"
            cpu: "1000m"
          limits:
            memory: "4Gi"
            cpu: "2000m"
---
apiVersion: v1
kind: Service
metadata:
  name: production-engine
  namespace: $NAMESPACE
spec:
  selector:
    app: production-engine
  ports:
  - port: 3002
    targetPort: 3002
EOF

    log_success "Core services deployment completed"
}

# Phase 3: Web Platform Deployment
deploy_web_platforms() {
    log_phase "WEB PLATFORMS DEPLOYMENT"
    
    log_step "Building and deploying Chat Platform..."
    cd recoder-chat
    npm ci
    npm run build
    docker build -t $DOCKER_REGISTRY/chat-platform:$VERSION .
    docker push $DOCKER_REGISTRY/chat-platform:$VERSION
    cd ..
    
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: chat-platform
  namespace: $NAMESPACE
spec:
  replicas: 3
  selector:
    matchLabels:
      app: chat-platform
  template:
    metadata:
      labels:
        app: chat-platform
    spec:
      containers:
      - name: chat-platform
        image: $DOCKER_REGISTRY/chat-platform:$VERSION
        ports:
        - containerPort: 3003
        env:
        - name: NODE_ENV
          value: production
        - name: NEXTAUTH_URL
          value: https://chat.recoder.xyz
        - name: NEXTAUTH_SECRET
          valueFrom:
            secretKeyRef:
              name: recoder-secrets
              key: jwt-secret
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: recoder-secrets
              key: database-url
---
apiVersion: v1
kind: Service
metadata:
  name: chat-platform
  namespace: $NAMESPACE
spec:
  selector:
    app: chat-platform
  ports:
  - port: 3003
    targetPort: 3003
EOF
    
    log_step "Building and deploying Web Platform..."
    cd recoder-web
    npm ci
    npm run build
    docker build -t $DOCKER_REGISTRY/web-platform:$VERSION .
    docker push $DOCKER_REGISTRY/web-platform:$VERSION
    cd ..
    
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-platform
  namespace: $NAMESPACE
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web-platform
  template:
    metadata:
      labels:
        app: web-platform
    spec:
      containers:
      - name: web-platform
        image: $DOCKER_REGISTRY/web-platform:$VERSION
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: production
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: recoder-secrets
              key: database-url
---
apiVersion: v1
kind: Service
metadata:
  name: web-platform
  namespace: $NAMESPACE
spec:
  selector:
    app: web-platform
  ports:
  - port: 3000
    targetPort: 3000
EOF

    log_success "Web platforms deployment completed"
}

# Phase 4: Authentication Deployment
deploy_authentication() {
    log_phase "UNIFIED AUTHENTICATION DEPLOYMENT"
    
    log_step "Executing unified authentication deployment..."
    ./deploy-unified-auth.sh
    
    log_success "Authentication system deployed across all platforms"
}

# Phase 5: Client Distribution
prepare_client_distribution() {
    log_phase "CLIENT DISTRIBUTION PREPARATION"
    
    log_step "Preparing browser extension packages..."
    cd browser-extension
    
    # Chrome extension
    zip -r ../dist/recoder-chrome-extension-$VERSION.zip . \
        -x "*.md" "manifest_firefox.json" "test-*"
    
    # Firefox extension  
    cp manifest_firefox.json manifest.json
    zip -r ../dist/recoder-firefox-extension-$VERSION.zip . \
        -x "*.md" "manifest.json.bak" "test-*"
    git checkout manifest.json  # Restore original
    cd ..
    
    log_step "Building desktop app distributions..."
    cd recoder-desktop
    npm ci
    npm run dist-all
    cp dist/* ../dist/desktop/
    cd ..
    
    log_step "Preparing CLI packages..."
    cd packages/cli
    npm ci
    npm run build
    npm pack
    cp *.tgz ../../dist/cli/
    cd ../..
    
    log_success "Client distribution packages prepared"
}

# Phase 6: SSL and Ingress Configuration
deploy_ingress() {
    log_phase "SSL & INGRESS CONFIGURATION"
    
    log_step "Deploying SSL certificates..."
    kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: admin@recoder.xyz
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
    
    log_step "Deploying main ingress..."
    kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: recoder-ingress
  namespace: $NAMESPACE
  annotations:
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/force-ssl-redirect: "true"
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
    nginx.ingress.kubernetes.io/proxy-body-size: "50m"
spec:
  tls:
  - hosts:
    - recoder.xyz
    - www.recoder.xyz
    - api.recoder.xyz
    - chat.recoder.xyz
    - app.recoder.xyz
    secretName: recoder-tls-secret
  rules:
  - host: recoder.xyz
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-platform
            port:
              number: 3000
  - host: api.recoder.xyz
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: api-gateway
            port:
              number: 80
  - host: chat.recoder.xyz
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: chat-platform
            port:
              number: 3003
  - host: app.recoder.xyz
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-platform
            port:
              number: 3000
EOF

    log_success "SSL certificates and ingress configured"
}

# Phase 7: Validation and Health Checks
validate_deployment() {
    log_phase "DEPLOYMENT VALIDATION"
    
    log_step "Waiting for all services to be ready..."
    local services=(
        "api-gateway"
        "backend-services" 
        "production-engine"
        "chat-platform"
        "web-platform"
        "auth-service"
    )
    
    for service in "${services[@]}"; do
        log_step "Waiting for $service..."
        kubectl wait --for=condition=available deployment/$service \
            --timeout=300s -n $NAMESPACE
        log_success "$service is ready"
    done
    
    log_step "Running health checks..."
    sleep 30  # Allow services to stabilize
    
    # Test API Gateway
    if kubectl run test-pod --image=curlimages/curl --rm -i --restart=Never -- \
        curl -s http://api-gateway/health; then
        log_success "API Gateway health check passed"
    else
        log_error "API Gateway health check failed"
        exit 1
    fi
    
    log_step "Running production deployment test suite..."
    node production-deployment-test.js
    
    log_success "All validation checks passed"
}

# Phase 8: Post-Deployment Setup
post_deployment_setup() {
    log_phase "POST-DEPLOYMENT SETUP"
    
    log_step "Creating deployment record..."
    kubectl apply -f - <<EOF
apiVersion: v1
kind: ConfigMap
metadata:
  name: deployment-$DEPLOYMENT_ID
  namespace: $NAMESPACE
data:
  version: "$VERSION"
  timestamp: "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  deployment-id: "$DEPLOYMENT_ID"
  services: |
    api-gateway: $DOCKER_REGISTRY/api-gateway:$VERSION
    backend-services: $DOCKER_REGISTRY/backend:$VERSION
    production-engine: $DOCKER_REGISTRY/production-engine:$VERSION
    chat-platform: $DOCKER_REGISTRY/chat-platform:$VERSION
    web-platform: $DOCKER_REGISTRY/web-platform:$VERSION
EOF
    
    log_step "Setting up monitoring alerts..."
    kubectl apply -f monitoring/comprehensive-dashboard.yaml
    
    log_step "Creating backup jobs..."
    kubectl apply -f - <<EOF
apiVersion: batch/v1
kind: CronJob
metadata:
  name: database-backup
  namespace: $NAMESPACE
spec:
  schedule: "0 2 * * *"  # Daily at 2 AM
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: backup
            image: postgres:15-alpine
            command:
            - /bin/sh
            - -c
            - |
              pg_dump \$DATABASE_URL | gzip > /backup/backup-\$(date +%Y%m%d-%H%M%S).sql.gz
              # Upload to cloud storage here
            env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: recoder-secrets
                  key: database-url
          restartPolicy: OnFailure
EOF

    log_success "Post-deployment setup completed"
}

# Main execution function
main() {
    echo -e "${GREEN}🚀 EXECUTING MARKET DOMINATION DEPLOYMENT${NC}"
    echo -e "${BLUE}=================================================${NC}"
    echo ""
    
    # Create deployment directory
    mkdir -p dist/{chrome,firefox,desktop,cli}
    
    # Execute deployment phases
    check_prerequisites
    deploy_infrastructure
    deploy_core_services  
    deploy_web_platforms
    deploy_authentication
    prepare_client_distribution
    deploy_ingress
    validate_deployment
    post_deployment_setup
    
    # Success summary
    echo ""
    echo -e "${GREEN}🎉 DEPLOYMENT SUCCESSFUL! 🎉${NC}"
    echo -e "${PURPLE}══════════════════════════════${NC}"
    echo ""
    echo -e "${CYAN}🌐 Live Endpoints:${NC}"
    echo "   • Main Platform: https://recoder.xyz"
    echo "   • Chat Platform: https://chat.recoder.xyz"  
    echo "   • API Gateway:   https://api.recoder.xyz"
    echo "   • Monitoring:    https://monitoring.recoder.xyz"
    echo ""
    echo -e "${CYAN}📱 Client Packages:${NC}"
    echo "   • Chrome Extension: dist/recoder-chrome-extension-$VERSION.zip"
    echo "   • Firefox Extension: dist/recoder-firefox-extension-$VERSION.zip"
    echo "   • Desktop Apps: dist/desktop/"
    echo "   • CLI Package: dist/cli/"
    echo ""
    echo -e "${CYAN}📊 System Status:${NC}"
    kubectl get pods -n $NAMESPACE
    echo ""
    echo -e "${CYAN}🎯 Next Steps:${NC}"
    echo "   1. Submit browser extensions to Chrome Web Store & Firefox Add-ons"
    echo "   2. Distribute desktop apps via GitHub Releases"
    echo "   3. Publish CLI to npm registry"
    echo "   4. Launch developer outreach campaign"
    echo "   5. Monitor system metrics and user adoption"
    echo ""
    echo -e "${GREEN}🏆 READY TO DOMINATE THE AI CODING MARKET!${NC}"
    
    log_success "Master deployment completed successfully!"
}

# Execute main function
main "$@"

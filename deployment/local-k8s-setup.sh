#!/bin/bash

# Local Kubernetes Setup for Recoder.xyz Development
# Sets up complete K8s environment with monitoring and CI/CD

set -e
trap 'echo "❌ Setup failed at line $LINENO"' ERR

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo -e "${PURPLE}"
echo "🚀 RECODER.XYZ LOCAL KUBERNETES SETUP"
echo "===================================="
echo -e "${NC}"

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

# Check if we're on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    log_error "This script is designed for macOS. Please adapt for your OS."
    exit 1
fi

# Check and install dependencies
install_dependencies() {
    log_info "Installing required dependencies..."
    
    # Check if Homebrew is installed
    if ! command -v brew &> /dev/null; then
        log_info "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    fi
    
    # Install Docker Desktop if not present
    if ! command -v docker &> /dev/null; then
        log_info "Installing Docker Desktop..."
        brew install --cask docker
        log_warning "Please start Docker Desktop manually and come back"
        read -p "Press Enter after Docker Desktop is running..."
    fi
    
    # Install kubectl
    if ! command -v kubectl &> /dev/null; then
        log_info "Installing kubectl..."
        brew install kubectl
    fi
    
    # Install kind (Kubernetes in Docker)
    if ! command -v kind &> /dev/null; then
        log_info "Installing kind..."
        brew install kind
    fi
    
    # Install helm
    if ! command -v helm &> /dev/null; then
        log_info "Installing helm..."
        brew install helm
    fi
    
    # Install k9s for cluster management
    if ! command -v k9s &> /dev/null; then
        log_info "Installing k9s..."
        brew install k9s
    fi
    
    log_success "Dependencies installed successfully"
}

# Create kind cluster
create_kind_cluster() {
    log_info "Creating kind cluster for Recoder.xyz..."
    
    # Create kind cluster config
    cat > kind-config.yaml <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: recoder-cluster
nodes:
- role: control-plane
  kubeadmConfigPatches:
  - |
    kind: InitConfiguration
    nodeRegistration:
      kubeletExtraArgs:
        node-labels: "ingress-ready=true"
  extraPortMappings:
  - containerPort: 80
    hostPort: 80
    protocol: TCP
  - containerPort: 443
    hostPort: 443
    protocol: TCP
  - containerPort: 3000
    hostPort: 3000
    protocol: TCP
  - containerPort: 3001
    hostPort: 3001
    protocol: TCP
  - containerPort: 3002
    hostPort: 3002
    protocol: TCP
  - containerPort: 3004
    hostPort: 3004
    protocol: TCP
  - containerPort: 9090
    hostPort: 9090
    protocol: TCP
  - containerPort: 3100
    hostPort: 3100
    protocol: TCP
- role: worker
- role: worker
EOF
    
    # Delete existing cluster if it exists
    if kind get clusters | grep -q "recoder-cluster"; then
        log_warning "Deleting existing recoder-cluster..."
        kind delete cluster --name recoder-cluster
    fi
    
    # Create new cluster
    log_info "Creating new kind cluster..."
    kind create cluster --config kind-config.yaml --wait 5m
    
    # Set kubectl context
    kubectl cluster-info --context kind-recoder-cluster
    
    log_success "Kind cluster created successfully"
}

# Install NGINX Ingress Controller
install_ingress() {
    log_info "Installing NGINX Ingress Controller..."
    
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
    
    # Wait for ingress controller to be ready
    log_info "Waiting for ingress controller to be ready..."
    kubectl wait --namespace ingress-nginx \
        --for=condition=ready pod \
        --selector=app.kubernetes.io/component=controller \
        --timeout=90s
    
    log_success "NGINX Ingress Controller installed"
}

# Install cert-manager for SSL certificates
install_cert_manager() {
    log_info "Installing cert-manager..."
    
    kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml
    
    # Wait for cert-manager to be ready
    log_info "Waiting for cert-manager to be ready..."
    kubectl wait --namespace cert-manager \
        --for=condition=ready pod \
        --selector=app.kubernetes.io/name=cert-manager \
        --timeout=90s
    
    log_success "cert-manager installed"
}

# Install Prometheus and Grafana
install_monitoring() {
    log_info "Installing Prometheus and Grafana..."
    
    # Add helm repositories
    helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
    helm repo add grafana https://grafana.github.io/helm-charts
    helm repo update
    
    # Create monitoring namespace
    kubectl create namespace monitoring --dry-run=client -o yaml | kubectl apply -f -
    
    # Install Prometheus
    helm upgrade --install prometheus prometheus-community/kube-prometheus-stack \
        --namespace monitoring \
        --set prometheus.service.type=NodePort \
        --set prometheus.service.nodePort=30090 \
        --set grafana.service.type=NodePort \
        --set grafana.service.nodePort=30091 \
        --set grafana.adminPassword=admin123 \
        --wait
    
    log_success "Monitoring stack installed"
    log_info "Grafana admin password: admin123"
    log_info "Access Grafana at: http://localhost:30091"
    log_info "Access Prometheus at: http://localhost:30090"
}

# Create development namespace and secrets
setup_development_environment() {
    log_info "Setting up development environment..."
    
    # Create recoder-production namespace
    kubectl create namespace recoder-production --dry-run=client -o yaml | kubectl apply -f -
    
    # Create basic secrets (for development)
    kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: recoder-secrets
  namespace: recoder-production
type: Opaque
data:
  jwt-secret: $(echo -n "dev-jwt-secret-$(openssl rand -hex 16)" | base64)
  database-url: $(echo -n "postgresql://postgres:password@postgres:5432/recoder" | base64)
  redis-url: $(echo -n "redis://redis:6379" | base64)
  anthropic-api-key: $(echo -n "${ANTHROPIC_API_KEY:-dev-anthropic-key}" | base64)
  groq-api-key: $(echo -n "${GROQ_API_KEY:-dev-groq-key}" | base64)
  google-api-key: $(echo -n "${GOOGLE_API_KEY:-dev-google-key}" | base64)
EOF
    
    log_success "Development environment configured"
}

# Deploy basic infrastructure (PostgreSQL, Redis)
deploy_basic_infrastructure() {
    log_info "Deploying basic infrastructure..."
    
    # Deploy PostgreSQL
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: postgres
  namespace: recoder-production
spec:
  replicas: 1
  selector:
    matchLabels:
      app: postgres
  template:
    metadata:
      labels:
        app: postgres
    spec:
      containers:
      - name: postgres
        image: postgres:15-alpine
        env:
        - name: POSTGRES_DB
          value: recoder
        - name: POSTGRES_USER
          value: postgres
        - name: POSTGRES_PASSWORD
          value: password
        - name: PGDATA
          value: /var/lib/postgresql/data/pgdata
        ports:
        - containerPort: 5432
        volumeMounts:
        - name: postgres-storage
          mountPath: /var/lib/postgresql/data
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
      volumes:
      - name: postgres-storage
        emptyDir: {}
---
apiVersion: v1
kind: Service
metadata:
  name: postgres
  namespace: recoder-production
spec:
  selector:
    app: postgres
  ports:
  - port: 5432
    targetPort: 5432
EOF

    # Deploy Redis
    kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: redis
  namespace: recoder-production
spec:
  replicas: 1
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
      - name: redis
        image: redis:7-alpine
        ports:
        - containerPort: 6379
        resources:
          requests:
            memory: "128Mi"
            cpu: "100m"
          limits:
            memory: "256Mi"
            cpu: "200m"
---
apiVersion: v1
kind: Service
metadata:
  name: redis
  namespace: recoder-production
spec:
  selector:
    app: redis
  ports:
  - port: 6379
    targetPort: 6379
EOF

    # Wait for databases to be ready
    log_info "Waiting for databases to be ready..."
    kubectl wait --for=condition=available deployment/postgres -n recoder-production --timeout=120s
    kubectl wait --for=condition=available deployment/redis -n recoder-production --timeout=120s
    
    log_success "Basic infrastructure deployed"
}

# Create cluster info summary
create_cluster_info() {
    log_info "Creating cluster information summary..."
    
    cat > cluster-info.md <<EOF
# Recoder.xyz Local Kubernetes Cluster

## Cluster Information
- **Cluster Name**: recoder-cluster
- **Type**: kind (Kubernetes in Docker)
- **Nodes**: 1 control-plane, 2 workers
- **Context**: kind-recoder-cluster

## Access Information
- **Kubernetes Dashboard**: Not installed (use k9s for management)
- **Grafana**: http://localhost:30091 (admin/admin123)
- **Prometheus**: http://localhost:30090

## Useful Commands
\`\`\`bash
# Switch to cluster context
kubectl config use-context kind-recoder-cluster

# View cluster status
kubectl cluster-info

# Access cluster management UI
k9s

# Port forward to services
kubectl port-forward -n monitoring service/prometheus-kube-prometheus-prometheus 9090:9090
kubectl port-forward -n monitoring service/prometheus-grafana 3000:80

# Delete cluster when done
kind delete cluster --name recoder-cluster
\`\`\`

## Namespaces
- **default**: Default namespace
- **recoder-production**: Main application namespace
- **monitoring**: Prometheus and Grafana
- **ingress-nginx**: Ingress controller
- **cert-manager**: Certificate management

## Next Steps
1. Deploy Recoder.xyz applications using the master-deploy.sh script
2. Access applications through ingress or port-forwarding
3. Monitor system health through Grafana dashboards
4. Use k9s for cluster management and debugging
EOF

    log_success "Cluster information created in cluster-info.md"
}

# Main execution
main() {
    echo "🚀 Starting Recoder.xyz Kubernetes Setup"
    echo "Time: $(date)"
    echo ""
    
    install_dependencies
    create_kind_cluster
    install_ingress
    install_cert_manager
    install_monitoring
    setup_development_environment
    deploy_basic_infrastructure
    create_cluster_info
    
    echo ""
    echo -e "${GREEN}🎉 KUBERNETES SETUP COMPLETE! 🎉${NC}"
    echo -e "${PURPLE}====================================${NC}"
    echo ""
    echo -e "${CYAN}🌐 Access Information:${NC}"
    echo "   • Kubernetes Context: kind-recoder-cluster"
    echo "   • Grafana Dashboard: http://localhost:30091 (admin/admin123)"
    echo "   • Prometheus: http://localhost:30090"
    echo ""
    echo -e "${CYAN}🛠️ Management Tools:${NC}"
    echo "   • Cluster Management: k9s"
    echo "   • kubectl: kubectl --context kind-recoder-cluster"
    echo ""
    echo -e "${CYAN}🎯 Next Steps:${NC}"
    echo "   1. Run: kubectl config use-context kind-recoder-cluster"
    echo "   2. Deploy applications: ./master-deploy.sh"
    echo "   3. Access management UI: k9s"
    echo "   4. View cluster info: cat cluster-info.md"
    echo ""
    echo -e "${GREEN}🏆 READY FOR RECODER.XYZ DEPLOYMENT!${NC}"
}

# Execute main function
main "$@"
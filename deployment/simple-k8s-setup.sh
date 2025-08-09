#!/bin/bash

# Simple Kubernetes Setup for Recoder.xyz Development
# Creates a basic kind cluster without port conflicts

set -e
trap 'echo "❌ Setup failed at line $LINENO"' ERR

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
NC='\033[0m'

echo -e "${PURPLE}🚀 SIMPLE KUBERNETES SETUP FOR RECODER.XYZ${NC}"
echo "============================================="

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

# Check if kind is installed
if ! command -v kind &> /dev/null; then
    log_info "Installing kind..."
    brew install kind
fi

# Check if kubectl is installed
if ! command -v kubectl &> /dev/null; then
    log_info "Installing kubectl..."
    brew install kubectl
fi

# Create simple kind cluster
create_simple_cluster() {
    log_info "Creating simple kind cluster..."
    
    # Delete existing cluster if it exists
    if kind get clusters | grep -q "recoder-simple"; then
        log_info "Deleting existing cluster..."
        kind delete cluster --name recoder-simple
    fi
    
    # Create minimal cluster config
    cat > simple-kind-config.yaml <<EOF
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
name: recoder-simple
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
    hostPort: 8080
    protocol: TCP
  - containerPort: 443
    hostPort: 8443
    protocol: TCP
- role: worker
EOF
    
    # Create cluster
    kind create cluster --config simple-kind-config.yaml --wait 5m
    
    log_success "Kind cluster created successfully"
}

# Install basic ingress
install_ingress() {
    log_info "Installing NGINX ingress controller..."
    
    kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
    
    # Wait for ingress to be ready
    kubectl wait --namespace ingress-nginx \
        --for=condition=ready pod \
        --selector=app.kubernetes.io/component=controller \
        --timeout=90s
    
    log_success "Ingress controller installed"
}

# Create namespace
create_namespace() {
    log_info "Creating recoder-production namespace..."
    
    kubectl create namespace recoder-production --dry-run=client -o yaml | kubectl apply -f -
    
    log_success "Namespace created"
}

# Main execution
main() {
    create_simple_cluster
    install_ingress
    create_namespace
    
    echo ""
    echo -e "${GREEN}🎉 SIMPLE KUBERNETES SETUP COMPLETE!${NC}"
    echo "==========================================="
    echo ""
    echo -e "${BLUE}Cluster Info:${NC}"
    echo "  • Name: recoder-simple"
    echo "  • Context: kind-recoder-simple" 
    echo "  • Ingress: http://localhost:8080"
    echo ""
    echo -e "${BLUE}Next Steps:${NC}"
    echo "  1. kubectl config use-context kind-recoder-simple"
    echo "  2. kubectl get nodes"
    echo "  3. Run deployment scripts"
    echo ""
    log_success "Ready for Recoder.xyz deployment!"
}

main "$@"
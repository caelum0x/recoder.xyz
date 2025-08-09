#!/bin/bash

# Recoder.xyz Kubernetes Deployment Script
# Production-ready deployment automation

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
NAMESPACE="recoder-production"
REGISTRY="your-registry.com/recoder"  # Change to your container registry
VERSION="${1:-latest}"

echo -e "${BLUE}🚀 Deploying Recoder.xyz to Kubernetes${NC}"
echo -e "${BLUE}Version: ${VERSION}${NC}"
echo -e "${BLUE}Namespace: ${NAMESPACE}${NC}"
echo ""

# Function to check if kubectl is available
check_kubectl() {
    if ! command -v kubectl &> /dev/null; then
        echo -e "${RED}❌ kubectl is not installed or not in PATH${NC}"
        exit 1
    fi
    
    # Check if we can connect to cluster
    if ! kubectl cluster-info &> /dev/null; then
        echo -e "${RED}❌ Cannot connect to Kubernetes cluster${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}✅ Connected to Kubernetes cluster${NC}"
}

# Function to create namespace
create_namespace() {
    echo -e "${YELLOW}📦 Creating namespace...${NC}"
    kubectl apply -f namespace.yaml
    echo -e "${GREEN}✅ Namespace created${NC}"
}

# Function to apply secrets (with warning)
apply_secrets() {
    echo -e "${YELLOW}🔐 Applying secrets...${NC}"
    echo -e "${RED}⚠️  WARNING: Update all secret values in secrets.yaml before production deployment!${NC}"
    read -p "Have you updated all secret values? (y/n): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${RED}❌ Please update all secret values in secrets.yaml${NC}"
        exit 1
    fi
    
    kubectl apply -f secrets.yaml
    echo -e "${GREEN}✅ Secrets applied${NC}"
}

# Function to apply config maps
apply_configmaps() {
    echo -e "${YELLOW}⚙️  Applying configuration maps...${NC}"
    kubectl apply -f configmap.yaml
    echo -e "${GREEN}✅ Config maps applied${NC}"
}

# Function to deploy database
deploy_database() {
    echo -e "${YELLOW}🗄️  Deploying PostgreSQL database...${NC}"
    kubectl apply -f postgres-deployment.yaml
    
    # Wait for database to be ready
    echo -e "${YELLOW}⏳ Waiting for database to be ready...${NC}"
    kubectl wait --for=condition=ready pod -l app=recoder-postgres -n ${NAMESPACE} --timeout=300s
    echo -e "${GREEN}✅ Database deployed and ready${NC}"
}

# Function to deploy Redis
deploy_redis() {
    echo -e "${YELLOW}⚡ Deploying Redis cache...${NC}"
    kubectl apply -f redis-deployment.yaml
    
    # Wait for Redis to be ready
    echo -e "${YELLOW}⏳ Waiting for Redis to be ready...${NC}"
    kubectl wait --for=condition=ready pod -l app=recoder-redis -n ${NAMESPACE} --timeout=300s
    echo -e "${GREEN}✅ Redis deployed and ready${NC}"
}

# Function to build and push Docker images
build_and_push_images() {
    echo -e "${YELLOW}🐳 Building and pushing Docker images...${NC}"
    
    # Build backend image
    echo -e "${YELLOW}Building backend image...${NC}"
    docker build -t ${REGISTRY}/backend:${VERSION} ../backend/
    docker push ${REGISTRY}/backend:${VERSION}
    
    # Update deployment YAML with new image
    sed -i.bak "s|image: recoder/backend:latest|image: ${REGISTRY}/backend:${VERSION}|g" backend-deployment.yaml
    
    echo -e "${GREEN}✅ Images built and pushed${NC}"
}

# Function to deploy backend
deploy_backend() {
    echo -e "${YELLOW}🔧 Deploying backend API...${NC}"
    kubectl apply -f backend-deployment.yaml
    
    # Wait for backend to be ready
    echo -e "${YELLOW}⏳ Waiting for backend to be ready...${NC}"
    kubectl wait --for=condition=ready pod -l app=recoder-backend -n ${NAMESPACE} --timeout=600s
    echo -e "${GREEN}✅ Backend deployed and ready${NC}"
}

# Function to deploy nginx
deploy_nginx() {
    echo -e "${YELLOW}🌐 Deploying Nginx reverse proxy...${NC}"
    kubectl apply -f nginx-deployment.yaml
    
    # Wait for nginx to be ready
    echo -e "${YELLOW}⏳ Waiting for Nginx to be ready...${NC}"
    kubectl wait --for=condition=ready pod -l app=recoder-nginx -n ${NAMESPACE} --timeout=300s
    echo -e "${GREEN}✅ Nginx deployed and ready${NC}"
}

# Function to deploy monitoring (optional)
deploy_monitoring() {
    echo -e "${YELLOW}📊 Deploying monitoring stack...${NC}"
    kubectl apply -f monitoring.yaml
    echo -e "${GREEN}✅ Monitoring stack deployed${NC}"
}

# Function to run database migrations
run_migrations() {
    echo -e "${YELLOW}🔄 Running database migrations...${NC}"
    
    # Create a job to run migrations
    cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: recoder-migration-$(date +%s)
  namespace: ${NAMESPACE}
spec:
  template:
    spec:
      containers:
      - name: migration
        image: ${REGISTRY}/backend:${VERSION}
        command: ["npm", "run", "migrate"]
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: recoder-database-secret
              key: DATABASE_URL
      restartPolicy: Never
  backoffLimit: 3
EOF
    
    echo -e "${GREEN}✅ Database migration job created${NC}"
}

# Function to check deployment status
check_deployment_status() {
    echo -e "${YELLOW}📋 Checking deployment status...${NC}"
    
    # Check all deployments
    kubectl get deployments -n ${NAMESPACE}
    echo ""
    
    # Check all services
    kubectl get services -n ${NAMESPACE}
    echo ""
    
    # Check all pods
    kubectl get pods -n ${NAMESPACE}
    echo ""
    
    # Get external IPs
    echo -e "${BLUE}🌍 External access points:${NC}"
    kubectl get services -n ${NAMESPACE} -o wide | grep LoadBalancer
}

# Function to show connection info
show_connection_info() {
    echo -e "${BLUE}🔗 Connection Information:${NC}"
    
    # Get LoadBalancer IP
    EXTERNAL_IP=$(kubectl get service recoder-nginx-service -n ${NAMESPACE} -o jsonpath='{.status.loadBalancer.ingress[0].ip}')
    
    if [ ! -z "$EXTERNAL_IP" ]; then
        echo -e "${GREEN}🌐 External IP: ${EXTERNAL_IP}${NC}"
        echo -e "${GREEN}🌐 Application URL: http://${EXTERNAL_IP}${NC}"
        echo -e "${GREEN}🌐 API URL: http://${EXTERNAL_IP}/api${NC}"
    else
        echo -e "${YELLOW}⏳ External IP not yet assigned. Check with:${NC}"
        echo "kubectl get service recoder-nginx-service -n ${NAMESPACE}"
    fi
    
    # Port forward commands for local access
    echo ""
    echo -e "${BLUE}🔌 For local development access:${NC}"
    echo "kubectl port-forward service/recoder-backend-service 3001:3001 -n ${NAMESPACE}"
    echo "kubectl port-forward service/grafana 3000:3000 -n ${NAMESPACE}"
    echo "kubectl port-forward service/prometheus 9090:9090 -n ${NAMESPACE}"
}

# Function to cleanup deployment
cleanup() {
    echo -e "${RED}🧹 Cleaning up deployment...${NC}"
    
    read -p "Are you sure you want to delete the entire deployment? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        kubectl delete namespace ${NAMESPACE}
        echo -e "${GREEN}✅ Deployment cleaned up${NC}"
    else
        echo -e "${YELLOW}Cleanup cancelled${NC}"
    fi
}

# Main deployment function
deploy_all() {
    check_kubectl
    create_namespace
    apply_secrets
    apply_configmaps
    
    # Deploy infrastructure
    deploy_database
    deploy_redis
    
    # Build and deploy application
    build_and_push_images
    deploy_backend
    
    # Deploy reverse proxy
    deploy_nginx
    
    # Run migrations
    run_migrations
    
    # Deploy monitoring (optional)
    read -p "Deploy monitoring stack? (y/n): " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        deploy_monitoring
    fi
    
    # Check status
    sleep 10
    check_deployment_status
    show_connection_info
    
    echo ""
    echo -e "${GREEN}🎉 Recoder.xyz deployed successfully!${NC}"
}

# Handle script arguments
case "${2:-deploy}" in
    "deploy")
        deploy_all
        ;;
    "cleanup")
        cleanup
        ;;
    "status")
        check_deployment_status
        show_connection_info
        ;;
    "migrations")
        run_migrations
        ;;
    *)
        echo "Usage: $0 [version] [deploy|cleanup|status|migrations]"
        echo "  version: Docker image version (default: latest)"
        echo "  deploy:  Deploy the entire stack"
        echo "  cleanup: Remove the deployment"
        echo "  status:  Check deployment status"
        echo "  migrations: Run database migrations"
        exit 1
        ;;
esac
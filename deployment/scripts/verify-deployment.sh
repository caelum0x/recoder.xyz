#!/bin/bash

# ✅ Deployment Verification Script
# Comprehensive health and performance validation

set -e

NAMESPACE="recoder-production"

echo "🔍 Verifying deployment health and performance..."

# Function to check service health
check_service_health() {
  local service_name=$1
  local expected_replicas=$2
  
  echo "🏥 Checking $service_name health..."
  
  # Check deployment status
  if ! kubectl get deployment $service_name -n $NAMESPACE > /dev/null 2>&1; then
    echo "❌ Deployment $service_name not found"
    return 1
  fi
  
  # Check replica count
  READY_REPLICAS=$(kubectl get deployment $service_name -n $NAMESPACE -o jsonpath='{.status.readyReplicas}')
  DESIRED_REPLICAS=$(kubectl get deployment $service_name -n $NAMESPACE -o jsonpath='{.spec.replicas}')
  
  if [[ "$READY_REPLICAS" != "$DESIRED_REPLICAS" ]]; then
    echo "⚠️ $service_name: $READY_REPLICAS/$DESIRED_REPLICAS replicas ready"
    return 1
  fi
  
  # Check pod status
  UNHEALTHY_PODS=$(kubectl get pods -n $NAMESPACE -l app=$service_name --field-selector=status.phase!=Running --no-headers | wc -l)
  if [[ $UNHEALTHY_PODS -gt 0 ]]; then
    echo "❌ $service_name has $UNHEALTHY_PODS unhealthy pods"
    kubectl get pods -n $NAMESPACE -l app=$service_name
    return 1
  fi
  
  echo "✅ $service_name: $READY_REPLICAS/$DESIRED_REPLICAS replicas healthy"
  return 0
}

# Function to check endpoint health
check_endpoint_health() {
  local service_name=$1
  local health_path=${2:-/health}
  
  echo "🌐 Checking $service_name endpoint health..."
  
  # Get service IP
  SERVICE_IP=$(kubectl get svc $service_name -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "")
  
  if [[ -z "$SERVICE_IP" ]]; then
    # Try cluster IP if LoadBalancer IP not available
    SERVICE_IP=$(kubectl get svc $service_name -n $NAMESPACE -o jsonpath='{.spec.clusterIP}')
    echo "📍 Using cluster IP: $SERVICE_IP"
  else
    echo "📍 Using LoadBalancer IP: $SERVICE_IP"
  fi
  
  # Health check with retries
  for i in {1..5}; do
    if curl -f -s http://$SERVICE_IP$health_path > /dev/null 2>&1; then
      echo "✅ $service_name endpoint healthy"
      return 0
    fi
    echo "⏳ Attempt $i/5 failed, retrying in 10s..."
    sleep 10
  done
  
  echo "❌ $service_name endpoint health check failed"
  return 1
}

# Function to check resource usage
check_resource_usage() {
  local service_name=$1
  
  echo "📊 Checking $service_name resource usage..."
  
  # Get CPU and memory usage
  kubectl top pods -n $NAMESPACE -l app=$service_name --no-headers | while read line; do
    POD_NAME=$(echo $line | awk '{print $1}')
    CPU_USAGE=$(echo $line | awk '{print $2}')
    MEMORY_USAGE=$(echo $line | awk '{print $3}')
    
    echo "📈 $POD_NAME: CPU=$CPU_USAGE, Memory=$MEMORY_USAGE"
  done
  
  return 0
}

# Main verification process
main() {
  echo "🚀 Starting deployment verification..."
  
  FAILED_CHECKS=0
  
  # Check core services
  SERVICES=("recoder-web" "recoder-chat")
  
  for service in "${SERVICES[@]}"; do
    echo "────────────────────────────────────"
    echo "🔍 Verifying $service"
    
    if ! check_service_health $service; then
      FAILED_CHECKS=$((FAILED_CHECKS + 1))
      continue
    fi
    
    if ! check_endpoint_health $service; then
      FAILED_CHECKS=$((FAILED_CHECKS + 1))
      continue
    fi
    
    check_resource_usage $service
    
    echo "✅ $service verification completed"
  done
  
  # Check auto-scaling configuration
  echo "────────────────────────────────────"
  echo "📈 Checking auto-scaling configuration..."
  
  for service in "${SERVICES[@]}"; do
    HPA_NAME="${service}-hpa"
    if kubectl get hpa $HPA_NAME -n $NAMESPACE > /dev/null 2>&1; then
      HPA_STATUS=$(kubectl get hpa $HPA_NAME -n $NAMESPACE -o jsonpath='{.status.conditions[0].type}')
      echo "📊 $HPA_NAME status: $HPA_STATUS"
    else
      echo "⚠️ HPA not found for $service"
    fi
  done
  
  # Check persistent volumes
  echo "────────────────────────────────────"
  echo "💾 Checking persistent volumes..."
  
  PV_COUNT=$(kubectl get pv -o jsonpath='{.items[?(@.status.phase=="Bound")].metadata.name}' | wc -w)
  echo "📁 $PV_COUNT persistent volumes bound"
  
  # Check network policies
  echo "────────────────────────────────────"
  echo "🔒 Checking network policies..."
  
  NETPOL_COUNT=$(kubectl get networkpolicy -n $NAMESPACE --no-headers | wc -l)
  echo "🛡️ $NETPOL_COUNT network policies active"
  
  # Generate summary
  echo "════════════════════════════════════"
  echo "📋 VERIFICATION SUMMARY"
  echo "════════════════════════════════════"
  
  if [[ $FAILED_CHECKS -eq 0 ]]; then
    echo "🎉 ALL CHECKS PASSED"
    echo "✅ Deployment is healthy and ready for production traffic"
    
    # Print service URLs
    echo ""
    echo "🔗 Service URLs:"
    for service in "${SERVICES[@]}"; do
      SERVICE_IP=$(kubectl get svc $service -n $NAMESPACE -o jsonpath='{.status.loadBalancer.ingress[0].ip}' 2>/dev/null || echo "pending")
      echo "   🌐 $service: http://$SERVICE_IP"
    done
    
    exit 0
  else
    echo "❌ $FAILED_CHECKS CHECKS FAILED"
    echo "🔧 Deployment requires attention before accepting production traffic"
    
    # Show failed pods for debugging
    echo ""
    echo "🔍 Failed pods:"
    kubectl get pods -n $NAMESPACE --field-selector=status.phase!=Running
    
    exit 1
  fi
}

# Run main verification
main "$@"
#!/bin/bash
set -e

echo "========================================="
echo "Deploying Trading Platform to Kubernetes"
echo "========================================="

# Change to k8s directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Apply namespace
echo ""
echo "[1/7] Creating namespace..."
kubectl apply -f namespace.yaml

# Apply configuration
echo ""
echo "[2/7] Applying ConfigMaps and Secrets..."
kubectl apply -f config/configmap.yaml
kubectl apply -f config/secret.yaml

# Deploy databases
echo ""
echo "[3/7] Deploying databases..."
kubectl apply -f databases/rabbitmq.yaml
kubectl apply -f databases/redis.yaml
kubectl apply -f databases/timescaledb.yaml
kubectl apply -f databases/mongodb.yaml
kubectl apply -f databases/chromadb.yaml

# Wait for databases to be ready
echo ""
echo "[4/7] Waiting for databases to be ready (this may take a few minutes)..."
kubectl wait --for=condition=ready pod -l app=rabbitmq -n trading-system --timeout=300s || echo "⚠ RabbitMQ not ready yet"
kubectl wait --for=condition=ready pod -l app=redis -n trading-system --timeout=300s || echo "⚠ Redis not ready yet"

# Deploy core services
echo ""
echo "[5/7] Deploying application services..."
kubectl apply -f services/service-a.yaml
kubectl apply -f services/service-b.yaml
kubectl apply -f services/service-c.yaml

# Wait for services to be ready
echo ""
echo "[6/7] Waiting for services to be ready..."
kubectl wait --for=condition=ready pod -l app=service-a -n trading-system --timeout=180s || echo "⚠ Service A not ready yet"
kubectl wait --for=condition=ready pod -l app=service-b -n trading-system --timeout=180s || echo "⚠ Service B not ready yet"
kubectl wait --for=condition=ready pod -l app=service-c -n trading-system --timeout=180s || echo "⚠ Service C not ready yet"

# Deploy ingress
echo ""
echo "[7/7] Deploying Ingress..."
kubectl apply -f ingress.yaml

echo ""
echo "========================================="
echo "✓ Deployment complete!"
echo "========================================="
echo ""
echo "Check status:"
echo "  kubectl get pods -n trading-system"
echo "  kubectl get svc -n trading-system"
echo "  kubectl get ingress -n trading-system"
echo ""
echo "View logs:"
echo "  kubectl logs -n trading-system -l app=service-a -f"
echo "  kubectl logs -n trading-system -l app=service-b -f"
echo ""
echo "Access RabbitMQ Management UI:"
echo "  kubectl port-forward -n trading-system svc/rabbitmq 15672:15672"
echo "  Then open: http://localhost:15672 (admin/changeme123)"
echo ""
echo "For Ingress access, add to /etc/hosts:"
echo "  Minikube: echo \"\$(minikube ip) trading.local\" | sudo tee -a /etc/hosts"
echo "  Kind: echo \"127.0.0.1 trading.local\" | sudo tee -a /etc/hosts"

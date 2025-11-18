#!/bin/bash
set -e

echo "======================================"
echo "Building Docker Images for Kubernetes"
echo "======================================"

# Navigate to project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo ""
echo "Building Service A (Signal Generator)..."
docker build -t service-a:latest -f Dockerfile.node ./service-a

echo ""
echo "Building Service B (Execution Engine)..."
docker build -t service-b:latest -f Dockerfile.node ./service-b

echo ""
echo "Building Service C (Risk Checker)..."
docker build -t service-c:latest -f service-c/Dockerfile ./service-c

echo ""
echo "======================================"
echo "✓ All images built successfully!"
echo "======================================"
echo ""
echo "Built images:"
docker images | grep -E "^(service-a|service-b|service-c)" || true

echo ""
echo "Next steps:"
echo "  For Minikube: eval \$(minikube docker-env) then re-run this script"
echo "  For Kind: kind load docker-image service-a:latest --name=<cluster-name>"
echo "  For Kind: kind load docker-image service-b:latest --name=<cluster-name>"
echo "  For Kind: kind load docker-image service-c:latest --name=<cluster-name>"

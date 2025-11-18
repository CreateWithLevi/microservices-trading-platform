#!/bin/bash
set -e

echo "========================================="
echo "Cleaning up Trading Platform Resources"
echo "========================================="

# Prompt for confirmation
read -p "This will delete all resources in the 'trading-system' namespace. Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Cleanup cancelled."
    exit 0
fi

echo ""
echo "Deleting namespace (this will remove all resources)..."
kubectl delete namespace trading-system --timeout=120s || echo "⚠ Namespace not found or already deleted"

echo ""
echo "========================================="
echo "✓ Cleanup complete!"
echo "========================================="
echo ""
echo "To completely reset:"
echo "  Minikube: minikube delete"
echo "  Kind: kind delete cluster --name=<cluster-name>"

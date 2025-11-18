#!/bin/bash

echo "========================================="
echo "Trading Platform Status"
echo "========================================="

echo ""
echo "Pods:"
kubectl get pods -n trading-system -o wide

echo ""
echo "Services:"
kubectl get svc -n trading-system

echo ""
echo "Ingress:"
kubectl get ingress -n trading-system

echo ""
echo "StatefulSets:"
kubectl get statefulsets -n trading-system

echo ""
echo "Deployments:"
kubectl get deployments -n trading-system

echo ""
echo "PersistentVolumeClaims:"
kubectl get pvc -n trading-system

echo ""
echo "Recent Events:"
kubectl get events -n trading-system --sort-by='.lastTimestamp' | tail -n 10

echo ""
echo "========================================="
echo "Resource Usage:"
echo "========================================="
kubectl top pods -n trading-system 2>/dev/null || echo "⚠ Metrics server not available. Enable with: minikube addons enable metrics-server"

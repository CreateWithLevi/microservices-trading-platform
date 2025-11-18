# Kubernetes Deployment Guide

Complete Kubernetes deployment suite for the Microservices Trading Platform.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Deployment Options](#deployment-options)
  - [Minikube](#minikube)
  - [Kind (Kubernetes in Docker)](#kind-kubernetes-in-docker)
- [Building Docker Images](#building-docker-images)
- [Deploying to Kubernetes](#deploying-to-kubernetes)
- [Accessing Services](#accessing-services)
- [Scaling Services](#scaling-services)
- [Monitoring and Debugging](#monitoring-and-debugging)
- [Cleanup](#cleanup)
- [Production Considerations](#production-considerations)

## Overview

This directory contains production-ready Kubernetes manifests for deploying the entire trading platform:

**Infrastructure Components:**
- **RabbitMQ**: Message broker (StatefulSet)
- **Redis**: Cache and data store (StatefulSet)
- **TimescaleDB**: Time-series database (StatefulSet)
- **MongoDB**: Document database (StatefulSet)
- **ChromaDB**: Vector database (StatefulSet)

**Application Services:**
- **Service A**: Signal generator (Deployment)
- **Service B**: Trade execution engine (Deployment, horizontally scalable)
- **Service C**: Risk checker gRPC service (Deployment, horizontally scalable)
- **Service D, E, N**: Placeholder services (templates)
- **Frontend**: Web UI (template)
- **API Gateway**: Kong-based gateway (template)

**Networking:**
- Ingress controller for external access
- Internal ClusterIP services for inter-service communication

## Prerequisites

### Required Tools

1. **kubectl** (v1.25+)
   ```bash
   # macOS
   brew install kubectl

   # Linux
   curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
   chmod +x kubectl
   sudo mv kubectl /usr/local/bin/
   ```

2. **Docker** (v20.10+)
   - Install from: https://docs.docker.com/get-docker/

3. **Minikube** OR **Kind** (choose one)

   **Minikube:**
   ```bash
   # macOS
   brew install minikube

   # Linux
   curl -LO https://storage.googleapis.com/minikube/releases/latest/minikube-linux-amd64
   sudo install minikube-linux-amd64 /usr/local/bin/minikube
   ```

   **Kind:**
   ```bash
   # macOS
   brew install kind

   # Linux
   curl -Lo ./kind https://kind.sigs.k8s.io/dl/latest/kind-linux-amd64
   chmod +x ./kind
   sudo mv ./kind /usr/local/bin/kind
   ```

### System Requirements

- **RAM**: Minimum 8GB (16GB recommended)
- **CPU**: 4+ cores recommended
- **Disk**: 20GB free space

## Quick Start

```bash
# 1. Start local Kubernetes cluster
minikube start --cpus=4 --memory=8192 --driver=docker

# 2. Enable Ingress controller
minikube addons enable ingress

# 3. Build Docker images (use Minikube's Docker daemon)
eval $(minikube docker-env)
cd ..  # Return to project root
docker build -t service-a:latest -f Dockerfile.node ./service-a
docker build -t service-b:latest -f Dockerfile.node ./service-b
docker build -t service-c:latest -f service-c/Dockerfile ./service-c

# 4. Deploy all resources
cd k8s
kubectl apply -f namespace.yaml
kubectl apply -f config/
kubectl apply -f databases/
kubectl apply -f services/service-a.yaml
kubectl apply -f services/service-b.yaml
kubectl apply -f services/service-c.yaml
kubectl apply -f ingress.yaml

# 5. Wait for all pods to be ready
kubectl wait --for=condition=ready pod --all -n trading-system --timeout=300s

# 6. Access services
echo "$(minikube ip) trading.local" | sudo tee -a /etc/hosts
```

## Deployment Options

### Minikube

**Start Minikube:**
```bash
# Basic start
minikube start

# Recommended configuration
minikube start \
  --cpus=4 \
  --memory=8192 \
  --disk-size=40g \
  --driver=docker \
  --kubernetes-version=v1.28.0
```

**Enable Addons:**
```bash
# Required: Ingress controller
minikube addons enable ingress

# Optional: Metrics server for HPA
minikube addons enable metrics-server

# Optional: Dashboard
minikube addons enable dashboard
```

**Configure Docker Environment:**
```bash
# Point Docker CLI to Minikube's Docker daemon
eval $(minikube docker-env)

# Verify
docker ps  # Should show Minikube containers
```

**Useful Minikube Commands:**
```bash
minikube status           # Check cluster status
minikube dashboard        # Open Kubernetes dashboard
minikube service list -n trading-system  # List exposed services
minikube tunnel           # Create route to services (LoadBalancer)
minikube stop             # Stop cluster
minikube delete           # Delete cluster
```

### Kind (Kubernetes in Docker)

**Create Cluster with Ingress:**

Create `kind-config.yaml`:
```yaml
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
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
  - role: worker
  - role: worker
```

**Start Kind:**
```bash
# Create cluster
kind create cluster --config=kind-config.yaml --name=trading-platform

# Install NGINX Ingress Controller
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml

# Wait for ingress to be ready
kubectl wait --namespace ingress-nginx \
  --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller \
  --timeout=90s
```

**Load Images into Kind:**
```bash
# Build images first
cd ..
docker build -t service-a:latest -f Dockerfile.node ./service-a
docker build -t service-b:latest -f Dockerfile.node ./service-b
docker build -t service-c:latest -f service-c/Dockerfile ./service-c

# Load into Kind cluster
kind load docker-image service-a:latest --name=trading-platform
kind load docker-image service-b:latest --name=trading-platform
kind load docker-image service-c:latest --name=trading-platform
```

**Useful Kind Commands:**
```bash
kind get clusters                           # List clusters
kind get nodes --name=trading-platform      # List nodes
kind delete cluster --name=trading-platform # Delete cluster
```

## Building Docker Images

### For Minikube

```bash
# Configure Docker to use Minikube's daemon
eval $(minikube docker-env)

# Navigate to project root
cd /path/to/microservices-trading-platform

# Build Service A (TypeScript/Node.js)
docker build -t service-a:latest \
  --build-arg SERVICE_NAME=service-a \
  -f Dockerfile.node \
  ./service-a

# Build Service B (TypeScript/Node.js)
docker build -t service-b:latest \
  --build-arg SERVICE_NAME=service-b \
  -f Dockerfile.node \
  ./service-b

# Build Service C (Go/gRPC)
docker build -t service-c:latest \
  -f service-c/Dockerfile \
  ./service-c

# Verify images
docker images | grep service-
```

### For Kind

```bash
# Build images using local Docker
cd /path/to/microservices-trading-platform

docker build -t service-a:latest -f Dockerfile.node ./service-a
docker build -t service-b:latest -f Dockerfile.node ./service-b
docker build -t service-c:latest -f service-c/Dockerfile ./service-c

# Load images into Kind cluster
kind load docker-image service-a:latest --name=trading-platform
kind load docker-image service-b:latest --name=trading-platform
kind load docker-image service-c:latest --name=trading-platform
```

### Build Script

Create `build-images.sh`:
```bash
#!/bin/bash
set -e

echo "Building Docker images..."

# Navigate to project root
cd "$(dirname "$0")/.."

# Build images
docker build -t service-a:latest -f Dockerfile.node ./service-a
docker build -t service-b:latest -f Dockerfile.node ./service-b
docker build -t service-c:latest -f service-c/Dockerfile ./service-c

echo "✓ All images built successfully"
```

## Deploying to Kubernetes

### Step-by-Step Deployment

**1. Create Namespace:**
```bash
kubectl apply -f namespace.yaml
```

**2. Apply ConfigMaps and Secrets:**
```bash
kubectl apply -f config/configmap.yaml
kubectl apply -f config/secret.yaml
```

**3. Deploy Databases (StatefulSets):**
```bash
# Deploy all databases
kubectl apply -f databases/

# Or deploy individually
kubectl apply -f databases/rabbitmq.yaml
kubectl apply -f databases/redis.yaml
kubectl apply -f databases/timescaledb.yaml
kubectl apply -f databases/mongodb.yaml
kubectl apply -f databases/chromadb.yaml

# Wait for databases to be ready
kubectl wait --for=condition=ready pod -l app=rabbitmq -n trading-system --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis -n trading-system --timeout=300s
```

**4. Deploy Application Services:**
```bash
# Deploy core services (existing in codebase)
kubectl apply -f services/service-a.yaml
kubectl apply -f services/service-b.yaml
kubectl apply -f services/service-c.yaml

# Wait for services to be ready
kubectl wait --for=condition=ready pod -l app=service-a -n trading-system --timeout=180s
kubectl wait --for=condition=ready pod -l app=service-b -n trading-system --timeout=180s
kubectl wait --for=condition=ready pod -l app=service-c -n trading-system --timeout=180s
```

**5. Deploy Ingress:**
```bash
kubectl apply -f ingress.yaml
```

**6. Verify Deployment:**
```bash
# Check all pods
kubectl get pods -n trading-system

# Check services
kubectl get svc -n trading-system

# Check ingress
kubectl get ingress -n trading-system
```

### Automated Deployment Script

Create `deploy.sh`:
```bash
#!/bin/bash
set -e

echo "Deploying Trading Platform to Kubernetes..."

# Apply namespace
echo "Creating namespace..."
kubectl apply -f namespace.yaml

# Apply configuration
echo "Applying ConfigMaps and Secrets..."
kubectl apply -f config/

# Deploy databases
echo "Deploying databases..."
kubectl apply -f databases/

# Wait for databases
echo "Waiting for databases to be ready..."
kubectl wait --for=condition=ready pod -l app=rabbitmq -n trading-system --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis -n trading-system --timeout=300s

# Deploy services
echo "Deploying application services..."
kubectl apply -f services/service-a.yaml
kubectl apply -f services/service-b.yaml
kubectl apply -f services/service-c.yaml

# Wait for services
echo "Waiting for services to be ready..."
kubectl wait --for=condition=ready pod -l app=service-a -n trading-system --timeout=180s
kubectl wait --for=condition=ready pod -l app=service-b -n trading-system --timeout=180s
kubectl wait --for=condition=ready pod -l app=service-c -n trading-system --timeout=180s

# Deploy ingress
echo "Deploying Ingress..."
kubectl apply -f ingress.yaml

echo "✓ Deployment complete!"
echo ""
echo "Check status:"
echo "  kubectl get pods -n trading-system"
echo "  kubectl get svc -n trading-system"
```

## Accessing Services

### Add Hostname to /etc/hosts

**Minikube:**
```bash
echo "$(minikube ip) trading.local grpc.trading.local" | sudo tee -a /etc/hosts
```

**Kind:**
```bash
echo "127.0.0.1 trading.local grpc.trading.local" | sudo tee -a /etc/hosts
```

### Access Frontend

```bash
# Via browser
open http://trading.local

# Via curl
curl http://trading.local
```

### Access RabbitMQ Management UI

```bash
# Via Ingress
open http://trading.local/rabbitmq

# Or via port-forward
kubectl port-forward -n trading-system svc/rabbitmq 15672:15672
open http://localhost:15672
# Login: admin / changeme123 (from secret)
```

### Access Service C (gRPC)

```bash
# Via port-forward
kubectl port-forward -n trading-system svc/service-c 50051:50051

# Test with grpcurl (install first)
grpcurl -plaintext localhost:50051 list
```

### Port Forwarding

```bash
# Redis
kubectl port-forward -n trading-system svc/redis 6379:6379

# TimescaleDB
kubectl port-forward -n trading-system svc/timescaledb 5432:5432

# MongoDB
kubectl port-forward -n trading-system svc/mongodb 27017:27017

# ChromaDB
kubectl port-forward -n trading-system svc/chromadb 8000:8000
```

## Scaling Services

### Horizontal Scaling

**Scale Service B (Consumer):**
```bash
# Scale to 5 replicas
kubectl scale deployment service-b -n trading-system --replicas=5

# Verify
kubectl get pods -n trading-system -l app=service-b
```

**Scale Service C (Risk Checker):**
```bash
# Scale to 3 replicas
kubectl scale deployment service-c -n trading-system --replicas=3
```

**Horizontal Pod Autoscaler (HPA):**
```bash
# Requires metrics-server addon
minikube addons enable metrics-server

# Create HPA for Service B
kubectl autoscale deployment service-b -n trading-system \
  --cpu-percent=70 \
  --min=2 \
  --max=10

# Check HPA status
kubectl get hpa -n trading-system
```

### Vertical Scaling

Update resource requests/limits in deployment manifests:
```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

Apply changes:
```bash
kubectl apply -f services/service-b.yaml
```

## Monitoring and Debugging

### View Logs

```bash
# All pods in namespace
kubectl logs -n trading-system -l app=service-a --tail=100 -f

# Specific pod
kubectl logs -n trading-system <pod-name> -f

# Previous container logs (after crash)
kubectl logs -n trading-system <pod-name> --previous
```

### Describe Resources

```bash
# Pod details
kubectl describe pod -n trading-system <pod-name>

# Service details
kubectl describe svc -n trading-system service-c

# StatefulSet details
kubectl describe statefulset -n trading-system rabbitmq
```

### Execute Commands in Pods

```bash
# Redis CLI
kubectl exec -it -n trading-system redis-0 -- redis-cli

# RabbitMQ diagnostics
kubectl exec -it -n trading-system rabbitmq-0 -- rabbitmq-diagnostics status

# MongoDB shell
kubectl exec -it -n trading-system mongodb-0 -- mongosh

# Service A container shell
kubectl exec -it -n trading-system <service-a-pod> -- /bin/sh
```

### Resource Usage

```bash
# Pod resource usage
kubectl top pods -n trading-system

# Node resource usage
kubectl top nodes

# Detailed metrics
kubectl get --raw /apis/metrics.k8s.io/v1beta1/namespaces/trading-system/pods
```

### Events

```bash
# All events in namespace
kubectl get events -n trading-system --sort-by='.lastTimestamp'

# Watch events
kubectl get events -n trading-system --watch
```

### Dashboard (Minikube)

```bash
minikube dashboard
```

### Debugging Failed Pods

```bash
# Get pod status
kubectl get pods -n trading-system

# Describe pod for events
kubectl describe pod -n trading-system <pod-name>

# Check logs
kubectl logs -n trading-system <pod-name>

# Check previous logs if restarted
kubectl logs -n trading-system <pod-name> --previous

# Interactive shell
kubectl exec -it -n trading-system <pod-name> -- /bin/sh
```

## Cleanup

### Delete All Resources

```bash
# Delete namespace (removes all resources)
kubectl delete namespace trading-system

# Or delete individually
kubectl delete -f ingress.yaml
kubectl delete -f services/
kubectl delete -f databases/
kubectl delete -f config/
kubectl delete -f namespace.yaml
```

### Delete Cluster

**Minikube:**
```bash
minikube stop
minikube delete
```

**Kind:**
```bash
kind delete cluster --name=trading-platform
```

### Remove Hostname Entry

```bash
# Edit /etc/hosts and remove the line:
# 127.0.0.1 trading.local grpc.trading.local
sudo vi /etc/hosts
```

## Production Considerations

### Security

1. **Change Default Passwords:**
   - Update `config/secret.yaml` with strong passwords
   - Use Kubernetes Secrets encryption at rest
   - Consider using external secret management (Vault, AWS Secrets Manager)

2. **Network Policies:**
   ```bash
   # Create network policies to restrict pod communication
   kubectl apply -f network-policies/
   ```

3. **RBAC:**
   - Implement Role-Based Access Control
   - Create service accounts with minimal permissions

4. **Pod Security:**
   - Enable Pod Security Standards
   - Run containers as non-root users (already configured for service-c)

### High Availability

1. **Multi-Node Cluster:**
   - Use 3+ control plane nodes
   - Use 3+ worker nodes

2. **Database Replication:**
   - Configure RabbitMQ clustering (3 replicas)
   - Configure Redis Sentinel or Redis Cluster
   - Configure MongoDB replica sets
   - Use managed database services in cloud

3. **Application Redundancy:**
   - Run multiple replicas of stateless services
   - Use anti-affinity rules to spread pods across nodes

### Persistence

1. **StorageClass:**
   - Configure appropriate StorageClass for cloud provider
   - Use `storageClassName` in PVC templates

2. **Backup:**
   - Implement backup strategy for StatefulSets
   - Use Velero for cluster backups

### Monitoring and Observability

1. **Prometheus + Grafana:**
   - Install Prometheus Operator
   - Configure ServiceMonitors
   - Create Grafana dashboards

2. **Logging:**
   - Deploy EFK stack (Elasticsearch, Fluentd, Kibana)
   - Or use cloud-native solutions (CloudWatch, Stackdriver)

3. **Tracing:**
   - Implement distributed tracing (Jaeger, Zipkin)
   - Add OpenTelemetry instrumentation

### CI/CD Integration

1. **Image Registry:**
   - Push images to private registry (Docker Hub, ECR, GCR, ACR)
   - Update image pull secrets in manifests

2. **Automated Deployment:**
   - Use ArgoCD or Flux for GitOps
   - Integrate with CI/CD pipelines (GitHub Actions, GitLab CI)

3. **Rolling Updates:**
   - Configure deployment strategies
   - Implement health checks

### Resource Management

1. **Resource Quotas:**
   ```yaml
   apiVersion: v1
   kind: ResourceQuota
   metadata:
     name: trading-system-quota
     namespace: trading-system
   spec:
     hard:
       requests.cpu: "10"
       requests.memory: "20Gi"
       limits.cpu: "20"
       limits.memory: "40Gi"
   ```

2. **Limit Ranges:**
   - Set default requests/limits for containers

### Notes on Placeholder Services

**Services D, E, N, Frontend, and API Gateway** are template manifests for future implementation:

- **Service D, E, N**: Generic HTTP services (update when implemented)
- **Frontend**: Web UI (React, Angular, Vue, etc.)
- **API Gateway**: Kong or custom gateway (planned per CLAUDE.md)

**To deploy placeholder services:**
1. Build the actual service Docker images
2. Update the `image:` field in the YAML
3. Adjust ports, environment variables, and health checks
4. Apply the manifest: `kubectl apply -f services/<service>.yaml`

---

## Troubleshooting

### Pods Not Starting

```bash
# Check pod status
kubectl get pods -n trading-system

# Describe pod
kubectl describe pod -n trading-system <pod-name>

# Common issues:
# - ImagePullBackOff: Image not found (check image name, build images with Minikube Docker)
# - CrashLoopBackOff: Container crashing (check logs)
# - Pending: Insufficient resources (check node resources)
```

### Services Not Accessible

```bash
# Check service endpoints
kubectl get endpoints -n trading-system

# Check ingress
kubectl describe ingress -n trading-system trading-platform-ingress

# For Minikube, check ingress addon
minikube addons list | grep ingress
```

### Database Connection Issues

```bash
# Verify database pod is running
kubectl get pods -n trading-system -l app=rabbitmq

# Check logs
kubectl logs -n trading-system rabbitmq-0

# Verify service DNS
kubectl exec -it -n trading-system <app-pod> -- nslookup rabbitmq.trading-system.svc.cluster.local
```

---

**For more information, refer to:**
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Minikube Documentation](https://minikube.sigs.k8s.io/docs/)
- [Kind Documentation](https://kind.sigs.k8s.io/)
- [Project CLAUDE.md](../CLAUDE.md)

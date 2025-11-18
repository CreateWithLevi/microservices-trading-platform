#!/bin/bash

# Kong API Gateway E2E Verification Script
# This script tests that Kong is properly routing traffic to internal services

set -e  # Exit on error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
KONG_PROXY_URL="${KONG_PROXY_URL:-http://localhost:8000}"
KONG_ADMIN_URL="${KONG_ADMIN_URL:-http://localhost:8001}"
MAX_RETRIES=30
RETRY_DELAY=2

# Function to print colored output
print_info() {
    echo -e "${YELLOW}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to wait for Kong to be ready
wait_for_kong() {
    print_info "Waiting for Kong API Gateway to be ready..."
    local retries=0

    while [ $retries -lt $MAX_RETRIES ]; do
        if curl -sf "${KONG_ADMIN_URL}/status" > /dev/null 2>&1; then
            print_success "Kong is ready!"
            return 0
        fi

        retries=$((retries + 1))
        print_info "Kong not ready yet (attempt $retries/$MAX_RETRIES)..."
        sleep $RETRY_DELAY
    done

    print_error "Kong failed to start after $MAX_RETRIES attempts"
    return 1
}

# Function to test Kong health
test_kong_health() {
    print_info "Testing Kong health endpoint..."

    local response=$(curl -s -w "\n%{http_code}" "${KONG_ADMIN_URL}/status")
    local body=$(echo "$response" | head -n -1)
    local status_code=$(echo "$response" | tail -n 1)

    if [ "$status_code" -eq 200 ]; then
        print_success "Kong health check passed (HTTP $status_code)"
        echo "$body" | grep -q "database" && print_info "Response: $body"
        return 0
    else
        print_error "Kong health check failed (HTTP $status_code)"
        return 1
    fi
}

# Function to test Kong declarative config loaded
test_kong_config() {
    print_info "Verifying Kong declarative configuration..."

    # Check if services are loaded
    local services=$(curl -s "${KONG_ADMIN_URL}/services")

    if echo "$services" | grep -q "service-a"; then
        print_success "Service 'service-a' found in Kong configuration"
    else
        print_error "Service 'service-a' NOT found in Kong configuration"
        return 1
    fi

    if echo "$services" | grep -q "service-d"; then
        print_success "Service 'service-d' found in Kong configuration"
    else
        print_error "Service 'service-d' NOT found in Kong configuration"
        return 1
    fi

    # Check if routes are loaded
    local routes=$(curl -s "${KONG_ADMIN_URL}/routes")

    if echo "$routes" | grep -q "/api/signals"; then
        print_success "Route '/api/signals' found in Kong configuration"
    else
        print_error "Route '/api/signals' NOT found in Kong configuration"
        return 1
    fi

    if echo "$routes" | grep -q "/api/ai/analyze"; then
        print_success "Route '/api/ai/analyze' found in Kong configuration"
    else
        print_error "Route '/api/ai/analyze' NOT found in Kong configuration"
        return 1
    fi
}

# Function to test CORS plugin
test_cors_plugin() {
    print_info "Testing CORS plugin configuration..."

    local plugins=$(curl -s "${KONG_ADMIN_URL}/plugins")

    if echo "$plugins" | grep -q '"name":"cors"'; then
        print_success "CORS plugin is enabled"
        return 0
    else
        print_error "CORS plugin NOT found"
        return 1
    fi
}

# Function to test CORS headers in response
test_cors_headers() {
    print_info "Testing CORS headers in OPTIONS preflight request..."

    local response=$(curl -s -I -X OPTIONS \
        -H "Origin: http://localhost:3000" \
        -H "Access-Control-Request-Method: GET" \
        "${KONG_PROXY_URL}/api/signals")

    if echo "$response" | grep -qi "Access-Control-Allow-Origin"; then
        print_success "CORS headers present in response"
        echo "$response" | grep -i "Access-Control"
        return 0
    else
        print_error "CORS headers NOT found in response"
        return 1
    fi
}

# Function to test GET /api/signals route
test_signals_route() {
    print_info "Testing GET /api/signals route..."

    # Note: This will fail if service-a doesn't have an HTTP endpoint yet
    # We're mainly testing that Kong routes the request correctly
    local response=$(curl -s -w "\n%{http_code}" "${KONG_PROXY_URL}/api/signals")
    local status_code=$(echo "$response" | tail -n 1)

    # We expect either:
    # - 200 OK if service-a has HTTP endpoint
    # - 502 Bad Gateway if service-a doesn't have HTTP endpoint (expected for now)
    # - 503 Service Unavailable if service-a is not running

    if [ "$status_code" -eq 200 ]; then
        print_success "GET /api/signals route works (HTTP $status_code)"
        return 0
    elif [ "$status_code" -eq 502 ]; then
        print_info "GET /api/signals returned 502 (service-a may not have HTTP endpoint yet)"
        print_success "Kong routing is configured correctly"
        return 0
    else
        print_error "GET /api/signals route test failed (HTTP $status_code)"
        return 1
    fi
}

# Function to test POST /api/ai/analyze route
test_ai_analyze_route() {
    print_info "Testing POST /api/ai/analyze route..."

    # Note: This will fail if service-d doesn't exist yet
    # We're mainly testing that Kong routes the request correctly
    local response=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -d '{"signal": "test", "volume": 50}' \
        "${KONG_PROXY_URL}/api/ai/analyze")
    local status_code=$(echo "$response" | tail -n 1)

    # We expect either:
    # - 200 OK if service-d exists and responds
    # - 502 Bad Gateway if service-d doesn't exist (expected for now)
    # - 503 Service Unavailable if service-d is not running

    if [ "$status_code" -eq 200 ]; then
        print_success "POST /api/ai/analyze route works (HTTP $status_code)"
        return 0
    elif [ "$status_code" -eq 502 ] || [ "$status_code" -eq 503 ]; then
        print_info "POST /api/ai/analyze returned $status_code (service-d may not exist yet)"
        print_success "Kong routing is configured correctly"
        return 0
    else
        print_error "POST /api/ai/analyze route test failed (HTTP $status_code)"
        return 1
    fi
}

# Function to display Kong routes summary
display_routes_summary() {
    print_info "Kong Routes Summary:"
    echo ""
    echo "  Gateway Endpoint: $KONG_PROXY_URL"
    echo "  Admin API:        $KONG_ADMIN_URL"
    echo ""
    echo "  Configured Routes:"
    echo "    GET  /api/signals      -> service-a:3001"
    echo "    POST /api/ai/analyze   -> service-d:8001"
    echo ""
    echo "  CORS Enabled for:"
    echo "    - http://localhost:3000"
    echo "    - http://127.0.0.1:3000"
    echo ""
}

# Main execution
main() {
    echo ""
    echo "========================================="
    echo "  Kong API Gateway E2E Verification"
    echo "========================================="
    echo ""

    # Wait for Kong to be ready
    if ! wait_for_kong; then
        print_error "Kong is not running. Please start with: docker compose up -d kong"
        exit 1
    fi

    echo ""
    echo "Running Gateway Tests..."
    echo "------------------------"

    # Run all tests
    local failed=0

    test_kong_health || failed=$((failed + 1))
    echo ""

    test_kong_config || failed=$((failed + 1))
    echo ""

    test_cors_plugin || failed=$((failed + 1))
    echo ""

    test_cors_headers || failed=$((failed + 1))
    echo ""

    test_signals_route || failed=$((failed + 1))
    echo ""

    test_ai_analyze_route || failed=$((failed + 1))
    echo ""

    # Display summary
    echo "========================================="
    display_routes_summary
    echo "========================================="
    echo ""

    # Final result
    if [ $failed -eq 0 ]; then
        print_success "All gateway tests passed! ✓"
        echo ""
        print_info "Next steps:"
        echo "  1. Add HTTP endpoints to service-a (port 3001)"
        echo "  2. Implement service-d Python service (port 8001)"
        echo "  3. Re-run this script to verify end-to-end routing"
        echo ""
        exit 0
    else
        print_error "$failed test(s) failed"
        echo ""
        print_info "Troubleshooting:"
        echo "  - Check Kong logs:    docker compose logs kong"
        echo "  - Check Kong config:  curl http://localhost:8001/services"
        echo "  - Verify services:    docker compose ps"
        echo ""
        exit 1
    fi
}

# Run main function
main

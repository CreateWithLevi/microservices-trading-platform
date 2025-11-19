package server

import (
	"fmt"
	"log"
	"net/http"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

const (
	defaultMetricsPort = "8080"
)

// StartMetricsServer starts an HTTP server to expose Prometheus metrics
// on the /metrics endpoint. This runs on a separate port from the gRPC server.
func StartMetricsServer(port string) error {
	if port == "" {
		port = defaultMetricsPort
	}

	mux := http.NewServeMux()

	// Health check endpoint
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{"status":"healthy","service":"service-c"}`)
	})

	// Prometheus metrics endpoint
	mux.Handle("/metrics", promhttp.Handler())

	addr := fmt.Sprintf(":%s", port)
	log.Printf("Metrics HTTP server listening on http://localhost:%s/metrics", port)

	// Start HTTP server (blocking call)
	return http.ListenAndServe(addr, mux)
}

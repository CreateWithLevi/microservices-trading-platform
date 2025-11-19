package main

import (
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/createwithlevi/trading-platform/service-c/internal/server"
	"github.com/createwithlevi/trading-platform/service-c/pkg/riskpb"
	"github.com/getsentry/sentry-go"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

const (
	defaultPort        = "50051"
	defaultMetricsPort = "8080"
)

func main() {
	// Initialize Sentry for error tracking
	sentryDSN := os.Getenv("SENTRY_DSN")
	if sentryDSN != "" {
		err := sentry.Init(sentry.ClientOptions{
			Dsn:              sentryDSN,
			Environment:      getEnvironment(),
			TracesSampleRate: 1.0,
		})
		if err != nil {
			log.Printf("Sentry initialization failed: %v", err)
		} else {
			log.Println("Sentry initialized successfully")
		}
		// Ensure Sentry events are flushed on exit
		defer sentry.Flush(2 * time.Second)
	} else {
		log.Println("SENTRY_DSN not provided, error tracking disabled")
	}

	// Get ports from environment variables or use defaults
	port := os.Getenv("GRPC_PORT")
	if port == "" {
		port = defaultPort
	}

	metricsPort := os.Getenv("METRICS_PORT")
	if metricsPort == "" {
		metricsPort = defaultMetricsPort
	}

	// Create TCP listener
	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", port))
	if err != nil {
		sentry.WithScope(func(scope *sentry.Scope) {
			scope.SetTag("service", "service-c")
			scope.SetTag("operation", "listener-setup")
			scope.SetContext("listener", map[string]interface{}{
				"port":     port,
				"protocol": "tcp",
			})
			sentry.CaptureException(err)
		})
		sentry.Flush(2 * time.Second)
		log.Fatalf("Failed to listen on port %s: %v", port, err)
	}

	// Create gRPC server with options
	grpcServer := grpc.NewServer(
		grpc.MaxRecvMsgSize(4*1024*1024), // 4MB max message size
		grpc.MaxSendMsgSize(4*1024*1024),
	)

	// Register our Risk Checker service
	riskServer := server.NewRiskServer()
	riskpb.RegisterRiskCheckerServer(grpcServer, riskServer)

	// Enable gRPC reflection for debugging with tools like grpcurl
	reflection.Register(grpcServer)

	// Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Start HTTP metrics server in goroutine
	go func() {
		log.Printf("Starting HTTP metrics server on port %s...", metricsPort)
		if err := server.StartMetricsServer(metricsPort); err != nil {
			log.Fatalf("Failed to start metrics server: %v", err)
		}
	}()

	// Start gRPC server in goroutine
	go func() {
		log.Printf("========================================")
		log.Printf("Risk Checker gRPC Server (Service C)")
		log.Printf("========================================")
		log.Printf("Started at: %s", server.GetServerStartTime())
		log.Printf("gRPC Port: %s", port)
		log.Printf("Metrics Port: %s", metricsPort)
		log.Printf("Protocol: gRPC")
		log.Printf("Reflection: Enabled")
		log.Printf("========================================")
		log.Printf("Ready to process risk check requests...")
		log.Printf("")

		if err := grpcServer.Serve(lis); err != nil {
			sentry.WithScope(func(scope *sentry.Scope) {
				scope.SetTag("service", "service-c")
				scope.SetTag("operation", "grpc-server")
				scope.SetContext("server", map[string]interface{}{
					"port":     port,
					"service":  "RiskChecker",
					"protocol": "gRPC",
				})
				sentry.CaptureException(err)
			})
			sentry.Flush(2 * time.Second)
			log.Fatalf("Failed to serve gRPC: %v", err)
		}
	}()

	// Wait for shutdown signal
	<-sigChan
	log.Println("\nReceived shutdown signal, gracefully stopping server...")
	grpcServer.GracefulStop()
	log.Println("Server stopped successfully")
}

// getEnvironment returns the current environment (defaults to production)
func getEnvironment() string {
	env := os.Getenv("ENVIRONMENT")
	if env == "" {
		return "production"
	}
	return env
}

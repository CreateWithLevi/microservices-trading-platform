package main

import (
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/createwithlevi/trading-platform/service-c/internal/server"
	"github.com/createwithlevi/trading-platform/service-c/pkg/riskpb"
	"google.golang.org/grpc"
	"google.golang.org/grpc/reflection"
)

const (
	defaultPort = "50051"
)

func main() {
	// Get port from environment variable or use default
	port := os.Getenv("GRPC_PORT")
	if port == "" {
		port = defaultPort
	}

	// Create TCP listener
	lis, err := net.Listen("tcp", fmt.Sprintf(":%s", port))
	if err != nil {
		log.Fatalf("Failed to listen on port %s: %v", port, err)
	}

	// Create gRPC server with options
	grpcServer := grpc.NewServer(
		grpc.MaxRecvMsgSize(4 * 1024 * 1024), // 4MB max message size
		grpc.MaxSendMsgSize(4 * 1024 * 1024),
	)

	// Register our Risk Checker service
	riskServer := server.NewRiskServer()
	riskpb.RegisterRiskCheckerServer(grpcServer, riskServer)

	// Enable gRPC reflection for debugging with tools like grpcurl
	reflection.Register(grpcServer)

	// Setup graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	// Start server in goroutine
	go func() {
		log.Printf("========================================")
		log.Printf("Risk Checker gRPC Server (Service C)")
		log.Printf("========================================")
		log.Printf("Started at: %s", server.GetServerStartTime())
		log.Printf("Listening on port: %s", port)
		log.Printf("Protocol: gRPC")
		log.Printf("Reflection: Enabled")
		log.Printf("========================================")
		log.Printf("Ready to process risk check requests...")
		log.Printf("")

		if err := grpcServer.Serve(lis); err != nil {
			log.Fatalf("Failed to serve gRPC: %v", err)
		}
	}()

	// Wait for shutdown signal
	<-sigChan
	log.Println("\nReceived shutdown signal, gracefully stopping server...")
	grpcServer.GracefulStop()
	log.Println("Server stopped successfully")
}

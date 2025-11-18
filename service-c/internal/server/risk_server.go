package server

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/createwithlevi/trading-platform/service-c/pkg/riskpb"
	"github.com/google/uuid"
)

// RiskServer implements the RiskChecker gRPC service
type RiskServer struct {
	riskpb.UnimplementedRiskCheckerServer
}

// NewRiskServer creates a new instance of the Risk Checker server
func NewRiskServer() *RiskServer {
	return &RiskServer{}
}

// CheckTradeRisk implements the gRPC method for risk checking
// Business Logic: If volume > 90, reject the trade; otherwise, allow it
func (s *RiskServer) CheckTradeRisk(ctx context.Context, req *riskpb.TradeRiskRequest) (*riskpb.TradeRiskResponse, error) {
	// Generate a unique check ID for this risk assessment
	checkID := uuid.New().String()

	// Log the incoming request
	log.Printf("[RiskCheck %s] Checking trade: Asset=%s, Action=%s, Volume=%.2f, Timestamp=%s",
		checkID, req.AssetId, req.Action, req.Volume, req.Timestamp)

	// Deterministic risk check: volume > 90 is considered high risk
	if req.Volume > 90 {
		reason := fmt.Sprintf("Trade rejected: volume %.2f exceeds maximum allowed threshold of 90", req.Volume)
		log.Printf("[RiskCheck %s] REJECTED: %s", checkID, reason)

		return &riskpb.TradeRiskResponse{
			Allowed: false,
			Reason:  reason,
			CheckId: checkID,
		}, nil
	}

	// Trade is within acceptable risk parameters
	reason := fmt.Sprintf("Trade approved: volume %.2f is within acceptable limits", req.Volume)
	log.Printf("[RiskCheck %s] APPROVED: %s", checkID, reason)

	return &riskpb.TradeRiskResponse{
		Allowed: true,
		Reason:  reason,
		CheckId: checkID,
	}, nil
}

// GetServerStartTime returns a formatted startup message
func GetServerStartTime() string {
	return time.Now().Format("2006-01-02 15:04:05")
}

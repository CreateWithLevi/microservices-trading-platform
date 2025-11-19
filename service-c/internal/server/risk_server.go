package server

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/createwithlevi/trading-platform/service-c/pkg/riskpb"
	"github.com/getsentry/sentry-go"
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

	// Create a Sentry transaction for this risk check
	transaction := sentry.StartTransaction(ctx, "risk.check")
	transaction.Description = fmt.Sprintf("Risk check for %s", req.AssetId)
	transaction.SetTag("asset", req.AssetId)
	transaction.SetTag("action", req.Action)
	defer transaction.Finish()

	// Log the incoming request
	log.Printf("[RiskCheck %s] Checking trade: Asset=%s, Action=%s, Volume=%.2f, Timestamp=%s",
		checkID, req.AssetId, req.Action, req.Volume, req.Timestamp)

	// Deterministic risk check: volume > 90 is considered high risk
	if req.Volume > 90 {
		reason := fmt.Sprintf("Trade rejected: volume %.2f exceeds maximum allowed threshold of 90", req.Volume)
		log.Printf("[RiskCheck %s] REJECTED: %s", checkID, reason)

		// Capture rejection event in Sentry
		hub := sentry.GetHubFromContext(ctx)
		if hub != nil {
			hub.WithScope(func(scope *sentry.Scope) {
				scope.SetTag("service", "service-c")
				scope.SetTag("operation", "risk-check")
				scope.SetTag("result", "rejected")
				scope.SetContext("trade", map[string]interface{}{
					"checkId":  checkID,
					"assetId":  req.AssetId,
					"action":   req.Action,
					"volume":   req.Volume,
					"reason":   reason,
				})
				hub.CaptureMessage(reason)
			})
		}

		return &riskpb.TradeRiskResponse{
			Allowed: false,
			Reason:  reason,
			CheckId: checkID,
		}, nil
	}

	// Trade is within acceptable risk parameters
	reason := fmt.Sprintf("Trade approved: volume %.2f is within acceptable limits", req.Volume)
	log.Printf("[RiskCheck %s] APPROVED: %s", checkID, reason)

	// Capture approval event in Sentry
	hub := sentry.GetHubFromContext(ctx)
	if hub != nil {
		hub.WithScope(func(scope *sentry.Scope) {
			scope.SetTag("service", "service-c")
			scope.SetTag("operation", "risk-check")
			scope.SetTag("result", "approved")
			scope.SetContext("trade", map[string]interface{}{
				"checkId": checkID,
				"assetId": req.AssetId,
				"action":  req.Action,
				"volume":  req.Volume,
			})
			hub.CaptureMessage(reason)
		})
	}

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

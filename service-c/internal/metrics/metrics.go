// Package metrics provides Prometheus instrumentation for Service C (Risk Checker)
package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	// RiskChecksTotal tracks the total number of risk checks performed
	// Labels: result (allowed, rejected, error), asset_id
	RiskChecksTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "risk_checks_total",
			Help: "Total number of risk checks performed by Service C",
		},
		[]string{"result", "asset_id"},
	)

	// RiskCheckDurationSeconds tracks the duration of risk check operations
	// Labels: result (allowed, rejected, error), asset_id
	// Buckets: 0.001s (1ms), 0.005s (5ms), 0.01s (10ms), 0.025s (25ms), 0.05s (50ms), 0.1s (100ms)
	RiskCheckDurationSeconds = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "risk_check_duration_seconds",
			Help:    "Time spent processing a risk check in seconds",
			Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5},
		},
		[]string{"result", "asset_id"},
	)

	// RiskCheckVolumeHistogram tracks the distribution of trade volumes checked
	// Buckets designed around the 90 threshold (10, 25, 50, 75, 90, 100, 150, 200)
	RiskCheckVolumeHistogram = promauto.NewHistogram(
		prometheus.HistogramOpts{
			Name:    "risk_check_volume_mwh",
			Help:    "Distribution of trade volumes checked (in MWh)",
			Buckets: []float64{10, 25, 50, 75, 90, 100, 150, 200, 300},
		},
	)
)

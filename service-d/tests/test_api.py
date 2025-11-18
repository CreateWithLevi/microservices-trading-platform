"""
Tests for Service D API endpoints
"""

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)


class TestHealthEndpoint:
    """Tests for /health endpoint"""

    def test_health_check_returns_200(self) -> None:
        """Health check should return 200 status"""
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_check_response_structure(self) -> None:
        """Health check should return correct response structure"""
        response = client.get("/health")
        data = response.json()

        assert "status" in data
        assert "service" in data
        assert "timestamp" in data
        assert data["status"] == "healthy"
        assert data["service"] == "service-d"

    def test_health_check_timestamp_format(self) -> None:
        """Health check timestamp should be in ISO format"""
        response = client.get("/health")
        data = response.json()

        # Check if timestamp is a valid ISO format string
        from datetime import datetime

        timestamp = data["timestamp"]
        datetime.fromisoformat(timestamp.replace("Z", "+00:00"))  # Should not raise


class TestRootEndpoint:
    """Tests for root endpoint"""

    def test_root_returns_200(self) -> None:
        """Root endpoint should return 200 status"""
        response = client.get("/")
        assert response.status_code == 200

    def test_root_response_structure(self) -> None:
        """Root endpoint should return service information"""
        response = client.get("/")
        data = response.json()

        assert "service" in data
        assert "description" in data
        assert "version" in data
        assert "endpoints" in data
        assert data["service"] == "service-d"


class TestAnalyzeMarketEndpoint:
    """Tests for /api/v1/analyze-market endpoint"""

    def test_analyze_market_with_valid_signal(self) -> None:
        """Should analyze market signal successfully"""
        payload = {"signal": "BUY BATTERY_GRID_01 volume 50 MWh"}
        response = client.post("/api/v1/analyze-market", json=payload)

        assert response.status_code == 200
        data = response.json()

        # Check response structure
        assert "signal" in data
        assert "analysis" in data
        assert "confidence" in data
        assert "recommendation" in data
        assert "timestamp" in data
        assert "metadata" in data

    def test_analyze_market_bullish_signal(self) -> None:
        """Should detect bullish signal"""
        payload = {"signal": "Bullish trend detected for BATTERY_GRID_01"}
        response = client.post("/api/v1/analyze-market", json=payload)

        assert response.status_code == 200
        data = response.json()

        assert data["signal"] == payload["signal"]
        assert data["recommendation"] == "CONSIDER_BUY"
        assert 0.0 <= data["confidence"] <= 1.0
        assert "bullish" in data["analysis"].lower()

    def test_analyze_market_bearish_signal(self) -> None:
        """Should detect bearish signal"""
        payload = {"signal": "SELL signal - bearish market conditions"}
        response = client.post("/api/v1/analyze-market", json=payload)

        assert response.status_code == 200
        data = response.json()

        assert data["recommendation"] == "CONSIDER_SELL"
        assert 0.0 <= data["confidence"] <= 1.0
        assert "bearish" in data["analysis"].lower()

    def test_analyze_market_neutral_signal(self) -> None:
        """Should detect neutral signal"""
        payload = {"signal": "Market conditions unclear"}
        response = client.post("/api/v1/analyze-market", json=payload)

        assert response.status_code == 200
        data = response.json()

        assert data["recommendation"] == "HOLD"
        assert 0.0 <= data["confidence"] <= 1.0

    def test_analyze_market_with_context(self) -> None:
        """Should accept and process context"""
        payload = {
            "signal": "BUY signal detected",
            "context": {
                "asset_type": "battery",
                "market_volatility": "high",
                "time_of_day": "peak",
            },
        }
        response = client.post("/api/v1/analyze-market", json=payload)

        assert response.status_code == 200
        data = response.json()

        # Check that context is reflected in metadata
        assert data["metadata"]["context_used"] is True
        assert "asset_type" in data["metadata"]
        assert data["metadata"]["asset_type"] == "battery"

    def test_analyze_market_missing_signal_field(self) -> None:
        """Should return 422 for missing signal field"""
        payload = {}
        response = client.post("/api/v1/analyze-market", json=payload)

        assert response.status_code == 422  # Unprocessable Entity

    def test_analyze_market_empty_signal(self) -> None:
        """Should return 422 for empty signal"""
        payload = {"signal": ""}
        response = client.post("/api/v1/analyze-market", json=payload)

        assert response.status_code == 422  # Validation error (min_length=1)

    def test_analyze_market_confidence_range(self) -> None:
        """Confidence should be between 0 and 1"""
        payload = {"signal": "Test signal"}
        response = client.post("/api/v1/analyze-market", json=payload)

        assert response.status_code == 200
        data = response.json()

        confidence = data["confidence"]
        assert isinstance(confidence, float)
        assert 0.0 <= confidence <= 1.0

    def test_analyze_market_metadata_structure(self) -> None:
        """Metadata should contain expected fields"""
        payload = {"signal": "BUY signal"}
        response = client.post("/api/v1/analyze-market", json=payload)

        assert response.status_code == 200
        data = response.json()

        metadata = data["metadata"]
        assert "agent_version" in metadata
        assert "processing_time_ms" in metadata
        assert "context_used" in metadata
        assert metadata["context_used"] is False  # No context provided


class TestAPIDocumentation:
    """Tests for OpenAPI documentation"""

    def test_openapi_schema_available(self) -> None:
        """OpenAPI schema should be accessible"""
        response = client.get("/openapi.json")
        assert response.status_code == 200

    def test_docs_ui_available(self) -> None:
        """Swagger UI should be accessible"""
        response = client.get("/docs")
        assert response.status_code == 200

    def test_redoc_ui_available(self) -> None:
        """ReDoc UI should be accessible"""
        response = client.get("/redoc")
        assert response.status_code == 200

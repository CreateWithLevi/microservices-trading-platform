"""
Tests for RAG ingestion and retrieval flow
Tests the complete flow without requiring actual ChromaDB or LLM calls.
"""

from unittest.mock import MagicMock, Mock, patch

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def mock_chroma_client():
    """Mock ChromaDB client"""
    client = MagicMock()
    client.is_connected.return_value = True

    # Mock collection
    collection = MagicMock()
    collection.count.return_value = 0
    collection.add = MagicMock()
    collection.query.return_value = {
        "documents": [
            [
                "Trading signals indicate strong bullish momentum",
                "Market conditions are favorable for long positions",
            ]
        ],
        "metadatas": [
            [
                {"chunk_index": 0, "chunk_size": 50},
                {"chunk_index": 1, "chunk_size": 48},
            ]
        ],
        "distances": [[0.15, 0.25]],
    }

    client.get_collection.return_value = collection
    client.collection_name = "trading_knowledge"

    return client


@pytest.fixture
def mock_embedding_service():
    """Mock embedding service"""
    service = MagicMock()
    service.is_loaded.return_value = True
    service.dimension = 384

    # Mock embeddings (384-dimensional vectors)
    service.generate_embeddings.return_value = [
        [0.1] * 384,  # Mock embedding for chunk 1
        [0.2] * 384,  # Mock embedding for chunk 2
    ]
    service.generate_embedding.return_value = [0.15] * 384

    return service


@pytest.fixture
def mock_rag_service(mock_chroma_client, mock_embedding_service):
    """Mock RAG service with mocked dependencies"""
    with (
        patch("src.main.chroma_client", mock_chroma_client),
        patch("src.main.embedding_service", mock_embedding_service),
    ):

        # Create mock RAG service
        from src.services.rag_service import RAGService

        rag = RAGService(
            chroma_client=mock_chroma_client,
            embedding_service=mock_embedding_service,
        )

        with patch("src.main.rag_service", rag):
            yield rag


@pytest.fixture
def client_with_mocks(mock_rag_service):
    """Test client with all mocks in place"""
    # Import app AFTER mocks are set up
    from src.main import app

    return TestClient(app)


class TestHealthEndpoint:
    """Tests for health endpoint with RAG dependencies"""

    def test_health_check_with_dependencies(self, client_with_mocks):
        """Health check should report ChromaDB and embedding status"""
        response = client_with_mocks.get("/health")

        assert response.status_code == 200
        data = response.json()

        assert data["status"] == "healthy"
        assert data["service"] == "service-d"
        assert data["chromadb_connected"] is True
        assert data["embedding_model_loaded"] is True
        assert "timestamp" in data


class TestIngestEndpoint:
    """Tests for /api/v1/ingest endpoint"""

    def test_ingest_valid_text(self, client_with_mocks, mock_rag_service):
        """Should ingest text and return statistics"""
        payload = {
            "text": (
                "The trading platform uses microservices architecture. "
                "Service A generates signals every 3 seconds. "
                "Service B processes trades with RabbitMQ."
            ),
            "metadata": {"source": "architecture_docs"},
        }

        # Mock the ingest_text method
        mock_rag_service.ingest_text = Mock(
            return_value={
                "status": "success",
                "chunks_ingested": 2,
                "embedding_dimension": 384,
            }
        )

        response = client_with_mocks.post("/api/v1/ingest", json=payload)

        assert response.status_code == 200
        data = response.json()

        assert data["status"] == "success"
        assert data["chunks_ingested"] == 2
        assert data["embedding_dimension"] == 384
        assert "Successfully ingested" in data["message"]

        # Verify ingest_text was called with correct args
        mock_rag_service.ingest_text.assert_called_once()
        call_args = mock_rag_service.ingest_text.call_args
        assert call_args[1]["text"] == payload["text"]
        assert call_args[1]["metadata"] == payload["metadata"]

    def test_ingest_text_too_short(self, client_with_mocks):
        """Should reject text that's too short"""
        payload = {"text": "Short"}  # Less than 10 characters

        response = client_with_mocks.post("/api/v1/ingest", json=payload)

        assert response.status_code == 422  # Validation error

    def test_ingest_missing_text(self, client_with_mocks):
        """Should reject request without text"""
        payload = {}

        response = client_with_mocks.post("/api/v1/ingest", json=payload)

        assert response.status_code == 422  # Validation error


class TestAskEndpoint:
    """Tests for /api/v1/ask endpoint"""

    def test_ask_valid_question(self, client_with_mocks, mock_rag_service):
        """Should answer question with context"""
        payload = {
            "question": "How does the trading platform work?",
            "top_k": 3,
        }

        # Mock the ask method
        mock_rag_service.ask = Mock(
            return_value={
                "answer": (
                    "Based on the available information: The trading platform "
                    "uses microservices architecture."
                ),
                "confidence": 0.85,
                "context": [
                    {
                        "document": "Trading signals indicate strong momentum",
                        "metadata": {"chunk_index": 0},
                        "distance": 0.15,
                        "rank": 1,
                    },
                    {
                        "document": "Market conditions are favorable",
                        "metadata": {"chunk_index": 1},
                        "distance": 0.25,
                        "rank": 2,
                    },
                ],
                "source": "rag",
            }
        )

        response = client_with_mocks.post("/api/v1/ask", json=payload)

        assert response.status_code == 200
        data = response.json()

        assert "answer" in data
        assert data["confidence"] == 0.85
        assert len(data["context"]) == 2
        assert data["source"] == "rag"
        assert "timestamp" in data

        # Verify context structure
        assert data["context"][0]["document"] == "Trading signals indicate strong momentum"
        assert data["context"][0]["rank"] == 1
        assert data["context"][0]["distance"] == 0.15

    def test_ask_with_default_top_k(self, client_with_mocks, mock_rag_service):
        """Should use default top_k if not specified"""
        payload = {"question": "What is a trading signal?"}

        mock_rag_service.ask = Mock(
            return_value={
                "answer": "Mock answer",
                "confidence": 0.7,
                "context": [],
                "source": "rag",
            }
        )

        response = client_with_mocks.post("/api/v1/ask", json=payload)

        assert response.status_code == 200

        # Verify ask was called with default top_k=3
        call_args = mock_rag_service.ask.call_args
        assert call_args[1]["top_k"] == 3

    def test_ask_question_too_short(self, client_with_mocks):
        """Should reject question that's too short"""
        payload = {"question": "Hi?"}  # Less than 5 characters

        response = client_with_mocks.post("/api/v1/ask", json=payload)

        assert response.status_code == 422  # Validation error

    def test_ask_invalid_top_k(self, client_with_mocks):
        """Should reject invalid top_k values"""
        # top_k too low
        response = client_with_mocks.post(
            "/api/v1/ask",
            json={"question": "Valid question?", "top_k": 0},
        )
        assert response.status_code == 422

        # top_k too high
        response = client_with_mocks.post(
            "/api/v1/ask",
            json={"question": "Valid question?", "top_k": 20},
        )
        assert response.status_code == 422

    def test_ask_no_context_found(self, client_with_mocks, mock_rag_service):
        """Should handle case when no relevant context is found"""
        payload = {"question": "What is the weather like?"}

        mock_rag_service.ask = Mock(
            return_value={
                "answer": "I don't have enough information to answer this question.",
                "confidence": 0.0,
                "context": [],
                "source": "no_context",
            }
        )

        response = client_with_mocks.post("/api/v1/ask", json=payload)

        assert response.status_code == 200
        data = response.json()

        assert data["confidence"] == 0.0
        assert len(data["context"]) == 0
        assert data["source"] == "no_context"


class TestStatsEndpoint:
    """Tests for /api/v1/stats endpoint"""

    def test_get_stats(self, client_with_mocks, mock_rag_service):
        """Should return knowledge base statistics"""
        mock_rag_service.get_stats = Mock(
            return_value={
                "status": "connected",
                "collection_name": "trading_knowledge",
                "total_chunks": 42,
                "embedding_dimension": 384,
            }
        )

        response = client_with_mocks.get("/api/v1/stats")

        assert response.status_code == 200
        data = response.json()

        assert data["status"] == "connected"
        assert data["collection_name"] == "trading_knowledge"
        assert data["total_chunks"] == 42
        assert data["embedding_dimension"] == 384


class TestRootEndpoint:
    """Tests for root endpoint"""

    def test_root_returns_service_info(self, client_with_mocks):
        """Root should return service information"""
        response = client_with_mocks.get("/")

        assert response.status_code == 200
        data = response.json()

        assert data["service"] == "service-d"
        assert data["version"] == "2.0.0"
        assert "endpoints" in data
        assert data["endpoints"]["ingest"] == "/api/v1/ingest"
        assert data["endpoints"]["ask"] == "/api/v1/ask"
        assert "features" in data

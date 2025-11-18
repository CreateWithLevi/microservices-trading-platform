"""
Pytest configuration and fixtures for Service D tests
"""

import pytest


@pytest.fixture
def sample_trading_document() -> str:
    """Fixture providing sample trading platform documentation"""
    return """
    The microservices trading platform consists of multiple services:

    Service A generates trading signals every 3 seconds and publishes them to RabbitMQ.
    Service B consumes signals from RabbitMQ and executes trades.
    Service C provides risk validation via gRPC.
    Service D is the AI agent service that analyzes market data using RAG.

    The platform uses Redis for caching and ChromaDB for vector storage.
    All services communicate over a Docker network called trading_network.
    """


@pytest.fixture
def sample_market_question() -> str:
    """Fixture providing a sample market analysis question"""
    return "How does the trading platform handle signal generation?"


@pytest.fixture
def sample_metadata() -> dict:
    """Fixture providing sample metadata for documents"""
    return {
        "source": "platform_documentation",
        "version": "2.0",
        "category": "architecture",
    }

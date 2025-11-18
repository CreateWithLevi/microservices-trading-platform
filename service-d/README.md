# Service D - AI Agent Service

FastAPI-based microservice for AI-powered market signal analysis using LangChain agents and RAG (Retrieval-Augmented Generation).

## Overview

Service D provides intelligent market analysis capabilities for the trading platform by:
- Analyzing trading signals using LangChain-based AI agents
- Retrieving historical context via vector database (RAG pattern)
- Providing confidence scores and recommendations for trade decisions
- Integrating with LLM providers for natural language understanding

## Architecture

```
service-d/
├── src/              # Main application code
│   ├── main.py       # FastAPI application and endpoints
│   └── __init__.py
├── agents/           # LangChain agent modules (future)
│   └── __init__.py   # Placeholder for market analyzer agents
├── rag/              # RAG and vector database logic (future)
│   └── __init__.py   # Placeholder for vector store integration
├── tests/            # Test suite
│   ├── test_api.py   # API endpoint tests
│   └── conftest.py   # Pytest fixtures
├── Dockerfile        # Multi-stage production Docker build
├── pyproject.toml    # Poetry dependencies and configuration
└── README.md         # This file
```

## API Endpoints

### Health Check
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "service-d",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Analyze Market Signal
```http
POST /api/v1/analyze-market
```

**Request:**
```json
{
  "signal": "BUY BATTERY_GRID_01 volume 50 MWh",
  "context": {
    "asset_type": "battery",
    "market_volatility": "high"
  }
}
```

**Response:**
```json
{
  "signal": "BUY BATTERY_GRID_01 volume 50 MWh",
  "analysis": "Mock analysis: Signal indicates bullish sentiment...",
  "confidence": 0.75,
  "recommendation": "CONSIDER_BUY",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "metadata": {
    "agent_version": "mock-0.1.0",
    "processing_time_ms": 50,
    "context_used": true,
    "asset_type": "battery",
    "market_volatility": "high"
  }
}
```

**Recommendations:**
- `CONSIDER_BUY` - Bullish signal detected
- `CONSIDER_SELL` - Bearish signal detected
- `HOLD` - Neutral or unclear signal

## Development

### Prerequisites
- Python 3.11+
- Poetry 1.7+
- Docker (for containerized deployment)

### Local Setup

```bash
# Install dependencies
cd service-d
poetry install

# Run development server
poetry run uvicorn src.main:app --reload --port 8001

# Run tests
poetry run pytest

# Run tests with coverage
poetry run pytest --cov=src --cov-report=term-missing

# Lint code
poetry run ruff check .

# Format code
poetry run black .

# Type check
poetry run mypy src/
```

### Docker

```bash
# Build image
docker build -t service-d:latest .

# Run container
docker run -p 8001:8001 service-d:latest

# Run with docker-compose
docker compose up service-d
```

## Testing

The service includes comprehensive test coverage:

- **Unit tests**: Test individual functions and logic
- **API tests**: Test all endpoints with various scenarios
- **Integration tests**: Test interactions with external services (future)

```bash
# Run all tests
poetry run pytest

# Run specific test file
poetry run pytest tests/test_api.py

# Run with coverage report
poetry run pytest --cov=src --cov-report=html

# Run in watch mode
poetry run pytest-watch
```

## Code Quality

### Linting (Ruff)
```bash
poetry run ruff check .
poetry run ruff check --fix .  # Auto-fix issues
```

### Formatting (Black)
```bash
poetry run black .
poetry run black --check .  # Check without modifying
```

### Type Checking (MyPy)
```bash
poetry run mypy src/
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Service port | `8001` |
| `LOG_LEVEL` | Logging level | `INFO` |
| `OPENAI_API_KEY` | OpenAI API key (future) | - |
| `VECTOR_DB_URL` | Vector database URL (future) | - |

## Future Enhancements

### Planned Integrations

1. **LangChain Agents** (`agents/`)
   - `market_analyzer.py`: Main signal analysis agent
   - `risk_agent.py`: Risk assessment and validation
   - `sentiment_agent.py`: Market sentiment analysis
   - `portfolio_agent.py`: Portfolio optimization

2. **RAG System** (`rag/`)
   - Vector database integration (ChromaDB/Pinecone/FAISS)
   - Historical trading pattern embeddings
   - Context retrieval for agent decision-making
   - Document loaders for market data

3. **LLM Integration**
   - OpenAI GPT-4 for natural language understanding
   - Custom fine-tuned models for domain-specific analysis
   - Prompt engineering and chain optimization

4. **Advanced Features**
   - Real-time market data streaming
   - Multi-agent collaboration
   - Explainable AI recommendations
   - A/B testing framework for agent strategies

## API Documentation

When running locally, interactive API documentation is available at:
- **Swagger UI**: http://localhost:8001/docs
- **ReDoc**: http://localhost:8001/redoc
- **OpenAPI Schema**: http://localhost:8001/openapi.json

## Performance

- **Response time**: <100ms (mock analysis)
- **Throughput**: ~1000 requests/second (FastAPI async)
- **Resource usage**: ~50MB memory footprint

Future LLM integration will increase latency (2-5 seconds) depending on model and context size.

## Contributing

1. Create feature branch from `develop`
2. Make changes with tests
3. Run code quality checks: `poetry run ruff check && poetry run black . && poetry run mypy src/`
4. Run tests: `poetry run pytest`
5. Create PR to `develop` branch

## License

Part of the microservices-trading-platform project.

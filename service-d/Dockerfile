# Multi-stage Dockerfile for Service D (AI Agent Service)
# Stage 1: Builder - Install dependencies and prepare application
FROM python:3.11-slim as builder

# Set working directory
WORKDIR /app

# Install Poetry
RUN pip install --no-cache-dir poetry==1.7.1

# Copy dependency files
COPY pyproject.toml poetry.lock* ./

# Configure Poetry to not create virtual environments (we're in a container)
RUN poetry config virtualenvs.create false

# Install dependencies (including dev dependencies for potential build steps)
RUN poetry install --no-interaction --no-ansi --only main

# Copy application code
COPY src/ ./src/
COPY agents/ ./agents/
COPY rag/ ./rag/

# Stage 2: Production - Minimal runtime image
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Create non-root user for security
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app

# Copy installed dependencies from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code from builder
COPY --from=builder --chown=appuser:appuser /app/src ./src
COPY --from=builder --chown=appuser:appuser /app/agents ./agents
COPY --from=builder --chown=appuser:appuser /app/rag ./rag

# Switch to non-root user
USER appuser

# Expose port 8001
EXPOSE 8001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8001/health')" || exit 1

# Run the application with uvicorn
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]

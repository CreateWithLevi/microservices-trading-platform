"""
Service D - AI Agent Service with RAG
FastAPI application for intelligent market analysis using RAG and ChromaDB.
"""

import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from src.db.chroma_client import ChromaDBClient
from src.services.embedding_service import EmbeddingService
from src.services.rag_service import RAGService

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Global service instances
chroma_client: ChromaDBClient | None = None
embedding_service: EmbeddingService | None = None
rag_service: RAGService | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifespan context manager for FastAPI app.
    Handles startup and shutdown events.
    """
    global chroma_client, embedding_service, rag_service

    # Startup
    logger.info("Starting Service D - AI Agent Service")

    # Get ChromaDB configuration from environment
    chroma_host = os.getenv("CHROMADB_HOST", "chromadb")
    chroma_port = int(os.getenv("CHROMADB_PORT", "8000"))

    # Initialize ChromaDB client
    chroma_client = ChromaDBClient(
        host=chroma_host,
        port=chroma_port,
        collection_name="trading_knowledge",
    )

    # Connect to ChromaDB with retry logic
    try:
        chroma_client.connect()
    except Exception as e:
        logger.error(f"Failed to connect to ChromaDB: {e}")
        raise RuntimeError("ChromaDB connection failed") from e

    # Initialize embedding service
    embedding_service = EmbeddingService(model_name="all-MiniLM-L6-v2")
    embedding_service.load_model()

    # Initialize RAG service
    rag_service = RAGService(
        chroma_client=chroma_client,
        embedding_service=embedding_service,
        chunk_size=500,
        chunk_overlap=50,
    )

    logger.info("Service D startup complete")

    yield

    # Shutdown
    logger.info("Shutting down Service D")
    if chroma_client:
        chroma_client.disconnect()


# Initialize FastAPI app with lifespan
app = FastAPI(
    title="Service D - AI Agent Service",
    description="RAG-powered AI service for trading platform analysis",
    version="2.0.0",
    lifespan=lifespan,
)


# Pydantic Models
class HealthResponse(BaseModel):
    """Health check response"""

    status: str
    service: str
    timestamp: str
    chromadb_connected: bool
    embedding_model_loaded: bool


class IngestRequest(BaseModel):
    """Request model for document ingestion"""

    text: str = Field(
        ...,
        description="Raw text to ingest into knowledge base",
        min_length=10,
    )
    metadata: dict[str, Any] | None = Field(
        default=None,
        description="Optional metadata to attach to ingested chunks",
    )


class IngestResponse(BaseModel):
    """Response model for ingestion"""

    status: str
    chunks_ingested: int
    embedding_dimension: int
    message: str


class AskRequest(BaseModel):
    """Request model for asking questions"""

    question: str = Field(
        ...,
        description="Question to answer using RAG",
        min_length=5,
    )
    top_k: int = Field(
        default=3,
        description="Number of context chunks to retrieve",
        ge=1,
        le=10,
    )


class ContextChunk(BaseModel):
    """Context chunk retrieved from knowledge base"""

    document: str
    metadata: dict[str, Any]
    distance: float | None
    rank: int


class AskResponse(BaseModel):
    """Response model for questions"""

    answer: str
    confidence: float
    context: list[ContextChunk]
    source: str
    timestamp: str


class StatsResponse(BaseModel):
    """Knowledge base statistics"""

    status: str
    collection_name: str | None = None
    total_chunks: int | None = None
    embedding_dimension: int | None = None


# API Endpoints
@app.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    """
    Health check endpoint.
    Reports service status and dependencies.
    """
    chromadb_connected = chroma_client.is_connected() if chroma_client else False
    embedding_loaded = embedding_service.is_loaded() if embedding_service else False

    status = "healthy" if chromadb_connected and embedding_loaded else "degraded"

    return HealthResponse(
        status=status,
        service="service-d",
        timestamp=datetime.utcnow().isoformat(),
        chromadb_connected=chromadb_connected,
        embedding_model_loaded=embedding_loaded,
    )


@app.post("/api/v1/ingest", response_model=IngestResponse)
async def ingest_document(request: IngestRequest) -> IngestResponse:
    """
    Ingest text into the knowledge base.

    The text will be:
    1. Split into semantic chunks
    2. Embedded using sentence transformers
    3. Stored in ChromaDB for retrieval

    Args:
        request: Ingestion request with text and optional metadata

    Returns:
        Ingestion result with statistics
    """
    if not rag_service:
        raise HTTPException(
            status_code=503,
            detail="RAG service not initialized",
        )

    try:
        logger.info(f"Ingesting document (length: {len(request.text)})")

        result = rag_service.ingest_text(
            text=request.text,
            metadata=request.metadata,
        )

        return IngestResponse(
            status=result["status"],
            chunks_ingested=result["chunks_ingested"],
            embedding_dimension=result.get("embedding_dimension", 0),
            message=f"Successfully ingested {result['chunks_ingested']} chunks",
        )

    except Exception as e:
        logger.error(f"Ingestion failed: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Ingestion failed: {str(e)}",
        ) from e


@app.post("/api/v1/ask", response_model=AskResponse)
async def ask_question(request: AskRequest) -> AskResponse:
    """
    Ask a question using RAG.

    The question will be:
    1. Embedded using the same model as documents
    2. Used to search ChromaDB for relevant context
    3. Synthesized into an answer (mock LLM for now)

    Args:
        request: Question request

    Returns:
        Answer with context and confidence
    """
    if not rag_service:
        raise HTTPException(
            status_code=503,
            detail="RAG service not initialized",
        )

    try:
        logger.info(f"Answering question: {request.question[:100]}")

        result = rag_service.ask(
            question=request.question,
            top_k=request.top_k,
        )

        # Convert context to Pydantic models
        context_chunks = [
            ContextChunk(
                document=ctx["document"],
                metadata=ctx["metadata"],
                distance=ctx.get("distance"),
                rank=ctx["rank"],
            )
            for ctx in result["context"]
        ]

        return AskResponse(
            answer=result["answer"],
            confidence=result["confidence"],
            context=context_chunks,
            source=result["source"],
            timestamp=datetime.utcnow().isoformat(),
        )

    except Exception as e:
        logger.error(f"Question answering failed: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to answer question: {str(e)}",
        ) from e


@app.get("/api/v1/stats", response_model=StatsResponse)
async def get_stats() -> StatsResponse:
    """
    Get knowledge base statistics.

    Returns:
        Statistics about the vector database
    """
    if not rag_service:
        raise HTTPException(
            status_code=503,
            detail="RAG service not initialized",
        )

    try:
        stats = rag_service.get_stats()

        return StatsResponse(
            status=stats["status"],
            collection_name=stats.get("collection_name"),
            total_chunks=stats.get("total_chunks"),
            embedding_dimension=stats.get("embedding_dimension"),
        )

    except Exception as e:
        logger.error(f"Failed to get stats: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get stats: {str(e)}",
        ) from e


@app.get("/")
async def root() -> dict[str, Any]:
    """Root endpoint with service information"""
    return {
        "service": "service-d",
        "description": "AI Agent Service with RAG capabilities",
        "version": "2.0.0",
        "endpoints": {
            "health": "/health",
            "ingest": "/api/v1/ingest",
            "ask": "/api/v1/ask",
            "stats": "/api/v1/stats",
        },
        "features": [
            "Document ingestion with chunking",
            "Semantic search with sentence transformers",
            "RAG-based question answering",
            "ChromaDB vector storage",
        ],
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8001)

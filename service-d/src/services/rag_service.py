"""
RAG (Retrieval-Augmented Generation) Service
Handles document ingestion, retrieval, and answer synthesis.
"""

import logging
import uuid
from typing import Any

from langchain.text_splitter import RecursiveCharacterTextSplitter

from src.db.chroma_client import ChromaDBClient
from src.services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)


class RAGService:
    """
    RAG service for ingesting documents and answering questions.

    Combines ChromaDB for vector storage and Sentence Transformers
    for embeddings to enable semantic search and retrieval.
    """

    def __init__(
        self,
        chroma_client: ChromaDBClient,
        embedding_service: EmbeddingService,
        chunk_size: int = 500,
        chunk_overlap: int = 50,
    ):
        """
        Initialize RAG service.

        Args:
            chroma_client: ChromaDB client instance
            embedding_service: Embedding service instance
            chunk_size: Size of text chunks for splitting
            chunk_overlap: Overlap between chunks
        """
        self.chroma_client = chroma_client
        self.embedding_service = embedding_service
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap

        # Initialize text splitter
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

        logger.info(
            f"RAGService initialized with chunk_size={chunk_size}, "
            f"chunk_overlap={chunk_overlap}"
        )

    def ingest_text(
        self,
        text: str,
        metadata: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        """
        Ingest text into the knowledge base.

        The text is:
        1. Split into chunks
        2. Embedded using sentence transformers
        3. Stored in ChromaDB with metadata

        Args:
            text: Raw text to ingest
            metadata: Optional metadata to attach to chunks

        Returns:
            Dict with ingestion statistics

        Raises:
            RuntimeError: If ChromaDB or embedding service not ready
        """
        if not self.chroma_client.is_connected():
            raise RuntimeError("ChromaDB client not connected")

        if not self.embedding_service.is_loaded():
            raise RuntimeError("Embedding service model not loaded")

        logger.info(f"Ingesting text (length: {len(text)} characters)")

        # Split text into chunks
        chunks = self.text_splitter.split_text(text)
        logger.info(f"Split text into {len(chunks)} chunks")

        if not chunks:
            logger.warning("No chunks generated from text")
            return {
                "status": "no_chunks",
                "chunks_ingested": 0,
                "message": "No chunks generated from input text",
            }

        # Generate embeddings for all chunks
        embeddings = self.embedding_service.generate_embeddings(chunks)

        # Generate unique IDs for each chunk
        chunk_ids = [str(uuid.uuid4()) for _ in chunks]

        # Prepare metadata for each chunk
        chunk_metadata = []
        for i, chunk in enumerate(chunks):
            chunk_meta = {
                "chunk_index": i,
                "chunk_size": len(chunk),
                "total_chunks": len(chunks),
                **(metadata or {}),
            }
            chunk_metadata.append(chunk_meta)

        # Store in ChromaDB
        collection = self.chroma_client.get_collection()
        collection.add(
            ids=chunk_ids,
            embeddings=embeddings,
            documents=chunks,
            metadatas=chunk_metadata,
        )

        logger.info(f"Successfully ingested {len(chunks)} chunks")

        return {
            "status": "success",
            "chunks_ingested": len(chunks),
            "chunk_ids": chunk_ids,
            "embedding_dimension": len(embeddings[0]) if embeddings else 0,
        }

    def retrieve_context(
        self,
        query: str,
        top_k: int = 3,
    ) -> list[dict[str, Any]]:
        """
        Retrieve relevant context for a query.

        Args:
            query: Question or query text
            top_k: Number of top results to retrieve

        Returns:
            List of retrieved documents with metadata and distances

        Raises:
            RuntimeError: If ChromaDB or embedding service not ready
        """
        if not self.chroma_client.is_connected():
            raise RuntimeError("ChromaDB client not connected")

        if not self.embedding_service.is_loaded():
            raise RuntimeError("Embedding service model not loaded")

        logger.info(f"Retrieving context for query: {query[:100]}...")

        # Generate embedding for query
        query_embedding = self.embedding_service.generate_embedding(query)

        # Search ChromaDB
        collection = self.chroma_client.get_collection()
        results = collection.query(
            query_embeddings=[query_embedding],
            n_results=top_k,
            include=["documents", "metadatas", "distances"],
        )

        # Format results
        retrieved_docs = []
        if results["documents"] and results["documents"][0]:
            for i, doc in enumerate(results["documents"][0]):
                retrieved_docs.append(
                    {
                        "document": doc,
                        "metadata": (results["metadatas"][0][i] if results["metadatas"] else {}),
                        "distance": (results["distances"][0][i] if results["distances"] else None),
                        "rank": i + 1,
                    }
                )

        logger.info(f"Retrieved {len(retrieved_docs)} documents")

        return retrieved_docs

    def ask(
        self,
        question: str,
        top_k: int = 3,
    ) -> dict[str, Any]:
        """
        Answer a question using RAG.

        Args:
            question: Question to answer
            top_k: Number of context documents to retrieve

        Returns:
            Dict with answer, context, and metadata

        Note:
            This is a mock implementation. In production, integrate
            with an LLM (OpenAI GPT-4, Claude, etc.) for synthesis.
        """
        logger.info(f"Answering question: {question[:100]}...")

        # Retrieve relevant context
        context_docs = self.retrieve_context(question, top_k=top_k)

        if not context_docs:
            logger.warning("No relevant context found")
            return {
                "answer": (
                    "I don't have enough information to answer "
                    "this question. Please ingest relevant documents first."
                ),
                "context": [],
                "confidence": 0.0,
                "source": "no_context",
            }

        # Mock answer synthesis (replace with LLM call in production)
        answer = self._synthesize_answer_mock(question, context_docs)

        return {
            "answer": answer,
            "context": context_docs,
            "confidence": self._calculate_confidence(context_docs),
            "source": "rag",
        }

    def _synthesize_answer_mock(
        self,
        question: str,
        context_docs: list[dict[str, Any]],
    ) -> str:
        """
        Mock answer synthesis.

        In production, replace with actual LLM call:
        - Use LangChain with OpenAI GPT-4
        - Use Claude API
        - Use local LLM (Llama, Mistral)

        Args:
            question: The question asked
            context_docs: Retrieved context documents

        Returns:
            Synthesized answer string
        """
        # Simple mock: return the most relevant chunk
        if context_docs:
            most_relevant = context_docs[0]["document"]
            return (
                f"Based on the available information: {most_relevant}\n\n"
                f"[MOCK ANSWER] This is a placeholder response. "
                f"In production, an LLM would synthesize a comprehensive "
                f"answer from the {len(context_docs)} retrieved context chunks."
            )

        return "No relevant information found."

    def _calculate_confidence(
        self,
        context_docs: list[dict[str, Any]],
    ) -> float:
        """
        Calculate confidence score based on retrieval distances.

        Lower distance = higher similarity = higher confidence

        Args:
            context_docs: Retrieved context documents

        Returns:
            Confidence score between 0 and 1
        """
        if not context_docs or "distance" not in context_docs[0]:
            return 0.0

        # Average distance of top results (lower is better)
        avg_distance = sum(doc.get("distance", 1.0) for doc in context_docs) / len(context_docs)

        # Convert to confidence (assuming cosine distance 0-2 range)
        # Distance 0 = perfect match = confidence 1.0
        # Distance 2 = opposite = confidence 0.0
        confidence = max(0.0, min(1.0, 1.0 - (avg_distance / 2.0)))

        return round(confidence, 3)

    def get_stats(self) -> dict[str, Any]:
        """
        Get statistics about the knowledge base.

        Returns:
            Dict with collection stats
        """
        if not self.chroma_client.is_connected():
            return {"status": "disconnected"}

        collection = self.chroma_client.get_collection()
        count = collection.count()

        return {
            "status": "connected",
            "collection_name": self.chroma_client.collection_name,
            "total_chunks": count,
            "embedding_dimension": (
                self.embedding_service.dimension if self.embedding_service.is_loaded() else None
            ),
        }

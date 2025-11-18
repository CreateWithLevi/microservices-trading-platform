"""
Embedding Service
Generates embeddings using Sentence Transformers for semantic search.
"""

import logging

from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)


class EmbeddingService:
    """
    Service for generating text embeddings using Sentence Transformers.

    Uses the 'all-MiniLM-L6-v2' model which provides a good balance
    between speed and quality for semantic search tasks.
    """

    def __init__(self, model_name: str = "all-MiniLM-L6-v2"):
        """
        Initialize the embedding service.

        Args:
            model_name: Name of the sentence-transformers model to use
        """
        self.model_name = model_name
        self._model: SentenceTransformer | None = None
        logger.info(f"Initializing EmbeddingService with model: {model_name}")

    def load_model(self) -> None:
        """
        Load the sentence transformer model.

        This should be called during application startup.
        The model will be cached after first load.
        """
        if self._model is None:
            logger.info(f"Loading sentence transformer model: {self.model_name}")
            self._model = SentenceTransformer(self.model_name)
            logger.info("Model loaded successfully")

    def generate_embeddings(self, texts: list[str]) -> list[list[float]]:
        """
        Generate embeddings for a list of texts.

        Args:
            texts: List of text strings to embed

        Returns:
            List of embedding vectors (each vector is a list of floats)

        Raises:
            RuntimeError: If model is not loaded
        """
        if self._model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")

        if not texts:
            return []

        logger.debug(f"Generating embeddings for {len(texts)} texts")

        # Generate embeddings
        embeddings = self._model.encode(
            texts,
            convert_to_numpy=True,
            show_progress_bar=False,
        )

        # Convert numpy arrays to lists for JSON serialization
        embeddings_list = [embedding.tolist() for embedding in embeddings]

        logger.debug(
            f"Generated {len(embeddings_list)} embeddings "
            f"with dimension {len(embeddings_list[0]) if embeddings_list else 0}"
        )

        return embeddings_list

    def generate_embedding(self, text: str) -> list[float]:
        """
        Generate embedding for a single text.

        Args:
            text: Text string to embed

        Returns:
            Embedding vector as a list of floats

        Raises:
            RuntimeError: If model is not loaded
        """
        embeddings = self.generate_embeddings([text])
        return embeddings[0] if embeddings else []

    @property
    def dimension(self) -> int:
        """
        Get the dimensionality of embeddings produced by this model.

        Returns:
            Embedding dimension (384 for all-MiniLM-L6-v2)
        """
        if self._model is None:
            raise RuntimeError("Model not loaded. Call load_model() first.")
        return self._model.get_sentence_embedding_dimension()

    def is_loaded(self) -> bool:
        """
        Check if the model is loaded.

        Returns:
            True if model is loaded, False otherwise
        """
        return self._model is not None

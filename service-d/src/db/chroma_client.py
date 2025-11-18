"""
ChromaDB Client Wrapper
Provides connection management with retry logic and error handling.
"""

import logging

import chromadb
from chromadb.config import Settings
from tenacity import retry, stop_after_attempt, wait_exponential

logger = logging.getLogger(__name__)


class ChromaDBClient:
    """
    ChromaDB client wrapper with connection retry logic.

    Manages the lifecycle of a ChromaDB connection and provides
    resilient connection establishment with exponential backoff.
    """

    def __init__(
        self,
        host: str = "chromadb",
        port: int = 8000,
        collection_name: str = "trading_knowledge",
    ):
        """
        Initialize ChromaDB client.

        Args:
            host: ChromaDB server hostname
            port: ChromaDB server port
            collection_name: Name of the collection to use
        """
        self.host = host
        self.port = port
        self.collection_name = collection_name
        self._client: chromadb.HttpClient | None = None
        self._collection: chromadb.Collection | None = None

    @retry(
        stop=stop_after_attempt(5),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    def connect(self) -> None:
        """
        Connect to ChromaDB with retry logic.

        Retries up to 5 times with exponential backoff (2s, 4s, 8s, 10s, 10s).

        Raises:
            Exception: If connection fails after all retries
        """
        try:
            logger.info(f"Connecting to ChromaDB at {self.host}:{self.port}")

            self._client = chromadb.HttpClient(
                host=self.host,
                port=self.port,
                settings=Settings(
                    anonymized_telemetry=False,
                    allow_reset=True,
                ),
            )

            # Test connection by checking heartbeat
            self._client.heartbeat()

            # Get or create collection
            self._collection = self._client.get_or_create_collection(
                name=self.collection_name,
                metadata={"description": "Trading platform knowledge base"},
            )

            logger.info(f"Successfully connected to ChromaDB. Collection: {self.collection_name}")

        except Exception as e:
            logger.error(f"Failed to connect to ChromaDB: {str(e)}")
            raise

    def get_collection(self) -> chromadb.Collection:
        """
        Get the ChromaDB collection.

        Returns:
            ChromaDB collection instance

        Raises:
            RuntimeError: If not connected to ChromaDB
        """
        if self._collection is None:
            raise RuntimeError("Not connected to ChromaDB. Call connect() first.")
        return self._collection

    def is_connected(self) -> bool:
        """
        Check if connected to ChromaDB.

        Returns:
            True if connected, False otherwise
        """
        if self._client is None:
            return False

        try:
            self._client.heartbeat()
            return True
        except Exception:
            return False

    def disconnect(self) -> None:
        """Disconnect from ChromaDB."""
        self._client = None
        self._collection = None
        logger.info("Disconnected from ChromaDB")

    def reset(self) -> None:
        """
        Reset the ChromaDB collection (delete all data).

        WARNING: This will delete all data in the collection!
        """
        if self._client is None:
            raise RuntimeError("Not connected to ChromaDB. Call connect() first.")

        logger.warning(f"Resetting collection: {self.collection_name}")
        self._client.delete_collection(name=self.collection_name)
        self._collection = self._client.get_or_create_collection(
            name=self.collection_name,
            metadata={"description": "Trading platform knowledge base"},
        )
        logger.info("Collection reset complete")

"""Embedding providers.

Default is a local, deterministic hashed bag-of-words embedder: no network, no
API key, reproducible in CI. It is genuinely weaker than a trained embedding
model, which is why retrieval is hybrid - BM25 carries the lexical signal and
the dense vector carries loose topical similarity. Set VOYAGE_API_KEY to swap in
a real embedding model without touching anything else.
"""

from __future__ import annotations

import hashlib
import math
import re
from typing import Protocol

TOKEN_RE = re.compile(r"[a-z0-9_]+")


def tokenize(text: str) -> list[str]:
    return TOKEN_RE.findall(text.lower())


class Embedder(Protocol):
    name: str
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class HashedBagOfWordsEmbedder:
    """Feature-hashing embedder with sublinear term frequency and L2 norm."""

    name = "local-hashed-bow"

    def __init__(self, dim: int = 512) -> None:
        self.dim = dim

    def _index(self, token: str) -> tuple[int, float]:
        digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
        value = int.from_bytes(digest, "big")
        # Signed hashing keeps unrelated collisions from always adding up.
        return value % self.dim, 1.0 if (value >> 63) & 1 else -1.0

    def embed(self, texts: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for text in texts:
            vec = [0.0] * self.dim
            counts: dict[str, int] = {}
            for token in tokenize(text):
                counts[token] = counts.get(token, 0) + 1
            for token, count in counts.items():
                idx, sign = self._index(token)
                vec[idx] += sign * (1.0 + math.log(count))
            norm = math.sqrt(sum(v * v for v in vec))
            vectors.append([v / norm for v in vec] if norm else vec)
        return vectors


class VoyageEmbedder:
    """Optional dense embeddings via Voyage AI."""

    def __init__(self, api_key: str, model: str = "voyage-3.5-lite") -> None:
        import voyageai  # imported lazily so the dependency stays optional

        self.name = f"voyage:{model}"
        self._client = voyageai.Client(api_key=api_key)
        self._model = model
        self.dim = 1024

    def embed(self, texts: list[str]) -> list[list[float]]:
        result = self._client.embed(texts, model=self._model, input_type="document")
        vectors = result.embeddings
        self.dim = len(vectors[0]) if vectors else self.dim
        return vectors


def build_embedder(api_key: str | None, model: str) -> Embedder:
    if api_key:
        try:
            return VoyageEmbedder(api_key, model)
        except Exception:  # noqa: BLE001 - fall back rather than break startup
            return HashedBagOfWordsEmbedder()
    return HashedBagOfWordsEmbedder()


def cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    return sum(x * y for x, y in zip(a, b, strict=True))

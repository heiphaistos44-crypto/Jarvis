from __future__ import annotations
from abc import ABC, abstractmethod
from typing import AsyncGenerator


class ProviderError(RuntimeError):
    """Échec d'un provider LLM (réseau, auth, quota) — déclenche le fallback local."""


class LLMProvider(ABC):
    """Contrat commun des cerveaux LLM de JARVIS.

    Le tool-calling passe par les balises <JARVIS_TOOL> dans le texte généré,
    identique pour tous les providers — la boucle agent reste inchangée quel que
    soit le cerveau actif.
    """

    name: str = "base"
    label: str = "Base"
    tier: str = "cloud"  # "local" | "cloud" — sélectionne la variante des skills

    @property
    @abstractmethod
    def is_available(self) -> bool: ...

    @property
    @abstractmethod
    def model(self) -> str: ...

    @abstractmethod
    def stream(
        self,
        system: str,
        messages: list[dict[str, str]],
        max_tokens: int = 512,
    ) -> AsyncGenerator[str, None]:
        """Génère la réponse token par token. Lève ProviderError en cas d'échec."""

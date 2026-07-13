from __future__ import annotations
from typing import Callable, TypeVar

F = TypeVar("F", bound=Callable)


def tool(fn: F) -> F:
    """Marque une fonction comme outil JARVIS — auto-découverte par le registry.

    Déposer un fichier dans server/tools/ avec des fonctions décorées @tool
    suffit à les rendre disponibles, sans toucher au registry.
    """
    fn._jarvis_tool = True  # type: ignore[attr-defined]
    return fn

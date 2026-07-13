from __future__ import annotations
import importlib
import pkgutil

import tools as _tools_pkg
from utils.logger import get_logger

logger = get_logger("registry")

_SKIP_MODULES = {"registry", "decorator"}


class ToolRegistry:
    """Auto-découvre les fonctions décorées @tool dans les modules de tools/.

    Ajouter un fichier tools/xxx_tools.py avec des fonctions @tool suffit —
    aucune liste manuelle à maintenir.
    """

    def __init__(self) -> None:
        self._tools: dict[str, object] = {}
        self._discover()

    def _discover(self) -> None:
        for info in pkgutil.iter_modules(_tools_pkg.__path__):
            if info.name in _SKIP_MODULES or info.name.startswith("_"):
                continue
            try:
                module = importlib.import_module(f"tools.{info.name}")
            except Exception as e:
                logger.error(f"Module tools.{info.name} inchargeable: {e}")
                continue
            for attr_name in dir(module):
                if attr_name.startswith("_"):
                    continue
                fn = getattr(module, attr_name)
                if callable(fn) and getattr(fn, "_jarvis_tool", False):
                    if fn.__name__ in self._tools and self._tools[fn.__name__] is not fn:
                        logger.warning(f"Outil en doublon ignoré: {fn.__name__} ({info.name})")
                        continue
                    self._tools[fn.__name__] = fn
        logger.info(f"{len(self._tools)} outils découverts")

    def execute(self, name: str, **kwargs) -> str:
        if name not in self._tools:
            return f"Outil inconnu: {name}. Disponibles: {', '.join(sorted(self._tools))}"
        try:
            result = self._tools[name](**kwargs)
            return str(result) if result is not None else "Fait."
        except TypeError as e:
            return f"Arguments invalides pour {name}: {e}"
        except Exception as e:
            logger.error(f"Erreur outil {name}: {e}")
            return f"Erreur lors de l'exécution de {name}: {e}"

    def list_tools(self) -> list[str]:
        return list(self._tools)

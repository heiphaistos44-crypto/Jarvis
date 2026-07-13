from __future__ import annotations
import json
from pathlib import Path
from typing import AsyncGenerator, Awaitable, Callable, TYPE_CHECKING

from core.providers.base import LLMProvider, ProviderError
from core.providers.local_llama import LocalLlamaProvider
from core.providers.anthropic_provider import AnthropicProvider
from core.providers.openai_compat import OpenAICompatProvider
from utils.logger import get_logger

if TYPE_CHECKING:
    from core.llm import LLMManager

logger = get_logger("providers")

# Presets d'APIs connues. "custom" accepte n'importe quel endpoint
# OpenAI-compatible — l'app prend donc en charge n'importe quelle API.
PRESETS: dict[str, dict] = {
    "anthropic":  {"kind": "anthropic", "label": "Anthropic (Claude)",
                   "base_url": "https://api.anthropic.com", "model": "claude-sonnet-4-6", "needs_key": True},
    "openai":     {"kind": "openai", "label": "OpenAI",
                   "base_url": "https://api.openai.com/v1", "model": "gpt-4o-mini", "needs_key": True},
    "gemini":     {"kind": "openai", "label": "Google Gemini",
                   "base_url": "https://generativelanguage.googleapis.com/v1beta/openai", "model": "gemini-2.5-flash", "needs_key": True},
    "ollama":     {"kind": "openai", "label": "Ollama (local)",
                   "base_url": "http://localhost:11434/v1", "model": "llama3.2", "needs_key": False},
    "groq":       {"kind": "openai", "label": "Groq",
                   "base_url": "https://api.groq.com/openai/v1", "model": "llama-3.3-70b-versatile", "needs_key": True},
    "deepseek":   {"kind": "openai", "label": "DeepSeek",
                   "base_url": "https://api.deepseek.com/v1", "model": "deepseek-chat", "needs_key": True},
    "xai":        {"kind": "openai", "label": "xAI (Grok)",
                   "base_url": "https://api.x.ai/v1", "model": "grok-3-mini", "needs_key": True},
    "openrouter": {"kind": "openai", "label": "OpenRouter (modèles :free)",
                   "base_url": "https://openrouter.ai/api/v1", "model": "meta-llama/llama-3.3-70b-instruct:free", "needs_key": True},
    "cerebras":   {"kind": "openai", "label": "Cerebras (gratuit, ultra-rapide)",
                   "base_url": "https://api.cerebras.ai/v1", "model": "llama-3.3-70b", "needs_key": True},
    "huggingface": {"kind": "openai", "label": "Hugging Face (gratuit)",
                    "base_url": "https://router.huggingface.co/v1", "model": "meta-llama/Llama-3.3-70B-Instruct", "needs_key": True},
    "mistral":    {"kind": "openai", "label": "Mistral API",
                   "base_url": "https://api.mistral.ai/v1", "model": "mistral-small-latest", "needs_key": True},
    "lmstudio":   {"kind": "openai", "label": "LM Studio (local)",
                   "base_url": "http://localhost:1234/v1", "model": "", "needs_key": False},
    "pollinations": {"kind": "openai", "label": "Pollinations (gratuit, sans clé)",
                     "base_url": "https://text.pollinations.ai/openai", "model": "openai", "needs_key": False},
    "custom":     {"kind": "openai", "label": "API personnalisée",
                   "base_url": "", "model": "", "needs_key": False},
}

# Ordre de préférence pour juger le conseil multi-IA (du plus capable au moins)
_JUDGE_ORDER = [
    "anthropic", "openai", "gemini", "groq", "cerebras", "deepseek", "xai",
    "mistral", "openrouter", "huggingface", "pollinations", "lmstudio",
    "ollama", "custom",
]

_CONFIG_FIELDS = {"api_key", "model", "base_url"}


def _mask(key: str) -> str:
    return ("••••" + key[-4:]) if len(key) > 4 else ("••••" if key else "")


class ProviderManager:
    """Sélection et configuration runtime du cerveau LLM.

    Config persistée dans data/providers.json (.gitignoré, clés côté serveur
    uniquement) : {"active": "local", "configs": {"<preset>": {api_key, model, base_url}}}
    """

    def __init__(self, local_manager: "LLMManager", data_dir: Path) -> None:
        self._local = LocalLlamaProvider(local_manager)
        self._config_path = data_dir / "providers.json"
        self._active_name = "local"
        self._configs: dict[str, dict] = {}
        self._load_config()

    # ── Persistance ─────────────────────────────────────────────────────────

    def _load_config(self) -> None:
        try:
            if self._config_path.exists():
                data = json.loads(self._config_path.read_text(encoding="utf-8"))
                self._active_name = str(data.get("active", "local"))
                configs = data.get("configs", {})
                if isinstance(configs, dict):
                    self._configs = {
                        name: {k: str(v) for k, v in cfg.items() if k in _CONFIG_FIELDS}
                        for name, cfg in configs.items()
                        if isinstance(cfg, dict) and name in PRESETS
                    }
        except Exception as e:
            logger.warning(f"providers.json illisible ({e}) — retour au provider local")
            self._active_name, self._configs = "local", {}
        if self._active_name != "local" and self._build(self._active_name) is None:
            logger.warning(f"Provider actif '{self._active_name}' non configuré — retour au local")
            self._active_name = "local"

    def _save_config(self) -> None:
        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        self._config_path.write_text(
            json.dumps({"active": self._active_name, "configs": self._configs},
                       ensure_ascii=False, indent=2),
            encoding="utf-8",
        )

    # ── Construction ────────────────────────────────────────────────────────

    def _build(self, name: str) -> LLMProvider | None:
        if name == "local":
            return self._local
        preset = PRESETS.get(name)
        if preset is None:
            return None
        cfg = self._configs.get(name, {})
        api_key = str(cfg.get("api_key", ""))
        model = str(cfg.get("model") or preset["model"])
        base_url = str(cfg.get("base_url") or preset["base_url"])
        if not base_url or not model or (preset["needs_key"] and not api_key):
            return None
        if preset["kind"] == "anthropic":
            return AnthropicProvider(api_key=api_key, model=model, base_url=base_url)
        return OpenAICompatProvider(
            name=name, label=preset["label"], base_url=base_url, api_key=api_key, model=model,
        )

    # ── API publique ────────────────────────────────────────────────────────

    @property
    def active(self) -> LLMProvider:
        provider = self._build(self._active_name)
        return provider if provider is not None else self._local

    @property
    def tier(self) -> str:
        return self.active.tier

    @property
    def is_available(self) -> bool:
        return self.active.is_available

    def configure(self, name: str, fields: dict) -> str:
        """Met à jour la config d'un provider. Retourne un message d'erreur ou ''."""
        if name == "local" or name not in PRESETS:
            return f"Provider inconnu ou non configurable: {name}"
        current = dict(self._configs.get(name, {}))
        for key in _CONFIG_FIELDS:
            if key in fields and fields[key] is not None:
                value = str(fields[key]).strip()
                if key == "base_url" and value and not value.startswith(("http://", "https://")):
                    return "base_url doit commencer par http:// ou https://"
                current[key] = value
        self._configs[name] = current
        self._save_config()
        return ""

    def set_active(self, name: str) -> str:
        """Active un provider. Retourne un message d'erreur ou ''."""
        if name != "local" and name not in PRESETS:
            return f"Provider inconnu: {name}"
        provider = self._build(name)
        if provider is None:
            return f"Provider '{name}' incomplet — clé API, modèle ou base_url manquant."
        self._active_name = name
        self._save_config()
        logger.info(f"Provider actif: {name} ({provider.model})")
        return ""

    def council_members(self) -> list[LLMProvider]:
        """Tous les cerveaux interrogeables : local + chaque provider configuré."""
        members: list[LLMProvider] = []
        if self._local.is_available:
            members.append(self._local)
        for name in PRESETS:
            provider = self._build(name)
            if provider is not None and provider.is_available:
                members.append(provider)
        return members

    def judge_provider(self) -> LLMProvider:
        """Le cerveau le plus capable disponible — arbitre du conseil."""
        for name in _JUDGE_ORDER:
            provider = self._build(name)
            if provider is not None and provider.is_available:
                return provider
        return self._local

    def status(self) -> dict:
        """État complet pour l'UI — les clés API sont masquées."""
        providers = []
        for name, preset in PRESETS.items():
            cfg = self._configs.get(name, {})
            providers.append({
                "name": name,
                "label": preset["label"],
                "kind": preset["kind"],
                "needs_key": preset["needs_key"],
                "base_url": cfg.get("base_url") or preset["base_url"],
                "model": cfg.get("model") or preset["model"],
                "api_key_masked": _mask(str(cfg.get("api_key", ""))),
                "configured": self._build(name) is not None,
            })
        active = self.active
        return {
            "active": self._active_name,
            "active_label": active.label,
            "active_model": active.model,
            "tier": active.tier,
            "local_available": self._local.is_available,
            "providers": providers,
        }

    async def stream(
        self,
        system: str,
        messages: list[dict[str, str]],
        max_tokens: int = 512,
        on_fallback: Callable[[str], Awaitable[None]] | None = None,
    ) -> AsyncGenerator[str, None]:
        """Stream depuis le provider actif, fallback local si échec avant le 1er token."""
        provider = self.active
        started = False
        try:
            async for token in provider.stream(system, messages, max_tokens=max_tokens):
                started = True
                yield token
            return
        except ProviderError as e:
            logger.error(f"Provider {provider.name} en échec: {e}")
            if started or provider.name == "local" or not self._local.is_available:
                yield f"\n[{provider.label} a échoué en cours de réponse. Vérifiez la configuration.]"
                return
            if on_fallback is not None:
                await on_fallback(provider.label)
        async for token in self._local.stream(system, messages, max_tokens=max_tokens):
            yield token


_instance: ProviderManager | None = None


def init_provider_manager(local_manager: "LLMManager", data_dir: Path) -> ProviderManager:
    global _instance
    _instance = ProviderManager(local_manager, data_dir)
    return _instance


def get_provider_manager() -> ProviderManager:
    if _instance is None:
        raise RuntimeError("ProviderManager non initialisé — appeler init_provider_manager()")
    return _instance

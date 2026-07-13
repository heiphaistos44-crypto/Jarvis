from __future__ import annotations
import json
from typing import AsyncGenerator

import httpx

from core.providers.base import LLMProvider, ProviderError
from utils.logger import get_logger

logger = get_logger("provider.anthropic")

_TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0)
_API_VERSION = "2023-06-01"


class AnthropicProvider(LLMProvider):
    """API Messages Anthropic native (SSE) — cerveau Claude."""

    name = "anthropic"
    label = "Anthropic (Claude)"
    tier = "cloud"

    def __init__(self, api_key: str, model: str, base_url: str = "https://api.anthropic.com") -> None:
        self._api_key = api_key
        self._model = model
        self._base_url = base_url.rstrip("/")

    @property
    def is_available(self) -> bool:
        return bool(self._api_key and self._model)

    @property
    def model(self) -> str:
        return self._model

    async def stream(
        self,
        system: str,
        messages: list[dict[str, str]],
        max_tokens: int = 1024,
    ) -> AsyncGenerator[str, None]:
        payload = {
            "model": self._model,
            "system": system,
            "messages": messages,
            "max_tokens": max_tokens,
            "stream": True,
        }
        headers = {
            "x-api-key": self._api_key,
            "anthropic-version": _API_VERSION,
            "Content-Type": "application/json",
        }

        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                async with client.stream(
                    "POST", f"{self._base_url}/v1/messages",
                    json=payload, headers=headers,
                ) as resp:
                    if resp.status_code != 200:
                        body = (await resp.aread()).decode(errors="replace")[:300]
                        raise ProviderError(f"{self.label} HTTP {resp.status_code}: {body}")
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        try:
                            event = json.loads(line[5:].strip())
                        except json.JSONDecodeError:
                            continue
                        if event.get("type") == "content_block_delta":
                            text = (event.get("delta") or {}).get("text")
                            if text:
                                yield text
                        elif event.get("type") == "error":
                            detail = (event.get("error") or {}).get("message", "erreur inconnue")
                            raise ProviderError(f"{self.label}: {detail}")
        except httpx.HTTPError as e:
            raise ProviderError(f"{self.label} injoignable: {e}") from e

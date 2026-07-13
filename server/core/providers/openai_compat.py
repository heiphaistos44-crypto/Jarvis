from __future__ import annotations
import json
from typing import AsyncGenerator

import httpx

from core.providers.base import LLMProvider, ProviderError
from utils.logger import get_logger

logger = get_logger("provider.openai_compat")

_TIMEOUT = httpx.Timeout(connect=10.0, read=120.0, write=30.0, pool=10.0)


class OpenAICompatProvider(LLMProvider):
    """Toute API exposant /chat/completions au format OpenAI.

    Couvre : OpenAI, Google Gemini (endpoint openai/), Ollama, Groq, DeepSeek,
    xAI, OpenRouter, Mistral API, LM Studio, vLLM et tout endpoint custom.
    """

    tier = "cloud"

    def __init__(self, name: str, label: str, base_url: str, api_key: str, model: str) -> None:
        self.name = name
        self.label = label
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._model = model

    @property
    def is_available(self) -> bool:
        return bool(self._base_url and self._model)

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
            "messages": [{"role": "system", "content": system}, *messages],
            "max_tokens": max_tokens,
            "stream": True,
        }
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        try:
            async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
                async with client.stream(
                    "POST", f"{self._base_url}/chat/completions",
                    json=payload, headers=headers,
                ) as resp:
                    if resp.status_code != 200:
                        body = (await resp.aread()).decode(errors="replace")[:300]
                        raise ProviderError(f"{self.label} HTTP {resp.status_code}: {body}")
                    async for line in resp.aiter_lines():
                        if not line.startswith("data:"):
                            continue
                        data = line[5:].strip()
                        if data == "[DONE]":
                            return
                        try:
                            chunk = json.loads(data)
                        except json.JSONDecodeError:
                            continue
                        choices = chunk.get("choices") or []
                        if not choices:
                            continue
                        content = (choices[0].get("delta") or {}).get("content")
                        if content:
                            yield content
        except httpx.HTTPError as e:
            raise ProviderError(f"{self.label} injoignable: {e}") from e

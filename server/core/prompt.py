from __future__ import annotations

from core.llm import SYSTEM_PROMPT
from core.skills import get_router
from utils.logger import get_logger

logger = get_logger("prompt")


def build_system_prompt(tier: str, user_text: str) -> str:
    """Compose le system prompt : base + disciplines Fable routées + mémoire + leçons.

    tier: "local" (variantes compactes) ou "cloud" (variantes complètes).
    """
    parts = [SYSTEM_PROMPT]

    skills_block = get_router().select(user_text, tier)
    if skills_block:
        parts.append(
            "\n\n## DISCIPLINES ACTIVES (à appliquer strictement)\n\n" + skills_block
        )

    try:
        from core.persistent_memory import get_memory
        memory = get_memory()
        ctx = memory.get_context_summary()
        if ctx:
            parts.append(ctx)
        lessons = memory.get_lessons_summary()
        if lessons:
            parts.append(lessons)
    except Exception as e:
        logger.warning(f"Mémoire indisponible pour le prompt: {e}")

    return "".join(parts)

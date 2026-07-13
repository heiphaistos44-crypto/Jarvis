from __future__ import annotations
import asyncio
from typing import Awaitable, Callable, TYPE_CHECKING

from utils.logger import get_logger

if TYPE_CHECKING:
    from core.providers import LLMProvider, ProviderManager

logger = get_logger("council")

_MEMBER_TIMEOUT_S = 45
_JUDGE_TIMEOUT_S = 60
_MEMBER_SYSTEM = (
    "Tu es un assistant expert. Réponds à la question en français, "
    "avec précision et concision."
)

StepCallback = Callable[[str, str], Awaitable[None]]  # (phase, detail)


async def _collect(provider: "LLMProvider", system: str, prompt: str,
                   max_tokens: int, timeout: float) -> str:
    text = ""
    async with asyncio.timeout(timeout):
        async for token in provider.stream(
            system, [{"role": "user", "content": prompt}], max_tokens=max_tokens,
        ):
            text += token
    return text.strip()


async def run_council(
    question: str,
    pm: "ProviderManager",
    on_step: StepCallback,
) -> tuple[str, list[str], str]:
    """Interroge tous les cerveaux disponibles en parallèle, puis le plus
    capable juge et synthétise la meilleure réponse.

    Retourne (réponse_finale, participants_ok, nom_du_juge).
    """
    members = pm.council_members()
    if not members:
        return "Aucun cerveau disponible pour le conseil, Monsieur.", [], ""

    await on_step("thinking", f"Conseil : {len(members)} IA consultées")

    async def _ask(member: "LLMProvider") -> tuple[str, str] | None:
        try:
            answer = await _collect(
                member, _MEMBER_SYSTEM, question,
                max_tokens=700, timeout=_MEMBER_TIMEOUT_S,
            )
            if answer:
                await on_step("tool", member.label)
                return member.label, answer
        except Exception as e:
            logger.warning(f"Conseil: {member.label} en échec ({e})")
        return None

    results = await asyncio.gather(*(_ask(m) for m in members))
    answers = [r for r in results if r is not None]

    if not answers:
        return "Aucune IA du conseil n'a pu répondre, Monsieur.", [], ""
    if len(answers) == 1:
        label, text = answers[0]
        return text, [label], label

    judge = pm.judge_provider()
    await on_step("verify", f"Arbitrage par {judge.label}")

    candidates = "\n\n".join(
        f"--- Réponse {i + 1} ({label}) ---\n{text[:2000]}"
        for i, (label, text) in enumerate(answers)
    )
    judge_prompt = (
        f"Question posée : {question}\n\n"
        f"{len(answers)} intelligences artificielles ont répondu :\n\n{candidates}\n\n"
        "Compare ces réponses (exactitude, complétude, clarté). Rédige LA "
        "meilleure réponse finale en français — reprends la meilleure, corrige "
        "ses erreurs et complète-la avec les bons éléments des autres si utile. "
        "Réponds directement à la question, sans mentionner les candidats ni "
        "le processus de comparaison."
    )
    try:
        best = await _collect(
            judge,
            "Tu es un arbitre expert qui synthétise la meilleure réponse possible.",
            judge_prompt, max_tokens=900, timeout=_JUDGE_TIMEOUT_S,
        )
    except Exception as e:
        logger.warning(f"Conseil: juge {judge.label} en échec ({e}) — meilleure réponse brute")
        best = ""

    if not best:
        # Juge indisponible → la réponse du membre le mieux classé
        best = answers[0][1]

    return best, [label for label, _ in answers], judge.label

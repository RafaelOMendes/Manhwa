"""
Pausa preventiva da automação quando o uso da janela de 5h da conta do Claude Code
chega a um limiar (USAGE_PAUSE_THRESHOLD, padrão 80%), com retomada automática
quando a janela reseta.

Complementa - não substitui - o retry reativo de claude_runner.py, que só entra em
ação quando o Claude Code JÁ devolveu "You've hit your session limit": a ideia aqui
é parar ANTES de estourar, pra não queimar a cota inteira de uma vez numa leva de
cards.

Como o uso é medido (e a limitação disso):
- Fonte principal (oficial): com `--output-format stream-json --verbose`, o Claude
  Code emite um evento `rate_limit_event` com a utilização da janela de 5h e o
  horário exato do reset. Formato real observado no CLI 2.1.302 (out/2026):
    {"type": "rate_limit_event", "rate_limit_info": {"status": "allowed",
     "resetsAt": 1793331000, "rateLimitType": "five_hour", ...,
     "unifiedWindows": {"five_hour": {"utilization": 0.28, "resetsAt": 1793331000},
                        "seven_day": {"utilization": 0.34, ...}}}}
  claude_runner.py pega o ÚLTIMO desses eventos de cada chamada e passa pra
  record_call(). LIMITAÇÃO: o número só chega quando a chamada termina - a medição
  é sempre "depois da última chamada", nunca em tempo real. Uma execução longa
  (ex: 45min com opus) pode começar em 79% e terminar bem acima do limiar, ou até
  bater em 100% (aí o retry reativo de claude_runner.py continua sendo a rede de
  segurança). O evento também não é um contrato documentado: se o formato mudar ou
  ele não vier (CLI antiga, login por API key em vez de assinatura), a pausa
  preventiva fica sem medição oficial - avisamos no log uma vez por processo.
- Fallback (estimativa, DESLIGADO por padrão): se USAGE_WINDOW_CAPACITY_USD estiver
  preenchido e não houver leitura oficial na janela, estima a utilização como custo
  acumulado na janela (soma do `total_cost_usd` de cada chamada) / capacidade. É
  grosseiro: `total_cost_usd` é preço de tabela da API, não o que a assinatura
  realmente desconta, e a Anthropic não publica a capacidade da janela em dólares -
  calibre pelo log (cada chamada loga a utilização oficial e o custo acumulado lado
  a lado). Sem o horário oficial de reset, a janela começa na primeira chamada
  registrada e dura USAGE_WINDOW_SECONDS (padrão 5h).

"Pausar" = não iniciar NENHUMA chamada nova ao Claude Code até o reset: o watcher
para de fazer poll e run_claude_code() espera antes de cada tentativa, conferindo de
novo a cada USAGE_PAUSE_CHECK_SECONDS (Ctrl+C funciona normalmente). Nada é
descartado - o card que estava no meio do fluxo continua de onde parou. O estado
(janela, uso, pausa) fica em automation/usage_state.json (state.load_usage/
save_usage) e sobrevive a reinício do processo.
"""

from __future__ import annotations

import os
import time
from datetime import datetime
from typing import Any

import state as state_mod
from logging_setup import get_logger
from telegram_notify import send_telegram_message

logger = get_logger(__name__)

DEFAULT_THRESHOLD = 0.8


def parse_threshold(raw: str | None) -> float:
    """USAGE_PAUSE_THRESHOLD aceita fração (0.8) ou porcentagem (80). Vazio ou
    inválido = 0.8."""
    text = (raw or "").strip().replace(",", ".")
    if not text:
        return DEFAULT_THRESHOLD
    try:
        value = float(text)
    except ValueError:
        value = 0
    if value <= 0:
        logger.warning(f"USAGE_PAUSE_THRESHOLD={raw!r} inválido, usando {DEFAULT_THRESHOLD:.0%}.")
        return DEFAULT_THRESHOLD
    return value / 100 if value > 1 else value


USAGE_PAUSE_THRESHOLD = parse_threshold(os.environ.get("USAGE_PAUSE_THRESHOLD"))
# Duração da janela - só usada quando o horário oficial de reset não vem.
USAGE_WINDOW_SECONDS = int(os.environ.get("USAGE_WINDOW_SECONDS") or 5 * 60 * 60)
# Vazio = estimativa por custo desligada (só a leitura oficial do rate_limit_event).
USAGE_WINDOW_CAPACITY_USD = float(os.environ.get("USAGE_WINDOW_CAPACITY_USD") or 0) or None
USAGE_PAUSE_CHECK_SECONDS = int(os.environ.get("USAGE_PAUSE_CHECK_SECONDS") or 60)
# Mesmo respiro que o retry reativo dá depois do horário de reset.
RESUME_MARGIN_SECONDS = 30
# De quanto em quanto tempo a espera loga que ainda está pausada (no console).
PROGRESS_LOG_SECONDS = 30 * 60

# Trocáveis nos testes (relógio/sono falsos).
_now = time.time
_sleep = time.sleep

_warned_no_source = False
# paused_until que ESTE processo já avisou no Telegram (ou que o retry reativo já
# avisou) - evita aviso duplicado, mas garante um aviso depois de um reinício.
_announced_pause: float | None = None

_EMPTY_WINDOW: dict[str, Any] = {
    "window_start": None,  # epoch - início da janela (oficial = reset - 5h; senão 1ª chamada)
    "resets_at": None,  # epoch - reset da janela (oficial do evento, ou window_start + 5h)
    "utilization": None,  # 0-1, última leitura
    "source": None,  # "rate_limit_event" | "estimativa"
    "window_cost_usd": 0.0,  # soma de total_cost_usd na janela (base da estimativa)
    "window_calls": 0,
}


def extract_five_hour_window(rate_limit_info: dict | None) -> tuple[float | None, float | None]:
    """(utilização 0-1, reset em epoch) da janela de 5h a partir do `rate_limit_info`
    de um `rate_limit_event`, ou (None, None) se não der pra saber."""
    if not isinstance(rate_limit_info, dict):
        return None, None

    window = (rate_limit_info.get("unifiedWindows") or {}).get("five_hour")
    if isinstance(window, dict) and window.get("utilization") is not None:
        utilization, resets_at = window.get("utilization"), window.get("resetsAt")
    elif rate_limit_info.get("rateLimitType") in (None, "five_hour"):
        # Formato "achatado" (sem unifiedWindows), como o tipo SDKRateLimitInfo do
        # Agent SDK descreve.
        utilization, resets_at = rate_limit_info.get("utilization"), rate_limit_info.get("resetsAt")
        if utilization is None and rate_limit_info.get("status") == "rejected":
            utilization = 1.0
    else:
        return None, None  # evento de outra janela (ex: seven_day)

    try:
        utilization = float(utilization) if utilization is not None else None
        resets_at = float(resets_at) if resets_at else None
    except (TypeError, ValueError):
        return None, None
    if utilization is not None and utilization > 1.5:
        # Hoje vem como fração (0.28 = 28%). Se um dia vier em porcentagem, não deixa
        # "28" virar 2800% e pausar toda janela.
        utilization /= 100
    return utilization, resets_at


def apply_call(
    usage: dict | None,
    *,
    started_at: float,
    now: float,
    rate_limit_info: dict | None,
    cost_usd: float | None,
    window_seconds: int,
    capacity_usd: float | None,
) -> dict[str, Any]:
    """Sem I/O (testável): devolve o estado novo da janela depois de uma chamada."""
    usage = dict(usage or {})
    utilization, official_reset = extract_five_hour_window(rate_limit_info)
    if official_reset is not None:
        # Sanidade: uma janela de 5h nunca reseta mais de 5h no futuro (protege contra
        # mudança de unidade, ex: milissegundos, que pausaria "pra sempre").
        official_reset = min(official_reset, now + window_seconds)

    prev_reset = usage.get("resets_at")
    if prev_reset is None or now >= prev_reset or (official_reset is not None and official_reset > prev_reset + 60):
        # Janela nova: a anterior expirou (ou o próprio Claude Code diz que o reset mudou).
        usage.update(_EMPTY_WINDOW)
        start = started_at
        if prev_reset is not None and started_at < prev_reset <= now:
            start = prev_reset  # a chamada atravessou o reset: a janela nova começou nele
        usage["window_start"] = start

    usage["window_calls"] = int(usage.get("window_calls") or 0) + 1
    usage["window_cost_usd"] = round(float(usage.get("window_cost_usd") or 0) + float(cost_usd or 0), 6)

    if official_reset is not None:
        usage["resets_at"] = official_reset
        usage["window_start"] = official_reset - window_seconds
    elif usage.get("resets_at") is None:
        usage["resets_at"] = usage["window_start"] + window_seconds

    if utilization is not None:
        usage["utilization"], usage["source"] = utilization, "rate_limit_event"
    elif capacity_usd and usage.get("source") != "rate_limit_event":
        usage["utilization"], usage["source"] = usage["window_cost_usd"] / capacity_usd, "estimativa"
    # sem nada novo: mantém a última leitura desta janela (se houver)

    usage["updated_at"] = now
    return usage


def should_pause(usage: dict, *, now: float, threshold: float) -> bool:
    utilization, resets_at = usage.get("utilization"), usage.get("resets_at")
    return utilization is not None and resets_at is not None and utilization >= threshold and now < resets_at


def _fmt_pct(value: float | None) -> str:
    return "?" if value is None else f"{value * 100:.0f}%"


def _fmt_time(ts: float | None) -> str:
    if not ts:
        return "?"
    dt = datetime.fromtimestamp(ts)
    return dt.strftime("%H:%M") if dt.date() == datetime.fromtimestamp(_now()).date() else dt.strftime("%d/%m %H:%M")


def describe_config() -> str:
    estimate = f"US$ {USAGE_WINDOW_CAPACITY_USD:.2f} por janela" if USAGE_WINDOW_CAPACITY_USD else "desligada"
    return (
        f"Pausa preventiva de uso: limiar {_fmt_pct(USAGE_PAUSE_THRESHOLD)} da janela de "
        f"{USAGE_WINDOW_SECONDS / 3600:g}h (fonte: rate_limit_event do Claude Code; "
        f"estimativa por custo: {estimate})."
    )


def record_call(
    rate_limit_info: dict | None,
    cost_usd: float | None,
    *,
    started_at: float,
    hit_usage_limit: bool = False,
) -> None:
    """Chamado por claude_runner.py depois de CADA chamada ao Claude Code: atualiza a
    janela e, se passou do limiar, registra a pausa (que vale a partir da PRÓXIMA
    chamada - a atual já terminou). Com hit_usage_limit=True (a chamada já bateu no
    limite) só registra, sem avisar: o retry reativo já avisa e espera o reset - o
    registro serve pra pausa sobreviver a um reinício do watcher nesse meio-tempo."""
    global _warned_no_source, _announced_pause
    try:
        now = _now()
        usage = apply_call(
            state_mod.load_usage(),
            started_at=started_at,
            now=now,
            rate_limit_info=rate_limit_info,
            cost_usd=cost_usd,
            window_seconds=USAGE_WINDOW_SECONDS,
            capacity_usd=USAGE_WINDOW_CAPACITY_USD,
        )
        pause = should_pause(usage, now=now, threshold=USAGE_PAUSE_THRESHOLD) and not (usage.get("paused_until") or 0) > now
        if pause:
            usage["paused_until"] = usage["resets_at"]
            usage["pause_notified"] = not hit_usage_limit
        state_mod.save_usage(usage)
    except Exception:
        logger.warning("Falha ao registrar o uso da janela de 5h - seguindo sem a pausa preventiva nesta chamada.", exc_info=True)
        return

    if usage.get("utilization") is None:
        if not _warned_no_source:
            logger.warning(
                "Claude Code não devolveu a utilização da janela de 5h (rate_limit_event) - pausa "
                "preventiva sem medição; só o retry reativo de limite de uso vale. Se for "
                "permanente (CLI antiga/login por API key), veja USAGE_WINDOW_CAPACITY_USD no SETUP.md."
            )
            _warned_no_source = True
    else:
        logger.info(
            f"Uso da janela de 5h do Claude Code: {_fmt_pct(usage['utilization'])} "
            f"({usage['source']}; limiar {_fmt_pct(USAGE_PAUSE_THRESHOLD)}; reset às "
            f"{_fmt_time(usage['resets_at'])}; custo na janela US$ {usage['window_cost_usd']:.2f} "
            f"em {usage['window_calls']} chamada(s))."
        )

    if not pause:
        return
    _announced_pause = usage["paused_until"]
    if hit_usage_limit:
        logger.info(f"Pausa registrada até {_fmt_time(usage['paused_until'])} (limite já estourado - o retry reativo cuida do aviso e da espera).")
        return
    msg = (
        f"⏸️ Uso da janela de 5h do Claude Code chegou a {_fmt_pct(usage['utilization'])} "
        f"(limiar: {_fmt_pct(USAGE_PAUSE_THRESHOLD)}). Pausando a automação - nenhuma chamada "
        f"nova ao Claude Code até o reset às {_fmt_time(usage['paused_until'])}. Nada é "
        f"descartado: retomo sozinho de onde parei."
    )
    logger.warning(msg)
    send_telegram_message(msg)


def wait_if_paused() -> None:
    """Se há pausa ativa, bloqueia até o reset da janela (+RESUME_MARGIN_SECONDS),
    em passos de USAGE_PAUSE_CHECK_SECONDS, relendo o estado a cada passo - Ctrl+C
    interrompe normalmente (KeyboardInterrupt sobe, a pausa continua salva). Sem
    pausa ativa, volta na hora. Chamado pelo loop do watcher (antes de cada poll) e
    por run_claude_code() (antes de cada tentativa)."""
    global _announced_pause
    try:
        usage = state_mod.load_usage()
        paused_until = usage.get("paused_until")
        if not paused_until:
            return

        utilization = usage.get("utilization")
        if utilization is not None and utilization < USAGE_PAUSE_THRESHOLD:
            # Limiar aumentado no .env depois da pausa (e watcher reiniciado).
            logger.info(
                f"Pausa cancelada: uso registrado {_fmt_pct(utilization)} está abaixo do limiar "
                f"atual ({_fmt_pct(USAGE_PAUSE_THRESHOLD)})."
            )
            _clear_pause()
            return

        if _now() < paused_until + RESUME_MARGIN_SECONDS:
            if _announced_pause != paused_until:
                # Pausa que este processo ainda não avisou: o watcher foi reiniciado
                # no meio dela.
                msg = (
                    f"⏸️ Automação pausada: uso da janela de 5h do Claude Code em "
                    f"{_fmt_pct(utilization)} (limiar: {_fmt_pct(USAGE_PAUSE_THRESHOLD)}). "
                    f"Aguardando o reset às {_fmt_time(paused_until)} pra retomar sozinha."
                )
                logger.warning(msg)
                send_telegram_message(msg)
                _announced_pause = paused_until
                usage["pause_notified"] = True
                state_mod.save_usage(usage)
            logger.info(
                f"Pausa preventiva de uso ativa - aguardando o reset às {_fmt_time(paused_until)} "
                f"(conferindo a cada {USAGE_PAUSE_CHECK_SECONDS}s; Ctrl+C pra sair)."
            )

        last_progress = _now()
        while _now() < paused_until + RESUME_MARGIN_SECONDS:
            _sleep(max(1, min(USAGE_PAUSE_CHECK_SECONDS, paused_until + RESUME_MARGIN_SECONDS - _now())))
            current = state_mod.load_usage()
            if not current.get("paused_until"):
                logger.info("Pausa removida de usage_state.json (arquivo apagado/editado?) - retomando antes do reset.")
                break
            paused_until = current["paused_until"]
            if _now() - last_progress >= PROGRESS_LOG_SECONDS:
                remaining_min = max(0, paused_until - _now()) / 60
                logger.info(f"...ainda pausado por uso, reset às {_fmt_time(paused_until)} (faltam ~{remaining_min:.0f}min).")
                last_progress = _now()

        notified = _clear_pause()
    except Exception:
        logger.warning("Falha ao conferir a pausa preventiva de uso - seguindo sem esperar.", exc_info=True)
        return

    logger.info("Janela de 5h do Claude Code resetou - retomando a automação.")
    if notified:
        send_telegram_message("▶️ Janela de 5h do Claude Code resetou - retomando a automação.")


def _clear_pause() -> bool:
    """Tira a pausa do estado salvo. Devolve se ela tinha sido avisada no Telegram
    (pra decidir se avisa a retomada também)."""
    global _announced_pause
    usage = state_mod.load_usage()
    notified = bool(usage.get("pause_notified"))
    if usage:
        usage.update(paused_until=None, pause_notified=False)
        state_mod.save_usage(usage)
    _announced_pause = None
    return notified

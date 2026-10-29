"""
Testes da pausa preventiva por uso (usage_guard.py) e da leitura do stream-json em
claude_runner.py. Sem rede, sem Claude Code, sem Trello: dados simulados (o evento
de rate limit é uma cópia do formato real capturado do CLI 2.1.302), relógio falso e
estado num diretório temporário.

Rode de dentro de automation/:
    venv\\Scripts\\python.exe -m unittest test_usage_guard -v
"""

from __future__ import annotations

import json
import logging
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import logging_setup

# Não cria arquivo em automation/logs/ (nem imprime) só por rodar os testes.
logging_setup._configured = True
logging.getLogger("automation").addHandler(logging.NullHandler())
logging.getLogger("automation").propagate = False

import claude_runner  # noqa: E402
import state as state_mod  # noqa: E402
import usage_guard  # noqa: E402

NOW = 1_800_000_000.0
FIVE_HOURS = 5 * 60 * 60

# Formato real (CLI 2.1.302, out/2026), só com os números trocados nos testes.
REAL_RATE_LIMIT_INFO = {
    "status": "allowed",
    "resetsAt": 1793331000,
    "rateLimitType": "five_hour",
    "overageStatus": "rejected",
    "overageDisabledReason": "org_level_disabled",
    "isUsingOverage": False,
    "unifiedWindows": {
        "five_hour": {"utilization": 0.28, "resetsAt": 1793331000},
        "seven_day": {"utilization": 0.34, "resetsAt": 1793635200},
    },
}


def rate_limit_info(utilization: float, resets_at: float) -> dict:
    return {
        **REAL_RATE_LIMIT_INFO,
        "resetsAt": int(resets_at),
        "unifiedWindows": {
            "five_hour": {"utilization": utilization, "resetsAt": int(resets_at)},
            "seven_day": {"utilization": 0.1, "resetsAt": int(resets_at) + 86400},
        },
    }


class ExtractFiveHourWindowTests(unittest.TestCase):
    def test_real_event(self):
        self.assertEqual(usage_guard.extract_five_hour_window(REAL_RATE_LIMIT_INFO), (0.28, 1793331000.0))

    def test_flat_format(self):
        info = {"status": "allowed", "rateLimitType": "five_hour", "utilization": 0.9, "resetsAt": 100}
        self.assertEqual(usage_guard.extract_five_hour_window(info), (0.9, 100.0))

    def test_rejected_without_utilization_counts_as_full(self):
        info = {"status": "rejected", "rateLimitType": "five_hour", "resetsAt": 100}
        self.assertEqual(usage_guard.extract_five_hour_window(info), (1.0, 100.0))

    def test_other_window_is_ignored(self):
        info = {"status": "rejected", "rateLimitType": "seven_day", "resetsAt": 100}
        self.assertEqual(usage_guard.extract_five_hour_window(info), (None, None))

    def test_percentage_is_normalized(self):
        utilization, _ = usage_guard.extract_five_hour_window(rate_limit_info(85, NOW))
        self.assertAlmostEqual(utilization, 0.85)

    def test_missing(self):
        self.assertEqual(usage_guard.extract_five_hour_window(None), (None, None))
        self.assertEqual(usage_guard.extract_five_hour_window({}), (None, None))


class ParseThresholdTests(unittest.TestCase):
    def test_values(self):
        cases = {"0.8": 0.8, "80": 0.8, "0,9": 0.9, "95": 0.95, "1": 1.0, "": 0.8, None: 0.8, "abc": 0.8, "0": 0.8, "-5": 0.8}
        for raw, expected in cases.items():
            with self.subTest(raw=raw):
                self.assertAlmostEqual(usage_guard.parse_threshold(raw), expected)


def apply(usage, *, now=NOW, started_at=None, info=None, cost=0.0, capacity=None):
    return usage_guard.apply_call(
        usage,
        started_at=now - 60 if started_at is None else started_at,
        now=now,
        rate_limit_info=info,
        cost_usd=cost,
        window_seconds=FIVE_HOURS,
        capacity_usd=capacity,
    )


class ApplyCallAndThresholdTests(unittest.TestCase):
    def test_official_reading(self):
        usage = apply({}, info=rate_limit_info(0.28, NOW + 3600), cost=1.5)
        self.assertEqual(usage["utilization"], 0.28)
        self.assertEqual(usage["source"], "rate_limit_event")
        self.assertEqual(usage["resets_at"], NOW + 3600)
        self.assertEqual(usage["window_start"], NOW + 3600 - FIVE_HOURS)
        self.assertEqual((usage["window_calls"], usage["window_cost_usd"]), (1, 1.5))

    def test_threshold_boundaries(self):
        for utilization, expected in ((0.79, False), (0.80, True), (0.95, True)):
            with self.subTest(utilization=utilization):
                usage = apply({}, info=rate_limit_info(utilization, NOW + 3600))
                self.assertIs(usage_guard.should_pause(usage, now=NOW, threshold=0.8), expected)

    def test_no_pause_after_reset(self):
        usage = apply({}, info=rate_limit_info(0.95, NOW + 3600))
        self.assertFalse(usage_guard.should_pause(usage, now=NOW + 3600, threshold=0.8))

    def test_cost_estimate_when_no_official_reading(self):
        usage = apply({}, now=NOW, started_at=NOW - 100, cost=3.0, capacity=10.0)
        self.assertAlmostEqual(usage["utilization"], 0.3)
        self.assertEqual(usage["source"], "estimativa")
        # sem reset oficial: janela começa na 1ª chamada e dura 5h
        self.assertEqual(usage["window_start"], NOW - 100)
        self.assertEqual(usage["resets_at"], NOW - 100 + FIVE_HOURS)
        self.assertFalse(usage_guard.should_pause(usage, now=NOW, threshold=0.8))

        usage = apply(usage, now=NOW + 600, cost=5.0, capacity=10.0)
        self.assertAlmostEqual(usage["utilization"], 0.8)
        self.assertEqual(usage["window_calls"], 2)
        self.assertTrue(usage_guard.should_pause(usage, now=NOW + 600, threshold=0.8))

    def test_no_source_means_no_pause(self):
        usage = apply({}, cost=50.0, capacity=None)
        self.assertIsNone(usage["utilization"])
        self.assertFalse(usage_guard.should_pause(usage, now=NOW, threshold=0.8))

    def test_official_reading_wins_over_estimate(self):
        usage = apply({}, info=rate_limit_info(0.5, NOW + 3600), cost=1.0, capacity=10.0)
        usage = apply(usage, now=NOW + 60, info=None, cost=8.0, capacity=10.0)  # sem evento nesta
        self.assertEqual((usage["utilization"], usage["source"]), (0.5, "rate_limit_event"))

    def test_expired_window_starts_over(self):
        old = apply({}, now=NOW - FIVE_HOURS, cost=9.0, capacity=10.0)
        usage = apply(old, now=NOW, started_at=NOW - 30, cost=1.0, capacity=10.0)
        self.assertEqual((usage["window_calls"], usage["window_cost_usd"]), (1, 1.0))
        self.assertEqual(usage["window_start"], NOW - 30)
        self.assertAlmostEqual(usage["utilization"], 0.1)

    def test_implausible_reset_is_capped(self):
        usage = apply({}, info=rate_limit_info(0.9, NOW * 1000))  # ex: milissegundos
        self.assertEqual(usage["resets_at"], NOW + FIVE_HOURS)


class FakeClock:
    def __init__(self, start: float):
        self.t = start
        self.sleeps: list[float] = []

    def now(self) -> float:
        return self.t

    def sleep(self, seconds: float) -> None:
        self.sleeps.append(seconds)
        self.t += seconds


class GuardFlowTestCase(unittest.TestCase):
    """Base: estado em diretório temporário, relógio falso, Telegram mockado."""

    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.state_path = Path(tmp.name) / "usage_state.json"
        self.clock = FakeClock(NOW)
        self.telegram = mock.Mock()
        for target, value in (
            (state_mod, {"USAGE_STATE_PATH": self.state_path}),
            (usage_guard, {
                "_now": self.clock.now,
                "_sleep": self.clock.sleep,
                "send_telegram_message": self.telegram,
                "USAGE_PAUSE_THRESHOLD": 0.8,
                "USAGE_PAUSE_CHECK_SECONDS": 60,
                "USAGE_WINDOW_SECONDS": FIVE_HOURS,
                "USAGE_WINDOW_CAPACITY_USD": None,
                "_announced_pause": None,
                "_warned_no_source": False,
            }),
        ):
            patcher = mock.patch.multiple(target, **value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def saved(self) -> dict:
        return json.loads(self.state_path.read_text(encoding="utf-8"))

    def messages(self) -> list[str]:
        return [c.args[0] for c in self.telegram.call_args_list]


class PauseResumeTests(GuardFlowTestCase):
    def test_below_threshold_does_not_pause(self):
        usage_guard.record_call(rate_limit_info(0.5, NOW + 600), 0.1, started_at=NOW - 60)
        usage_guard.wait_if_paused()
        self.assertEqual(self.clock.sleeps, [])
        self.assertEqual(self.messages(), [])
        self.assertIsNone(self.saved().get("paused_until"))

    def test_pause_then_resume_after_reset_in_steps(self):
        reset = NOW + 600
        usage_guard.record_call(rate_limit_info(0.82, reset), 0.5, started_at=NOW - 60)

        self.assertEqual(self.saved()["paused_until"], reset)
        self.assertEqual(len(self.messages()), 1)
        self.assertIn("⏸️", self.messages()[0])
        self.assertIn("82%", self.messages()[0])

        usage_guard.wait_if_paused()

        # espera em passos de no máximo 60s até reset + margem de 30s
        self.assertTrue(all(s <= 60 for s in self.clock.sleeps))
        self.assertEqual(sum(self.clock.sleeps), 600 + usage_guard.RESUME_MARGIN_SECONDS)
        self.assertGreaterEqual(self.clock.t, reset)
        self.assertEqual(len(self.messages()), 2)  # nada duplicado
        self.assertIn("▶️", self.messages()[1])
        self.assertIsNone(self.saved()["paused_until"])

        # nova janela: a próxima chamada mede de novo, sem pausa herdada
        usage_guard.wait_if_paused()
        self.assertEqual(len(self.messages()), 2)

    def test_pause_survives_restart(self):
        reset = NOW + 3600
        usage_guard.record_call(rate_limit_info(0.9, reset), 0.5, started_at=NOW - 60)

        # "reinício": processo novo não lembra do aviso, só do arquivo
        usage_guard._announced_pause = None
        self.assertEqual(self.saved()["paused_until"], reset)
        self.clock.t = NOW + 1800

        usage_guard.wait_if_paused()

        msgs = self.messages()
        self.assertEqual(len(msgs), 3)  # pausa, "continua pausada" depois do reinício, retomada
        self.assertIn("⏸️ Automação pausada", msgs[1])
        self.assertIn("▶️", msgs[2])
        self.assertEqual(sum(self.clock.sleeps), 1800 + usage_guard.RESUME_MARGIN_SECONDS)

    def test_ctrl_c_interrupts_wait_and_keeps_pause(self):
        reset = NOW + 3600
        usage_guard.record_call(rate_limit_info(0.9, reset), 0.5, started_at=NOW - 60)
        with mock.patch.object(usage_guard, "_sleep", side_effect=KeyboardInterrupt):
            with self.assertRaises(KeyboardInterrupt):
                usage_guard.wait_if_paused()
        self.assertEqual(self.saved()["paused_until"], reset)

    def test_hit_usage_limit_does_not_duplicate_reactive_notifications(self):
        reset = NOW + 600
        info = {"status": "rejected", "rateLimitType": "five_hour", "resetsAt": int(reset)}
        usage_guard.record_call(info, 0.5, started_at=NOW - 60, hit_usage_limit=True)
        self.assertEqual(self.saved()["paused_until"], reset)

        usage_guard.wait_if_paused()  # mesmo processo: o retry reativo já avisou
        self.assertEqual(self.messages(), [])
        self.assertIsNone(self.saved()["paused_until"])

    def test_raised_threshold_cancels_pause(self):
        usage_guard.record_call(rate_limit_info(0.85, NOW + 3600), 0.5, started_at=NOW - 60)
        with mock.patch.object(usage_guard, "USAGE_PAUSE_THRESHOLD", 0.9):
            usage_guard.wait_if_paused()
        self.assertEqual(self.clock.sleeps, [])
        self.assertIsNone(self.saved()["paused_until"])

    def test_deleting_state_file_resumes_early(self):
        usage_guard.record_call(rate_limit_info(0.9, NOW + 3600), 0.5, started_at=NOW - 60)

        def sleep_and_delete(seconds):
            self.clock.sleep(seconds)
            self.state_path.unlink()

        with mock.patch.object(usage_guard, "_sleep", side_effect=sleep_and_delete):
            usage_guard.wait_if_paused()
        self.assertEqual(self.clock.sleeps, [60])


class ClaudeRunnerIntegrationTests(GuardFlowTestCase):
    def run_result(self, utilization, reset, *, ok=True, text="feito", session_id="s1"):
        return claude_runner.ClaudeRunResult(
            ok=ok,
            result_text=text,
            session_id=session_id,
            total_cost_usd=0.5,
            raw_output="",
            rate_limit_info=rate_limit_info(utilization, reset),
        )

    def test_next_call_waits_for_reset_before_starting(self):
        reset = NOW + 600
        started_at: list[float] = []

        def fake_run_once(*args, **kwargs):
            started_at.append(self.clock.t)
            return self.run_result(0.85 if len(started_at) == 1 else 0.05, reset if len(started_at) == 1 else reset + FIVE_HOURS)

        with mock.patch.object(claude_runner, "_run_once", side_effect=fake_run_once):
            claude_runner.run_claude_code(Path("."), "tarefa 1")  # passa de 80%
            claude_runner.run_claude_code(Path("."), "tarefa 2")  # só começa depois do reset

        self.assertEqual(started_at[0], NOW)
        self.assertGreaterEqual(started_at[1], reset)

    def test_reactive_retry_still_resumes_session(self):
        reset = NOW + 600
        limit_text = "You've hit your session limit · resets 2:30pm (America/Sao_Paulo)"
        results = [
            claude_runner.ClaudeRunResult(
                ok=False,
                result_text=limit_text,
                session_id="sessao-1",
                total_cost_usd=0.2,
                raw_output="",
                rate_limit_info={"status": "rejected", "rateLimitType": "five_hour", "resetsAt": int(reset)},
            ),
            self.run_result(0.01, reset + FIVE_HOURS, text="terminei"),
        ]
        run_once = mock.Mock(side_effect=results)
        with mock.patch.object(claude_runner, "_run_once", run_once), \
                mock.patch.object(claude_runner, "send_telegram_message") as reactive_telegram, \
                mock.patch.object(claude_runner.time, "sleep") as reactive_sleep:
            result = claude_runner.run_claude_code(Path("."), "tarefa")

        self.assertTrue(result.ok)
        self.assertEqual(result.result_text, "terminei")
        reactive_sleep.assert_called_once()  # o retry reativo esperou o reset
        self.assertIn("⏳", reactive_telegram.call_args_list[0].args[0])
        second_call = run_once.call_args_list[1]
        self.assertEqual(second_call.kwargs["resume_session_id"], "sessao-1")
        self.assertEqual(second_call.args[1], claude_runner.USAGE_LIMIT_RESUME_PROMPT)
        self.assertEqual(self.messages(), [])  # a pausa preventiva não repetiu os avisos


class StreamJsonParsingTests(unittest.TestCase):
    STREAM = "\n".join([
        json.dumps({"type": "system", "subtype": "init", "session_id": "abc"}),
        json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": "ok"}]}}),
        "linha que não é JSON",
        json.dumps({"type": "rate_limit_event", "rate_limit_info": REAL_RATE_LIMIT_INFO, "session_id": "abc"}),
        json.dumps({"type": "result", "subtype": "success", "is_error": False, "result": "ok",
                    "session_id": "abc", "total_cost_usd": 0.002}),
    ]) + "\n"

    def test_parse(self):
        result, line, info = claude_runner._parse_stream_json(self.STREAM)
        self.assertEqual(result["result"], "ok")
        self.assertEqual(json.loads(line)["session_id"], "abc")
        self.assertEqual(info, REAL_RATE_LIMIT_INFO)

    def test_run_once_uses_stream_json(self):
        completed = subprocess.CompletedProcess(args=[], returncode=0, stdout=self.STREAM, stderr="")
        with mock.patch.object(claude_runner, "resolve_command", return_value=["claude"]), \
                mock.patch.object(claude_runner.subprocess, "run", return_value=completed) as run:
            result = claude_runner._run_once(
                Path("."), "oi", resume_session_id=None, model="haiku", effort=None, allowed_tools="",
                permission_mode=None, timeout_seconds=60, append_system_prompt=None,
            )
        args = run.call_args.args[0]
        self.assertIn("stream-json", args)
        self.assertIn("--verbose", args)
        self.assertTrue(result.ok)
        self.assertEqual((result.result_text, result.session_id, result.total_cost_usd), ("ok", "abc", 0.002))
        self.assertEqual(result.rate_limit_info, REAL_RATE_LIMIT_INFO)
        self.assertNotIn("assistant", result.raw_output)  # só a linha do result, não o stream

    def test_session_not_found_still_detected(self):
        # Saída real de `claude -p x --resume <id inexistente> --output-format stream-json --verbose`
        stdout = json.dumps({"type": "result", "subtype": "error_during_execution", "is_error": True,
                             "session_id": "0000", "total_cost_usd": 0,
                             "errors": ["No conversation found with session ID: 0000"]}) + "\n"
        stderr = "No conversation found with session ID: 0000\n"
        completed = subprocess.CompletedProcess(args=[], returncode=1, stdout=stdout, stderr=stderr)
        with mock.patch.object(claude_runner, "resolve_command", return_value=["claude"]), \
                mock.patch.object(claude_runner.subprocess, "run", return_value=completed):
            result = claude_runner._run_once(
                Path("."), "x", resume_session_id="0000", model=None, effort=None, allowed_tools="",
                permission_mode=None, timeout_seconds=60, append_system_prompt=None,
            )
        self.assertFalse(result.ok)
        self.assertTrue(claude_runner.session_not_found(result))


if __name__ == "__main__":
    unittest.main()

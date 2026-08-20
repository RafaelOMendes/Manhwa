"""
Invoca o Claude Code CLI local (o mesmo `claude` que você já usa manualmente nesse
repositório) em modo headless (`-p`), de forma totalmente autônoma dentro da branch do
card - sem pausar pra pedir permissão.

Baseado na documentação oficial (code.claude.com/docs/en/headless, ago/2026):
- `-p "<prompt>"` roda não-interativo.
- NÃO passamos `--bare`, de propósito: queremos que ele carregue o CLAUDE.md, o
  AGENT_INSTRUCTIONS.md, os hooks do graphify etc. do próprio repositório, do jeito que
  você já usa manualmente.
- `--permission-mode acceptEdits` libera edição de arquivos sem perguntar.
- `--allowedTools "Bash,Read,Edit,Write,Glob,Grep,WebFetch,WebSearch"` libera o resto
  (rodar comandos, buscar na web etc) sem prompt de confirmação - sem isso, qualquer
  `Bash` fora da lista de comandos somente-leitura ainda pediria aprovação e travaria o
  processo (que não tem terminal interativo pra responder).
  Evitamos de propósito `--permission-mode bypassPermissions`: há relatos de bugs onde
  esse modo ainda mostra um diálogo de confirmação em sessões headless, travando a
  execução (github.com/anthropics/claude-code/issues/52501).
- `--output-format json` devolve um objeto com `result` (texto final), `session_id`,
  `total_cost_usd` etc, o que facilita registrar um resumo no Trello/Telegram e permite
  retomar a mesma conversa depois com `--resume <session_id>` (usado no fluxo de
  "correção" quando você move o card de volta pra Em Desenvolvimento com feedback).
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

ALLOWED_TOOLS = "Bash,Read,Edit,Write,Glob,Grep,WebFetch,WebSearch"

# Timeout generoso - tarefas de codificação autônomas podem levar bastante tempo.
DEFAULT_TIMEOUT_SECONDS = int(os.environ.get("CLAUDE_RUN_TIMEOUT_SECONDS", str(60 * 45)))


@dataclass
class ClaudeRunResult:
    ok: bool
    result_text: str
    session_id: str | None
    total_cost_usd: float | None
    raw_output: str


def run_claude_code(
    repo_dir: Path,
    prompt: str,
    resume_session_id: str | None = None,
) -> ClaudeRunResult:
    claude_bin = os.environ.get("CLAUDE_CLI_PATH", "claude")

    args = [
        claude_bin,
        "-p",
        prompt,
        "--permission-mode",
        "acceptEdits",
        "--allowedTools",
        ALLOWED_TOOLS,
        "--output-format",
        "json",
    ]
    if resume_session_id:
        args += ["--resume", resume_session_id]

    try:
        proc = subprocess.run(
            args,
            cwd=str(repo_dir),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        raw = (exc.stdout or "") + (exc.stderr or "")
        return ClaudeRunResult(
            ok=False,
            result_text=f"Timeout depois de {DEFAULT_TIMEOUT_SECONDS}s rodando o Claude Code.",
            session_id=None,
            total_cost_usd=None,
            raw_output=raw,
        )

    raw_output = (proc.stdout or "") + (proc.stderr or "")

    # --output-format json normalmente imprime só o JSON no stdout, mas por segurança
    # tentamos achar a última linha que parseia como JSON.
    parsed = None
    for line in reversed((proc.stdout or "").splitlines()):
        line = line.strip()
        if not line:
            continue
        try:
            parsed = json.loads(line)
            break
        except json.JSONDecodeError:
            continue

    if parsed is not None:
        result_text = str(parsed.get("result", "")).strip()
        session_id = parsed.get("session_id")
        total_cost_usd = parsed.get("total_cost_usd")
    else:
        result_text = (proc.stdout or "").strip()[-4000:]
        session_id = None
        total_cost_usd = None

    ok = proc.returncode == 0 and bool(result_text)
    return ClaudeRunResult(
        ok=ok,
        result_text=result_text or "(Claude Code não devolveu texto de resultado)",
        session_id=session_id,
        total_cost_usd=total_cost_usd,
        raw_output=raw_output,
    )

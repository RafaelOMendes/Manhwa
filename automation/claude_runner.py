"""
Invoca o Claude Code CLI local (o mesmo `claude` que você já usa manualmente nesse
repositório) em modo headless (`-p`).

Usado em DOIS papéis diferentes pelo watcher, com parâmetros diferentes:
  1. Rascunhar o prompt a partir do card do Trello (claude_prompt.py) - modelo leve
     (haiku por padrão), só ferramentas de leitura, sem poder editar nada.
  2. Executar a tarefa de verdade (watcher.py) - modelo e effort escolhidos pela
     própria etapa de rascunho do prompt (claude_prompt.py), proporcional à
     complexidade da task, com fallback pro default da conta/CLAUDE_EXEC_MODEL se a
     escolha não vier ou não for válida - com edição de arquivos e bash liberados, de
     forma totalmente autônoma dentro da branch do card. É AQUI que
     entra o lembrete de usar o graphify (via --append-system-prompt), porque os hooks
     do repo (.claude/settings.json) já reforçam isso automaticamente pro Bash/Read/
     Glob, mas queremos garantir mesmo que o prompt gerado não mencione graphify.

Baseado na documentação oficial (code.claude.com/docs/en/headless e
code.claude.com/docs/en/cli-reference, ago/2026):
- `-p "<prompt>"` roda não-interativo.
- NÃO passamos `--bare`, de propósito: queremos que ele carregue o CLAUDE.md, o
  AGENT_INSTRUCTIONS.md, os hooks do graphify etc. do próprio repositório, do jeito que
  você já usa manualmente - inclusive na etapa de rascunhar o prompt, pra ele já se
  situar no projeto.
- Pra EXECUÇÃO: `--permission-mode acceptEdits` libera edição de arquivos sem
  perguntar, e `--allowedTools "Bash,Read,Edit,Write,Glob,Grep,WebFetch,WebSearch"`
  libera o resto (rodar comandos, buscar na web etc) sem prompt de confirmação - sem
  isso, qualquer `Bash` fora da lista de comandos somente-leitura ainda pediria
  aprovação e travaria o processo (que não tem terminal interativo pra responder).
  Evitamos de propósito `--permission-mode bypassPermissions`: há relatos de bugs onde
  esse modo ainda mostra um diálogo de confirmação em sessões headless, travando a
  execução (github.com/anthropics/claude-code/issues/52501).
- Pra RASCUNHAR O PROMPT: só `--allowedTools "Read,Glob,Grep"`, sem
  `--permission-mode` nenhum - o objetivo é só ler o repo pra se situar e devolver
  texto, nunca editar nada.
- `--model <alias ou nome completo>` - aceita aliases (`sonnet`, `opus`, `haiku`,
  `fable`) ou o nome completo do modelo.
- `--effort <low|medium|high|xhigh|max>` - nível de esforço/raciocínio da sessão.
- `--output-format json` devolve um objeto com `result` (texto final), `session_id`,
  `total_cost_usd` etc, o que facilita registrar um resumo no Trello/Telegram e permite
  retomar a mesma conversa depois com `--resume <session_id>` (usado no fluxo de
  "correção" quando você move o card de volta pra Em Desenvolvimento com feedback).
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
from dataclasses import dataclass
from pathlib import Path

from proc_utils import resolve_command


def _log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

EXEC_ALLOWED_TOOLS = "Bash,Read,Edit,Write,Glob,Grep,WebFetch,WebSearch"

# Timeout generoso - tarefas de codificação autônomas podem levar bastante tempo.
DEFAULT_TIMEOUT_SECONDS = int(os.environ.get("CLAUDE_RUN_TIMEOUT_SECONDS", str(60 * 45)))

GRAPHIFY_REMINDER = (
    "Este repositório tem um grafo de conhecimento em graphify-out/ (god nodes, "
    "estrutura de comunidades, relações entre arquivos). Antes de explorar o código "
    "cru (grep/Read direto), use `graphify query \"<pergunta>\"` quando "
    "graphify-out/graph.json existir - use `graphify path \"<A>\" \"<B>\"` para "
    "relações e `graphify explain \"<conceito>\"` para conceitos focados. Depois de "
    "alterar código, rode `graphify update .` para manter o grafo atualizado. Isso "
    "vale mesmo que o prompt abaixo não mencione o graphify explicitamente."
)


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
    model: str | None = None,
    effort: str | None = None,
    allowed_tools: str = EXEC_ALLOWED_TOOLS,
    permission_mode: str | None = "acceptEdits",
    timeout_seconds: int | None = None,
    append_system_prompt: str | None = None,
) -> ClaudeRunResult:
    claude_cmd = resolve_command(os.environ.get("CLAUDE_CLI_PATH") or "claude")

    args = [*claude_cmd, "-p", prompt, "--output-format", "json"]
    if permission_mode:
        args += ["--permission-mode", permission_mode]
    if allowed_tools:
        args += ["--allowedTools", allowed_tools]
    if model:
        args += ["--model", model]
    if effort:
        args += ["--effort", effort]
    if append_system_prompt:
        args += ["--append-system-prompt", append_system_prompt]
    if resume_session_id:
        args += ["--resume", resume_session_id]

    timeout = timeout_seconds or DEFAULT_TIMEOUT_SECONDS

    # Rascunho de prompt (permission_mode=None): rápido, só leitura, ~30-90s na
    # prática (observado: ~40s). Execução de verdade (permission_mode="acceptEdits"):
    # sem tempo fixo - depende do tamanho da task, de segundos a bem perto do limite
    # de CLAUDE_RUN_TIMEOUT_SECONDS (padrão 45min) para tasks grandes. subprocess.run
    # é bloqueante e não devolve nada até terminar, então sem esse heartbeat a janela
    # do watcher fica muda o tempo todo - o log abaixo é só pra você acompanhar que
    # ainda está rodando (e não travado) enquanto espera.
    kind = "execução autônoma (edita arquivos/roda comandos)" if permission_mode else "rascunho de prompt (só leitura)"
    _log(
        f"Chamando Claude Code - {kind}, modelo={model or 'padrão da conta'}, "
        f"effort={effort or 'padrão'}, limite={timeout // 60}min..."
    )

    start = time.monotonic()
    stop_heartbeat = threading.Event()

    def _heartbeat() -> None:
        while not stop_heartbeat.wait(60):
            elapsed_min = (time.monotonic() - start) / 60
            _log(f"...Claude Code ainda rodando ({elapsed_min:.1f}min decorridos, limite {timeout // 60}min)")

    heartbeat = threading.Thread(target=_heartbeat, daemon=True)
    heartbeat.start()

    try:
        proc = subprocess.run(
            args,
            cwd=str(repo_dir),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=timeout,
        )
    except subprocess.TimeoutExpired as exc:
        raw = (exc.stdout or "") + (exc.stderr or "")
        return ClaudeRunResult(
            ok=False,
            result_text=f"Timeout depois de {timeout}s rodando o Claude Code.",
            session_id=None,
            total_cost_usd=None,
            raw_output=raw,
        )
    except OSError as exc:
        # Ex: WinError 87/2 no Windows quando o executável não foi resolvido
        # corretamente. Devolve o comando exato que tentamos rodar, pra facilitar o
        # diagnóstico (fica no log e no comentário do card).
        return ClaudeRunResult(
            ok=False,
            result_text=(
                f"Não consegui executar o Claude Code: {exc}\n"
                f"Comando tentado: {args[:1]} (resolvido a partir de "
                f"CLAUDE_CLI_PATH={os.environ.get('CLAUDE_CLI_PATH') or '(vazio, usando `claude` do PATH)'}).\n"
                "Rode `Get-Command claude` no PowerShell (mesmo terminal do watcher) "
                "e confira se o caminho existe; se quiser, cole esse caminho completo "
                "em CLAUDE_CLI_PATH no automation/.env."
            ),
            session_id=None,
            total_cost_usd=None,
            raw_output=str(exc),
        )
    finally:
        stop_heartbeat.set()
        heartbeat.join(timeout=2)

    elapsed_min = (time.monotonic() - start) / 60
    _log(f"Claude Code terminou em {elapsed_min:.1f}min (returncode={proc.returncode}).")

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

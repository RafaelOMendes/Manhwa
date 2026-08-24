"""
Usa o próprio Claude Code CLI (headless, -p) para transformar um card do Trello num
prompt bem estruturado, que depois é usado pela etapa de execução (também Claude Code,
mas com o modelo principal e liberado pra editar arquivos - ver watcher.py).

Por que uma chamada separada só pra "escrever o prompt"? O card do Trello costuma vir
resumido/informal demais pra virar instrução direta de um agente que não pode parar
pra perguntar nada. Ter uma etapa dedicada de "engenharia de prompt" dá um resultado
mais específico e consistente, e fica registrado como comentário no card pra você
conferir antes da execução de verdade rodar.

Além de escrever o prompt, essa etapa também ESCOLHE com qual modelo (sonnet/opus) e
qual nível de esforço (--effort) a execução de verdade deve rodar, proporcional à
complexidade real da task - em vez de usar sempre o mesmo modelo/effort fixo pra
qualquer card. Essa escolha fica registrada no state.json e é usada em
run_claude_code() na etapa de execução (ver watcher.py:handle_dev).

Roda num modelo mais leve por padrão (haiku - configurável via CLAUDE_PROMPT_MODEL),
já que é uma tarefa de reescrever texto e avaliar complexidade, não de programar - mais
rápido e mais barato. Só recebe ferramentas de LEITURA (Read/Glob/Grep): essa etapa
observa o repositório pra se situar (nomes de pasta reais, convenções do
CLAUDE.md/AGENT_INSTRUCTIONS.md etc), mas nunca edita nada nem roda comandos.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from pathlib import Path

from claude_runner import run_claude_code

DRAFT_ALLOWED_TOOLS = "Read,Glob,Grep"

VALID_EXEC_MODELS = {"sonnet", "opus"}
VALID_EXEC_EFFORTS = {"low", "medium", "high", "xhigh", "max"}

RESULT_MARKER = "===PROMPT==="

META_PROMPT_TEMPLATE = """\
Você vai preparar instruções para OUTRA sessão do Claude Code, que vai trabalhar
sozinha, sem supervisão em tempo real e sem poder fazer perguntas de esclarecimento,
neste mesmo repositório (Manhwa Tracker: backend/ FastAPI, frontend/ Next.js,
mobile/ Expo + React Native).

Se for útil pra deixar o prompt mais específico, dê uma olhada rápida na estrutura
real do repositório com Read/Glob/Grep antes de escrever (por exemplo, confirmar
nomes de arquivo/pasta relevantes ao que o card pede). Não precisa ler tudo, só o
suficiente pra não escrever instruções genéricas demais.

Abaixo está um card do Trello (título e descrição) escrito pelo dono do projeto,
geralmente de forma resumida/informal.

Título do card: {title}

Descrição do card:
{description}

Comentários adicionais no card (se houver, podem conter mais contexto ou correções):
{comments}

Além de escrever o prompt, você também decide COM QUE MODELO e COM QUE NÍVEL DE
ESFORÇO a outra sessão vai rodar de verdade essa task. Julgue pela complexidade real
do que o card pede, não pelo tamanho do texto do card:

A. Modelo (`sonnet` ou `opus`):
   - `sonnet` - cobre a grande maioria das tasks: bugs pontuais com causa óbvia, CRUD
     simples, ajustes de UI/estilo, mudanças bem escopadas numa única área
     (backend OU frontend OU mobile).
   - `opus` - reserve para tasks realmente complexas: mudanças que atravessam várias
     áreas ao mesmo tempo (backend+frontend+mobile), refatorações arquiteturais, bugs
     com causa raiz não óbvia (exige investigação), ou qualquer coisa de alto risco
     (transações de banco, autenticação, sincronização de dados).

B. Esforço (`low`, `medium`, `high`, `xhigh` ou `max`) - proporcional à complexidade
   real, não exagere (effort mais alto custa mais e demora mais):
   - `low` - mudança trivial, poucos arquivos, zero ambiguidade.
   - `medium` - a maioria das tasks do dia a dia.
   - `high` - task não-trivial, exige investigar/planejar antes de codar.
   - `xhigh` - task complexa, múltiplas áreas ou bastante incerteza.
   - `max` - só para tasks excepcionalmente difíceis ou críticas.

Escreva o prompt final em português, seguindo esta estrutura:
1. Objetivo: uma frase clara do que precisa mudar/ser criado.
2. Escopo: quais pastas/áreas são afetadas (backend, frontend, mobile - diga quais).
3. Detalhes: passos ou comportamento esperado, com o máximo de especificidade que der
   pra inferir da descrição do card. Se a descrição for vaga, tome as decisões
   razoáveis mais prováveis e declare as suposições que está fazendo (não pare pra
   perguntar).
4. Critérios de aceite: como saber que a tarefa foi concluída corretamente.
5. Instrua explicitamente o agente que vai executar isso a: rodar lint/typecheck relevante
   se aplicável, atualizar o AGENT_INSTRUCTIONS.md se a mudança for significativa
   (assim como você mesmo faria), e terminar com um `git add -A && git commit` com
   uma mensagem de commit clara resumindo o que foi feito.

Devolva sua resposta EXATAMENTE neste formato, sem nenhum texto antes da primeira
linha, sem markdown de code fence, sem "aqui está":

MODELO: <sonnet ou opus>
EFFORT: <low, medium, high, xhigh ou max>
{marker}
<o prompt final aqui, seguindo a estrutura acima>
"""


@dataclass
class PromptDraft:
    prompt: str
    model: str | None
    effort: str | None


def _parse_draft(raw_text: str) -> PromptDraft:
    """Extrai MODELO/EFFORT/prompt da resposta do modelo leve. Se o formato não bater
    (modelo não seguiu à risca, ou é uma resposta antiga de antes dessa mudança), cai
    de volta pra tratar o texto inteiro como o prompt, sem modelo/effort escolhidos -
    quem chama já sabe usar os defaults do .env nesse caso."""
    model_match = re.search(r"(?im)^\s*MODELO:\s*(\w+)\s*$", raw_text)
    effort_match = re.search(r"(?im)^\s*EFFORT:\s*(\w+)\s*$", raw_text)

    model = model_match.group(1).lower() if model_match else None
    if model not in VALID_EXEC_MODELS:
        model = None

    effort = effort_match.group(1).lower() if effort_match else None
    if effort not in VALID_EXEC_EFFORTS:
        effort = None

    marker_idx = raw_text.find(RESULT_MARKER)
    prompt = raw_text[marker_idx + len(RESULT_MARKER):].strip() if marker_idx != -1 else raw_text.strip()

    return PromptDraft(prompt=prompt, model=model, effort=effort)


def build_prompt(repo_dir: Path, title: str, description: str, comments: list[str]) -> PromptDraft:
    model = os.environ.get("CLAUDE_PROMPT_MODEL", "haiku")
    timeout = int(os.environ.get("CLAUDE_PROMPT_TIMEOUT_SECONDS", "300"))

    comments_text = "\n".join(f"- {c}" for c in comments) if comments else "(nenhum)"
    meta_prompt = META_PROMPT_TEMPLATE.format(
        title=title.strip(),
        description=(description or "(sem descrição)").strip(),
        comments=comments_text,
        marker=RESULT_MARKER,
    )

    result = run_claude_code(
        repo_dir,
        meta_prompt,
        model=model,
        allowed_tools=DRAFT_ALLOWED_TOOLS,
        permission_mode=None,
        timeout_seconds=timeout,
    )
    if not result.ok:
        raise RuntimeError(f"Claude Code (rascunho do prompt) falhou: {result.result_text}")
    return _parse_draft(result.result_text)

"""
Usa o próprio Claude Code CLI (headless, -p) para transformar um card do Trello num
prompt bem estruturado, que depois é usado pela etapa de execução (também Claude Code,
mas com o modelo principal e liberado pra editar arquivos - ver watcher.py).

Por que uma chamada separada só pra "escrever o prompt"? O card do Trello costuma vir
resumido/informal demais pra virar instrução direta de um agente que não pode parar
pra perguntar nada. Ter uma etapa dedicada de "engenharia de prompt" dá um resultado
mais específico e consistente, e fica registrado como comentário no card pra você
conferir antes da execução de verdade rodar.

Roda num modelo mais leve por padrão (haiku - configurável via CLAUDE_PROMPT_MODEL),
já que é uma tarefa de reescrever texto, não de programar - mais rápido e mais barato.
Só recebe ferramentas de LEITURA (Read/Glob/Grep): essa etapa observa o repositório
pra se situar (nomes de pasta reais, convenções do CLAUDE.md/AGENT_INSTRUCTIONS.md
etc), mas nunca edita nada nem roda comandos.
"""

from __future__ import annotations

import os
from pathlib import Path

from claude_runner import run_claude_code

DRAFT_ALLOWED_TOOLS = "Read,Glob,Grep"

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

Devolva APENAS o prompt final (sem comentários seus, sem markdown de code fence, sem
"aqui está o prompt:"). O texto que você devolver será usado diretamente como o prompt
enviado à outra sessão do Claude Code.
"""


def build_prompt(repo_dir: Path, title: str, description: str, comments: list[str]) -> str:
    model = os.environ.get("CLAUDE_PROMPT_MODEL", "haiku")
    timeout = int(os.environ.get("CLAUDE_PROMPT_TIMEOUT_SECONDS", "300"))

    comments_text = "\n".join(f"- {c}" for c in comments) if comments else "(nenhum)"
    meta_prompt = META_PROMPT_TEMPLATE.format(
        title=title.strip(),
        description=(description or "(sem descrição)").strip(),
        comments=comments_text,
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
    return result.result_text

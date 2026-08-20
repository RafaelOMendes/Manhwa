"""
Usa a API do Gemini para transformar um card do Trello (título + descrição, em
português, muitas vezes meio cru) num prompt bem estruturado para o Claude Code
executar no repositório Manhwa Tracker.

Requer GEMINI_API_KEY no ambiente (gerada em https://aistudio.google.com/apikey -
é uma chave de API "Google AI Studio", separada da assinatura do app Gemini).
"""

from __future__ import annotations

import os

from google import genai

REPO_CONTEXT = """\
Você está ajudando a preparar instruções para um agente de codificação (Claude Code) que
vai trabalhar sozinho, sem supervisão em tempo real, no repositório "Manhwa Tracker":

- backend/  -> FastAPI (Python, async), SQLAlchemy async + PostgreSQL, Telethon p/ Telegram.
- frontend/ -> Next.js 14 (App Router), TypeScript, Tailwind CSS.
- mobile/   -> Expo SDK 54 + React Native + NativeWind (expo-router).

Convenções importantes do repositório que o agente já vai conhecer sozinho (não precisa
repetir em detalhe, só deixar claro que ele deve segui-las):
- Existe um AGENT_INSTRUCTIONS.md que deve ser atualizado após mudanças significativas.
- Mudanças no modelo de dados do backend (models.py) devem refletir em frontend/types e
  mobile/src/types.
- O projeto tem um grafo de conhecimento (graphify) que o agente deve consultar antes de
  explorar o código.
"""

META_PROMPT_TEMPLATE = """\
{repo_context}

Abaixo está um card do Trello (título e descrição) escrito pelo dono do projeto,
geralmente de forma resumida/informal. Sua tarefa é transformá-lo num prompt claro,
específico e autocontido para o Claude Code executar de forma autônoma, sem poder
fazer perguntas de esclarecimento.

Título do card: {title}

Descrição do card:
{description}

Comentários adicionais no card (se houver, podem conter mais contexto ou correções):
{comments}

Escreva o prompt final em português, seguindo esta estrutura:
1. Objetivo: uma frase clara do que precisa mudar/ser criado.
2. Escopo: quais pastas/áreas são afetadas (backend, frontend, mobile - diga quais).
3. Detalhes: passos ou comportamento esperado, com o máximo de especificidade que der pra
   inferir da descrição do card. Se a descrição for vaga, tome as decisões razoáveis mais
   prováveis e declare as suposições que está fazendo (não pare pra perguntar).
4. Critérios de aceite: como saber que a tarefa foi concluída corretamente.
5. Instrua explicitamente o agente a: rodar lint/typecheck relevante se aplicável, atualizar
   o AGENT_INSTRUCTIONS.md se a mudança for significativa, e terminar com um `git add -A &&
   git commit` com uma mensagem de commit clara resumindo o que foi feito.

Devolva APENAS o prompt final (sem comentários seus, sem markdown de code fence, sem
"aqui está o prompt:"). O texto que você devolver será usado diretamente como o prompt
enviado ao Claude Code.
"""


def build_prompt(title: str, description: str, comments: list[str]) -> str:
    model = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")
    client = genai.Client()  # lê GEMINI_API_KEY do ambiente

    comments_text = "\n".join(f"- {c}" for c in comments) if comments else "(nenhum)"

    meta_prompt = META_PROMPT_TEMPLATE.format(
        repo_context=REPO_CONTEXT,
        title=title.strip(),
        description=(description or "(sem descrição)").strip(),
        comments=comments_text,
    )

    response = client.models.generate_content(model=model, contents=meta_prompt)
    text = (response.text or "").strip()
    if not text:
        raise RuntimeError("Gemini devolveu uma resposta vazia ao gerar o prompt.")
    return text

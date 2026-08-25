"""
Operações git usadas pelo watcher: checar se a árvore está limpa, criar uma branch
por card, e dar merge na branch base quando o card é aprovado (movido pra "Concluído").

Tudo via subprocess chamando o `git` de verdade instalado na sua máquina - nada de
lib externa, pra evitar surpresa de comportamento.
"""

from __future__ import annotations

import re
import subprocess
from dataclasses import dataclass
from pathlib import Path

from proc_utils import resolve_command

GIT_CMD = resolve_command("git")


class GitError(RuntimeError):
    pass


@dataclass
class GitResult:
    ok: bool
    output: str


def _run(repo_dir: Path, *args: str) -> GitResult:
    proc = subprocess.run(
        [*GIT_CMD, *args],
        cwd=str(repo_dir),
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
    )
    output = (proc.stdout or "") + (proc.stderr or "")
    return GitResult(ok=proc.returncode == 0, output=output)


def is_clean(repo_dir: Path) -> bool:
    res = _run(repo_dir, "status", "--porcelain")
    return res.ok and res.output.strip() == ""


def current_branch(repo_dir: Path) -> str:
    res = _run(repo_dir, "rev-parse", "--abbrev-ref", "HEAD")
    if not res.ok:
        raise GitError(f"git rev-parse falhou: {res.output}")
    return res.output.strip()


def branch_exists(repo_dir: Path, branch: str) -> bool:
    res = _run(repo_dir, "rev-parse", "--verify", "--quiet", branch)
    return res.ok


def automation_version(repo_dir: Path) -> str:
    """"Versão" da automação = branch + hash curto do commit atual - só pra você saber,
    olhando o Telegram/terminal, exatamente com qual código essa instância do watcher
    está rodando (relevante porque o processo não recarrega código sozinho quando você
    faz merge/checkout de outra branch enquanto ele já está de pé)."""
    try:
        branch = current_branch(repo_dir)
    except GitError:
        branch = "desconhecida"
    commit = _run(repo_dir, "rev-parse", "--short", "HEAD")
    commit_hash = commit.output.strip() if commit.ok else "desconhecido"
    return f"{branch}@{commit_hash}"


def slugify(text: str, max_len: int = 40) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len].strip("-") or "tarefa"


def branch_name_for_card(card_id: str, card_name: str) -> str:
    return f"card-{card_id[-6:]}-{slugify(card_name)}"


def start_card_branch(repo_dir: Path, base_branch: str, branch: str, fresh: bool = False) -> None:
    """
    Garante que `base_branch` está limpo e faz checkout numa branch pra trabalhar no
    card.
    Lança GitError se a árvore de trabalho não estiver limpa - não queremos misturar
    mudanças não commitadas de fora da automação com o que o Claude Code vai gerar.

    `fresh=True` (rodada inicial de um card, não uma correção) sempre cria a branch do
    zero em cima de `base_branch` - se sobrou uma branch com esse nome de uma rodada
    anterior interrompida (crash, processo derrubado no meio), ela é descartada em vez
    de reaproveitada, pra não herdar estado parcial/velho. `fresh=False` (rodada de
    correção, retomando a mesma sessão do Claude Code) reaproveita a branch existente
    de propósito, pra acumular os commits de correção no mesmo lugar.
    """
    if not is_clean(repo_dir):
        raise GitError(
            f"A árvore de trabalho tem mudanças não commitadas. Não vou criar/trocar de "
            f"branch pra não misturar coisas. Rode `git status` em {repo_dir} e resolva "
            f"(commit, stash ou descarte) antes de deixar a automação continuar."
        )

    checkout_base = _run(repo_dir, "checkout", base_branch)
    if not checkout_base.ok:
        raise GitError(f"Não consegui fazer checkout de '{base_branch}': {checkout_base.output}")

    if fresh and branch_exists(repo_dir, branch):
        _run(repo_dir, "branch", "-D", branch)

    if branch_exists(repo_dir, branch):
        res = _run(repo_dir, "checkout", branch)
    else:
        res = _run(repo_dir, "checkout", "-b", branch)
    if not res.ok:
        raise GitError(f"Não consegui criar/trocar para a branch '{branch}': {res.output}")


# Ordem intencional (Back, Front, Mobile) - é a ordem em que aparecem nos avisos.
AREA_LABELS = {
    "backend": "Back",
    "frontend": "Front",
    "mobile": "Mobile",
}


def changed_areas(repo_dir: Path, base_branch: str, branch: str) -> list[str]:
    """Quais áreas do projeto (Back/Front/Mobile) os commits da branch do card tocaram
    em relação a `base_branch`, pra avisar no Trello/Telegram quando a task terminar.
    Usa `git diff` por nome de arquivo - funciona não importa em qual branch o
    repositório está checked out no momento."""
    res = _run(repo_dir, "diff", "--name-only", f"{base_branch}...{branch}")
    if not res.ok:
        return []
    touched_dirs = {line.split("/", 1)[0] for line in res.output.splitlines() if line.strip()}
    return [label for prefix, label in AREA_LABELS.items() if prefix in touched_dirs]


def commit_all_if_dirty(repo_dir: Path, message: str) -> bool:
    """Rede de segurança: se o Claude Code terminou e deixou coisa sem commitar, commita."""
    if is_clean(repo_dir):
        return False
    _run(repo_dir, "add", "-A")
    res = _run(repo_dir, "commit", "-m", message)
    if not res.ok:
        raise GitError(f"Falha ao commitar mudanças pendentes: {res.output}")
    return True


def merge_branch(repo_dir: Path, base_branch: str, branch: str) -> GitResult:
    """
    Faz merge --no-ff da branch do card em base_branch. Em caso de conflito, aborta o
    merge automaticamente (pra não deixar o repo num estado quebrado) e devolve ok=False
    com a saída do git pra você resolver manualmente.
    """
    if not is_clean(repo_dir):
        return GitResult(ok=False, output="Árvore de trabalho suja antes do merge - abortando.")

    checkout = _run(repo_dir, "checkout", base_branch)
    if not checkout.ok:
        return checkout

    merge = _run(repo_dir, "merge", "--no-ff", "-m", f"Merge {branch} (aprovado no Trello)", branch)
    if not merge.ok:
        _run(repo_dir, "merge", "--abort")
        return merge
    return merge


def delete_branch(repo_dir: Path, branch: str) -> None:
    _run(repo_dir, "branch", "-D", branch)


def push(repo_dir: Path, branch: str) -> GitResult:
    return _run(repo_dir, "push", "origin", branch)

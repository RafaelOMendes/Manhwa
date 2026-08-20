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


class GitError(RuntimeError):
    pass


@dataclass
class GitResult:
    ok: bool
    output: str


def _run(repo_dir: Path, *args: str) -> GitResult:
    proc = subprocess.run(
        ["git", *args],
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


def slugify(text: str, max_len: int = 40) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:max_len].strip("-") or "tarefa"


def branch_name_for_card(card_id: str, card_name: str) -> str:
    return f"card-{card_id[-6:]}-{slugify(card_name)}"


def start_card_branch(repo_dir: Path, base_branch: str, branch: str) -> None:
    """
    Garante que `base_branch` está limpo e faz checkout numa branch nova (ou existente,
    se já tiver sido criada numa rodada anterior) pra trabalhar no card.
    Lança GitError se a árvore de trabalho não estiver limpa - não queremos misturar
    mudanças não commitadas de fora da automação com o que o Claude Code vai gerar.
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

    if branch_exists(repo_dir, branch):
        res = _run(repo_dir, "checkout", branch)
    else:
        res = _run(repo_dir, "checkout", "-b", branch)
    if not res.ok:
        raise GitError(f"Não consegui criar/trocar para a branch '{branch}': {res.output}")


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

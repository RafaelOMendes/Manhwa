"""
Loop principal da automação Trello -> Claude Code -> Telegram -> EAS Build.

Fluxo (ver automation/SETUP.md para a explicação completa e o passo a passo de
configuração):

  [A Fazer] --(você arrasta)--> [Em Andamento]
        --(watcher: Claude Code, modelo leve, gera o prompt)--> [Em Desenvolvimento]
        --(watcher: Claude Code executa numa branch própria)--> [Teste]
        --(watcher: avisa no Telegram)
  Você testa. Se estiver ruim, arrasta de volta pra [Em Desenvolvimento] e comenta o
  que precisa mudar -> o watcher retoma a mesma sessão do Claude Code com esse feedback.
  Se estiver bom, arrasta pra [Concluído]
        --(watcher: dá merge da branch do card na branch base)
  Quando não sobra nenhum card em Em Andamento / Em Desenvolvimento / Teste e existe pelo
  menos um card recém-concluído ainda não "buildado", o watcher dispara `eas build` do
  app mobile e manda o link de download no Telegram.

Rode com `python watcher.py` (ou o atalho `iniciaAutomation.bat` na raiz do repo).
Pare com Ctrl+C.
"""

from __future__ import annotations

import os
import sys
import time
import traceback
from pathlib import Path

from dotenv import load_dotenv

AUTOMATION_DIR = Path(__file__).resolve().parent
REPO_DIR = AUTOMATION_DIR.parent
MOBILE_DIR = REPO_DIR / "mobile"

load_dotenv(AUTOMATION_DIR / ".env")

# Import depois do load_dotenv pra garantir que os módulos que leem env var no import
# já vejam as variáveis carregadas.
import state as state_mod  # noqa: E402
from trello_client import TrelloClient, resolve_list_ids  # noqa: E402
from claude_prompt import build_prompt  # noqa: E402
from claude_runner import run_claude_code, GRAPHIFY_REMINDER  # noqa: E402
from telegram_notify import send_telegram_message  # noqa: E402
from mobile_build import run_mobile_build  # noqa: E402
import git_ops  # noqa: E402

POLL_INTERVAL_SECONDS = int(os.environ.get("POLL_INTERVAL_SECONDS", "30"))
BASE_BRANCH = os.environ.get("BASE_BRANCH", "main")
PUSH_TO_REMOTE = os.environ.get("PUSH_TO_REMOTE", "false").strip().lower() == "true"
BUILD_PROFILE = os.environ.get("EAS_BUILD_PROFILE", "preview")


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def card_url(card: dict) -> str:
    return card.get("shortUrl", "")


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())


def handle_doing(client: TrelloClient, card: dict, state: dict, list_ids: dict) -> None:
    """Card acabou de entrar em 'Em Andamento': gera o prompt com o Claude Code (modelo
    leve) e move pra 'Em Desenvolvimento'."""
    card_id = card["id"]
    log(f"Card '{card['name']}' entrou em Em Andamento -> gerando prompt (Claude Code)...")

    comments = [c["data"]["text"] for c in client.get_comments(card_id) if c.get("data", {}).get("text")]
    draft = build_prompt(REPO_DIR, card["name"], card.get("desc", ""), comments)

    client.comment_card(
        card_id,
        f"🤖 Prompt gerado automaticamente para o Claude Code (modelo: {draft.model or 'padrão'}, "
        f"effort: {draft.effort or 'padrão'}):\n\n{draft.prompt}",
    )
    client.move_card(card_id, list_ids["DEV"])

    # Propositalmente NÃO atualiza last_list_id aqui: o card já foi movido pra DEV de
    # verdade no Trello, mas o estado local precisa continuar "desatualizado" (com o
    # valor antigo) até o próximo tick, senão tick() nunca vai detectar a "mudança pra
    # DEV" e handle_dev() nunca vai ser chamado - o card ficaria parado pra sempre em
    # Em Desenvolvimento sem branch/sessão criada.
    state_mod.set_card(
        state,
        card_id,
        stage="prompted",
        prompt=draft.prompt,
        model=draft.model,
        effort=draft.effort,
        blocked_notified=False,
    )
    log(f"Card '{card['name']}' movido para Em Desenvolvimento.")


def handle_dev(client: TrelloClient, card: dict, state: dict, list_ids: dict) -> None:
    """Card está em 'Em Desenvolvimento': roda o Claude Code (autônomo) numa branch
    própria do card e move pra 'Teste' quando terminar. Se o card já tinha passado por
    aqui antes (tem session_id), trata como uma rodada de correção usando os comentários
    novos como feedback, retomando a mesma sessão."""
    card_id = card["id"]
    card_state = state["cards"][card_id]
    is_fix_round = bool(card_state.get("session_id"))

    branch = card_state.get("branch") or git_ops.branch_name_for_card(card_id, card["name"])

    try:
        # fresh=True só na rodada inicial: garante uma branch nova mesmo que tenha
        # sobrado uma com o mesmo nome de uma execução anterior interrompida. Numa
        # rodada de correção (is_fix_round) reaproveita a mesma branch de propósito.
        git_ops.start_card_branch(REPO_DIR, BASE_BRANCH, branch, fresh=not is_fix_round)
    except git_ops.GitError as exc:
        if not card_state.get("blocked_notified"):
            send_telegram_message(f"⚠️ Card '{card['name']}' travado: {exc}")
            client.comment_card(card_id, f"⚠️ Automação travada ao tentar criar a branch:\n{exc}")
            state_mod.set_card(state, card_id, blocked_notified=True)
        log(f"BLOQUEADO ({card['name']}): {exc}")
        return  # não atualiza last_list_id -> tenta de novo no próximo poll

    if is_fix_round:
        comments = client.get_comments(card_id)
        last_seen = card_state.get("last_comment_date") or ""
        new_comments = [
            c["data"]["text"]
            for c in comments
            if c.get("date", "") > last_seen and c.get("data", {}).get("text")
        ]
        feedback = "\n".join(f"- {c}" for c in new_comments) or "(sem comentários novos, apenas retomando)"
        prompt = (
            "O card foi movido de volta para 'Em Desenvolvimento' depois de um teste. "
            f"Feedback recebido:\n{feedback}\n\n"
            "Ajuste o código de acordo com esse feedback nesta mesma branch e faça commit "
            "das mudanças ao final."
        )
        # Rodada de correção: mantém o mesmo modelo/effort escolhidos na rodada
        # original (não passa pela etapa de rascunho de novo).
        model_choice = card_state.get("model")
        effort_choice = card_state.get("effort")
        log(f"Card '{card['name']}' voltou para correção (retomando sessão {card_state['session_id']}).")
    else:
        prompt = card_state.get("prompt")
        model_choice = card_state.get("model")
        effort_choice = card_state.get("effort")
        if not prompt:
            # Card pulou direto pra 'Em Desenvolvimento' sem passar por 'Em Andamento'.
            log(f"Card '{card['name']}' não tinha prompt gerado ainda - gerando agora (Claude Code).")
            comments = [c["data"]["text"] for c in client.get_comments(card_id) if c.get("data", {}).get("text")]
            draft = build_prompt(REPO_DIR, card["name"], card.get("desc", ""), comments)
            prompt = draft.prompt
            model_choice = draft.model
            effort_choice = draft.effort
            client.comment_card(
                card_id,
                f"🤖 Prompt gerado automaticamente para o Claude Code (modelo: {draft.model or 'padrão'}, "
                f"effort: {draft.effort or 'padrão'}):\n\n{draft.prompt}",
            )

    # Chamada bloqueante e sem tempo fixo: pode levar de segundos a quase o limite de
    # CLAUDE_RUN_TIMEOUT_SECONDS (padrão 45min) dependendo do tamanho da task. Fica
    # nesta linha até o Claude Code terminar de verdade - run_claude_code() já loga um
    # heartbeat a cada 1min pra você acompanhar que ainda está rodando. Modelo/effort
    # vêm da escolha feita pela etapa de rascunho do prompt (claude_prompt.py),
    # proporcional à complexidade da task; CLAUDE_EXEC_MODEL/CLAUDE_EXEC_EFFORT no
    # .env só entram como fallback se essa escolha não veio ou não foi válida.
    result = run_claude_code(
        REPO_DIR,
        prompt,
        resume_session_id=card_state.get("session_id") if is_fix_round else None,
        model=model_choice or os.environ.get("CLAUDE_EXEC_MODEL") or None,
        effort=effort_choice or os.environ.get("CLAUDE_EXEC_EFFORT") or None,
        append_system_prompt=GRAPHIFY_REMINDER,
    )

    # rede de segurança: garante que nada ficou sem commit
    git_ops.commit_all_if_dirty(REPO_DIR, f"WIP automático: {card['name']}")

    areas = git_ops.changed_areas(REPO_DIR, BASE_BRANCH, branch)
    areas_text = ", ".join(areas) if areas else "nenhuma área identificada (backend/frontend/mobile)"

    # Sobe a branch do card pro remoto assim que tudo está commitado (sucesso ou
    # falha) - fica disponível pra você continuar mexendo nela de fora se precisar.
    # Propositalmente NÃO volta pro BASE_BRANCH depois: o repositório fica checked out
    # na própria branch do card, pra qualquer correção manual/nova rodada continuar no
    # mesmo lugar.
    push_res = git_ops.push(REPO_DIR, branch)
    if not push_res.ok:
        log(f"AVISO: não consegui dar push da branch '{branch}': {push_res.output[:200]}")

    if not result.ok:
        if not card_state.get("blocked_notified"):
            send_telegram_message(f"⚠️ Claude Code falhou no card '{card['name']}': {result.result_text[:300]}")
            client.comment_card(
                card_id,
                f"⚠️ Execução falhou:\n{result.result_text}\n\nLog:\n{result.raw_output[-2000:]}",
            )
            state_mod.set_card(state, card_id, blocked_notified=True, branch=branch, model=model_choice, effort=effort_choice)
        log(f"FALHA ({card['name']}): {result.result_text[:200]}")
        return  # tenta de novo no próximo poll

    client.comment_card(
        card_id,
        f"✅ Claude Code terminou (branch `{branch}`, modelo: {model_choice or 'padrão'}, "
        f"effort: {effort_choice or 'padrão'}) - áreas alteradas: {areas_text}\n\n{result.result_text}",
    )
    client.move_card(card_id, list_ids["TEST"])

    state_mod.set_card(
        state,
        card_id,
        last_list_id=list_ids["TEST"],
        stage="dev_done",
        branch=branch,
        model=model_choice,
        effort=effort_choice,
        session_id=result.session_id,
        last_comment_date=now_iso(),
        blocked_notified=False,
    )

    send_telegram_message(
        f"🧪 Pronto pra testar: '{card['name']}'\nÁreas alteradas: {areas_text}\n"
        f"Modelo: {model_choice or 'padrão'} (effort: {effort_choice or 'padrão'})\n"
        f"Branch: {branch}\nCard: {card_url(card)}"
    )
    log(f"Card '{card['name']}' movido para Teste.")


def handle_done(client: TrelloClient, card: dict, state: dict) -> None:
    """Card foi aprovado (movido pra 'Concluído'): dá merge da branch dele na branch
    base. Se der conflito, avisa e deixa marcado como bloqueado pra você resolver na mão."""
    card_id = card["id"]
    card_state = state["cards"][card_id]
    branch = card_state.get("branch")

    if not branch:
        # card foi movido direto pra Concluído sem passar pelo fluxo - nada a mergear.
        state_mod.set_card(state, card_id, last_list_id=card["idList"], stage="done")
        return

    res = git_ops.merge_branch(REPO_DIR, BASE_BRANCH, branch)
    if not res.ok:
        if card_state.get("stage") != "merge_failed":
            send_telegram_message(f"⚠️ Merge de '{card['name']}' (branch {branch}) deu conflito. Resolva manualmente.")
            client.comment_card(card_id, f"⚠️ Merge automático falhou, resolva manualmente:\n{res.output[-1500:]}")
            state_mod.set_card(state, card_id, stage="merge_failed")
        log(f"CONFLITO ao mergear '{card['name']}': {res.output[:200]}")
        return  # não atualiza last_list_id -> tenta de novo (e reconhece se você resolver na mão) a cada poll

    if PUSH_TO_REMOTE:
        git_ops.push(REPO_DIR, BASE_BRANCH)

    git_ops.delete_branch(REPO_DIR, branch)
    state_mod.set_card(state, card_id, last_list_id=card["idList"], stage="merged", built=False)
    log(f"Card '{card['name']}' mergeado em {BASE_BRANCH}.")


def maybe_trigger_build(state: dict, list_ids: dict, cards: list[dict]) -> None:
    active = {list_ids["DOING"], list_ids["DEV"], list_ids["TEST"]}
    any_active = any(c["idList"] in active for c in cards)
    if any_active:
        return

    pending = [cid for cid, cs in state["cards"].items() if cs.get("stage") == "merged" and not cs.get("built")]
    if not pending:
        return

    log(f"Nenhum card ativo e {len(pending)} card(s) mergeado(s) sem build -> disparando eas build...")
    send_telegram_message("🏗️ Todas as tasks concluídas. Iniciando o build do app mobile (EAS)...")

    result = run_mobile_build(MOBILE_DIR, profile=BUILD_PROFILE)
    if result.ok and result.download_url:
        send_telegram_message(f"📱 App pronto! Baixe aqui:\n{result.download_url}")
    elif result.ok:
        send_telegram_message(f"📱 Build concluído, mas não achei o link automaticamente.\n{result.message}")
    else:
        send_telegram_message(f"❌ Build falhou: {result.message[:500]}")
        return  # não marca como built - vai tentar de novo no próximo poll

    for cid in pending:
        state_mod.set_card(state, cid, built=True)


def tick(client: TrelloClient, list_ids: dict) -> None:
    state = state_mod.load()
    cards = client.get_cards()

    for card in cards:
        card_id = card["id"]
        cur_list = card["idList"]
        card_state = state_mod.get_card(state, card_id)
        prev_list = card_state["last_list_id"]

        if cur_list == prev_list:
            continue  # nada mudou pra esse card desde o último poll

        try:
            if cur_list == list_ids["DOING"]:
                handle_doing(client, card, state, list_ids)
            elif cur_list == list_ids["DEV"]:
                handle_dev(client, card, state, list_ids)
            elif cur_list == list_ids["DONE"]:
                handle_done(client, card, state)
            else:
                # entrou numa lista que não gerenciamos (ex: voltou pra "A Fazer") -
                # só atualiza o estado, sem ação.
                state_mod.set_card(state, card_id, last_list_id=cur_list)
        except Exception:
            err = traceback.format_exc()
            log(f"ERRO processando card '{card['name']}':\n{err}")
            if not card_state.get("blocked_notified"):
                send_telegram_message(f"❌ Erro inesperado processando '{card['name']}': {err.splitlines()[-1][:300]}")
                state_mod.set_card(state, card_id, blocked_notified=True)

    maybe_trigger_build(state, list_ids, cards)


def main() -> None:
    required = ["TRELLO_KEY", "TRELLO_TOKEN", "TRELLO_BOARD_ID"]
    missing = [v for v in required if not os.environ.get(v)]
    if missing:
        print(f"Faltam variáveis no automation/.env: {', '.join(missing)}. Veja automation/SETUP.md.")
        sys.exit(1)

    client = TrelloClient()
    list_ids = resolve_list_ids(
        client,
        {
            "DOING": os.environ["TRELLO_LIST_DOING"],
            "DEV": os.environ["TRELLO_LIST_DEV"],
            "TEST": os.environ["TRELLO_LIST_TEST"],
            "DONE": os.environ["TRELLO_LIST_DONE"],
        },
    )

    log(f"Repositório: {REPO_DIR}")
    log(f"Branch base: {BASE_BRANCH}")
    log(f"Listas do Trello resolvidas: {list_ids}")
    send_telegram_message("🤖 Automação Trello ↔ Claude Code iniciada. De olho no board!")

    # Só notifica a PRIMEIRA falha de uma sequência (ex: Trello fora do ar por
    # alguns minutos) - sem isso, cada poll (a cada POLL_INTERVAL_SECONDS) durante
    # uma instabilidade manda outro alerta no Telegram, o que vira spam rápido.
    loop_error_notified = False

    while True:
        try:
            tick(client, list_ids)
            loop_error_notified = False
        except Exception:
            err = traceback.format_exc()
            log(f"ERRO no loop principal:\n{err}")
            if not loop_error_notified:
                send_telegram_message(f"❌ Erro no watcher: {err.splitlines()[-1][:300]}")
                loop_error_notified = True
        time.sleep(POLL_INTERVAL_SECONDS)


if __name__ == "__main__":
    main()

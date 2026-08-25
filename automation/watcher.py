"""
Loop principal da automação Trello -> Claude Code -> Telegram -> EAS Build.

Fluxo (ver automation/SETUP.md para a explicação completa e o passo a passo de
configuração):

  [A Fazer] --(você arrasta)--> [Em Andamento]
        --(watcher: Claude Code, modelo leve, gera o prompt)--> [Em Desenvolvimento]
        --(watcher: Claude Code executa DIRETO na BASE_BRANCH e dá push)--> [Teste]
        --(watcher: avisa no Telegram)
  Você testa. Se estiver ruim, tem duas formas de pedir correção:
    a) só COMENTA no card enquanto ele está em [Teste] (sem arrastar nada) - o watcher
       detecta o comentário sozinho, manda o card de volta pra [Em Andamento],
       redesenha o prompt do zero já com esse comentário, e executa de novo (retomando
       a mesma sessão do Claude Code, pra manter o contexto do que já foi feito).
    b) arrasta na mão de volta pra [Em Desenvolvimento] e comenta o que precisa mudar
       -> o watcher retoma a mesma sessão com esse feedback direto, sem redesenhar o
       prompt (mais rápido, pula a etapa de rascunho).
  Se estiver bom, arrasta pra [Concluído] (não faz nada de git - o trabalho já está
  na BASE_BRANCH desde a etapa anterior; só marca o card como concluído).
  Quando não sobra nenhum card em Em Andamento / Em Desenvolvimento / Teste e existe pelo
  menos um card recém-concluído que tocou mobile/ ainda não "buildado", o watcher
  dispara `eas build` do app mobile e manda o link de download no Telegram.

  Sem branch por card, de propósito - o isolamento de branch+merge-só-quando-aprovado
  não estava sendo usado na prática (ninguém testava antes de aprovar), só
  atrapalhava. Cards criados ANTES dessa mudança que já tinham uma branch própria
  continuam nela até serem concluídos (compatibilidade, ver handle_dev()/handle_done()).

Rode com `python watcher.py` (ou o atalho `iniciaAutomation.bat` na raiz do repo).
Pare com Ctrl+C.
"""

from __future__ import annotations

import os
import re
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
BUILD_PROFILE = os.environ.get("EAS_BUILD_PROFILE", "preview")


def log(msg: str) -> None:
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def card_url(card: dict) -> str:
    return card.get("shortUrl", "")


def now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime())


def _short_summary(text: str, max_len: int = 180) -> str:
    """Resumo de uma linha pras notificações do Telegram - pega só o primeiro
    parágrafo/linha e corta se for muito longo. Não é resumo "de verdade" (não chama
    IA pra isso, seria caro/lento demais só pra uma notificação) - só o suficiente pra
    dar uma ideia rápida do que está rolando sem lotar o celular de texto."""
    text = (text or "").strip()
    if not text:
        return "(sem descrição)"
    first_par = text.split("\n\n")[0].replace("\n", " ").strip()
    if len(first_par) > max_len:
        return first_par[:max_len].rstrip() + "…"
    return first_par


def _extract_objective(prompt_text: str) -> str:
    """O prompt gerado (META_PROMPT_TEMPLATE em claude_prompt.py) sempre começa com
    "1. Objetivo: <frase>" - pega só essa frase pra notificação, em vez do prompt
    inteiro. Se não achar esse padrão (ex: prompt de correção/feedback, que tem outro
    formato), cai pro resumo genérico do texto todo."""
    match = re.search(r"(?im)^\s*1\.\s*Objetivo:\s*(.+)$", prompt_text)
    if match:
        return _short_summary(match.group(1))
    return _short_summary(prompt_text)


def handle_doing(client: TrelloClient, card: dict, state: dict, list_ids: dict) -> None:
    """Card acabou de entrar em 'Em Andamento': gera o prompt com o Claude Code (modelo
    leve) e move pra 'Em Desenvolvimento'."""
    card_id = card["id"]
    log(f"Card '{card['name']}' entrou em Em Andamento -> gerando prompt (Claude Code)...")
    send_telegram_message(
        f"📝 '{card['name']}' entrou em Em Andamento, gerando o prompt - é pra fazer: "
        f"{_short_summary(card.get('desc') or card['name'])}"
    )

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
    """Card está em 'Em Desenvolvimento': roda o Claude Code (autônomo) DIRETO na
    BASE_BRANCH (sem branch por card) e move pra 'Teste' quando terminar. Se o card
    já tinha passado por aqui antes (tem session_id), trata como uma rodada de
    correção retomando a mesma sessão - com o prompt redesenhado do zero se veio de
    check_test_for_new_comment() (stage == "prompted"), ou com um feedback avulso
    montado a partir dos comentários novos se foi arrastado direto de Teste.

    Compatibilidade: um card que JÁ tinha uma branch própria (criado antes da
    automação passar a trabalhar direto na BASE_BRANCH) continua usando essa branch
    até ser concluído, pra não abandonar trabalho em andamento no meio do caminho."""
    card_id = card["id"]
    card_state = state["cards"][card_id]
    is_fix_round = bool(card_state.get("session_id"))
    branch = card_state.get("branch")  # só não-None em cards antigos (compat)
    before_commit = None

    try:
        if branch:
            # Compat: card antigo, continua na própria branch. fresh=True só na
            # rodada inicial desse card especificamente (não deveria acontecer mais
            # em cards novos, mas mantém o comportamento pra quem já estava em curso).
            git_ops.start_card_branch(REPO_DIR, BASE_BRANCH, branch, fresh=not is_fix_round)
        else:
            git_ops.prepare_base_branch(REPO_DIR, BASE_BRANCH)
            before_commit = git_ops.current_commit(REPO_DIR)
    except git_ops.GitError as exc:
        if not card_state.get("blocked_notified"):
            send_telegram_message(f"⚠️ Card '{card['name']}' travado: {exc}")
            client.comment_card(card_id, f"⚠️ Automação travada ao preparar o git:\n{exc}")
            state_mod.set_card(state, card_id, blocked_notified=True)
        log(f"BLOQUEADO ({card['name']}): {exc}")
        return  # não atualiza last_list_id -> tenta de novo no próximo poll

    if is_fix_round and card_state.get("stage") == "prompted":
        # Rodada de correção onde o prompt acabou de ser REDESENHADO do zero (ver
        # check_test_for_new_comment() - card comentado em Teste volta sozinho pra Em
        # Andamento, handle_doing() já rodou de novo e já deixou um prompt novo em
        # card_state["prompt"], já considerando esse comentário). Usa esse prompt novo
        # em vez de montar um feedback avulso, mas ainda retomando a mesma sessão -
        # assim o Claude Code tem instruções novas E lembra o que já fez.
        prompt = card_state.get("prompt")
        model_choice = card_state.get("model")
        effort_choice = card_state.get("effort")
        log(f"Card '{card['name']}' reprocessando com prompt redesenhado (retomando sessão {card_state['session_id']}).")
    elif is_fix_round:
        # Rodada de correção "clássica": card foi arrastado direto de Teste pra Em
        # Desenvolvimento (sem passar por Em Andamento de novo), então não tem prompt
        # redesenhado - monta um feedback avulso a partir dos comentários novos.
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
            send_telegram_message(
                f"📝 '{card['name']}' entrou direto em Em Desenvolvimento, gerando o prompt - é pra fazer: "
                f"{_short_summary(card.get('desc') or card['name'])}"
            )
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

    send_telegram_message(
        f"🚀 '{card['name']}' está sendo executado (modelo: {model_choice or 'padrão'}, "
        f"effort: {effort_choice or 'padrão'}) - vou: {_extract_objective(prompt)}"
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

    if branch:
        areas = git_ops.changed_areas(REPO_DIR, BASE_BRANCH, branch)
    else:
        areas = git_ops.changed_areas_since(REPO_DIR, before_commit)
    areas_text = ", ".join(areas) if areas else "nenhuma área identificada (backend/frontend/mobile)"

    # Sobe pro remoto assim que tudo está commitado (sucesso ou falha) - branch do
    # card se for um card antigo (compat), ou a própria BASE_BRANCH direto no fluxo
    # atual ("manda pra frente"). Propositalmente NÃO troca de branch depois: o
    # repositório fica checked out onde já está, pra qualquer correção manual/nova
    # rodada continuar no mesmo lugar.
    push_target = branch or BASE_BRANCH
    push_res = git_ops.push(REPO_DIR, push_target)
    if not push_res.ok:
        log(f"AVISO: não consegui dar push de '{push_target}': {push_res.output[:200]}")

    where = f"branch `{branch}`" if branch else f"direto em `{BASE_BRANCH}`"

    if not result.ok:
        if not card_state.get("blocked_notified"):
            send_telegram_message(f"⚠️ Claude Code falhou no card '{card['name']}': {_short_summary(result.result_text, 280)}")
            client.comment_card(
                card_id,
                f"⚠️ Execução falhou:\n{result.result_text}\n\nLog:\n{result.raw_output[-2000:]}",
            )
            state_mod.set_card(state, card_id, blocked_notified=True, branch=branch, model=model_choice, effort=effort_choice)
        log(f"FALHA ({card['name']}): {result.result_text[:200]}")
        return  # tenta de novo no próximo poll

    client.comment_card(
        card_id,
        f"✅ Claude Code terminou ({where}, modelo: {model_choice or 'padrão'}, "
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
        areas=areas,
        session_id=result.session_id,
        last_comment_date=now_iso(),
        blocked_notified=False,
    )

    send_telegram_message(
        f"🧪 Pronto pra testar: '{card['name']}'\nFiz: {_short_summary(result.result_text)}\n"
        f"Áreas alteradas: {areas_text}\n"
        f"Modelo: {model_choice or 'padrão'} (effort: {effort_choice or 'padrão'})\n"
        f"{where.capitalize()}\nCard: {card_url(card)}"
    )
    log(f"Card '{card['name']}' movido para Teste.")


def handle_done(client: TrelloClient, card: dict, state: dict) -> None:
    """Card foi aprovado (movido pra 'Concluído'). No fluxo atual (sem branch por
    card) isso é um no-op de git: o trabalho já foi commitado e empurrado direto pra
    BASE_BRANCH lá em handle_dev(), só marca o card como concluído. Compatibilidade:
    se o card tem uma branch própria registrada (criado antes dessa mudança), dá
    merge dela na branch base como antes - avisa e deixa bloqueado pra você resolver
    na mão se der conflito."""
    card_id = card["id"]
    card_state = state["cards"][card_id]
    branch = card_state.get("branch")

    if not branch:
        # Fluxo atual: nada a mergear, o trabalho já está na BASE_BRANCH.
        state_mod.set_card(state, card_id, last_list_id=card["idList"], stage="done")
        log(f"Card '{card['name']}' concluído (já estava em {BASE_BRANCH}, nada a mergear).")
        return

    res = git_ops.merge_branch(REPO_DIR, BASE_BRANCH, branch)
    if not res.ok:
        if card_state.get("stage") != "merge_failed":
            send_telegram_message(f"⚠️ Merge de '{card['name']}' (branch {branch}) deu conflito. Resolva manualmente.")
            client.comment_card(card_id, f"⚠️ Merge automático falhou, resolva manualmente:\n{res.output[-1500:]}")
            state_mod.set_card(state, card_id, stage="merge_failed")
        log(f"CONFLITO ao mergear '{card['name']}': {res.output[:200]}")
        return  # não atualiza last_list_id -> tenta de novo (e reconhece se você resolver na mão) a cada poll

    # Sempre sobe pro remoto depois do merge, consistente com o fluxo atual (que
    # também sempre dá push, sem flag) - não faz sentido mergear localmente e deixar
    # só na sua máquina.
    push_res = git_ops.push(REPO_DIR, BASE_BRANCH)
    if not push_res.ok:
        log(f"AVISO: não consegui dar push de '{BASE_BRANCH}' depois do merge: {push_res.output[:200]}")

    git_ops.delete_branch(REPO_DIR, branch)
    state_mod.set_card(state, card_id, last_list_id=card["idList"], stage="merged", built=False)
    log(f"Card '{card['name']}' mergeado em {BASE_BRANCH}.")


def check_test_for_new_comment(client: TrelloClient, card: dict, state: dict, list_ids: dict) -> bool:
    """Card está em 'Teste' - normalmente não tem nada a fazer aqui (espera você
    testar e arrastar manualmente pra 'Concluído' ou 'Em Desenvolvimento'). Mas se
    aparecer um comentário novo desde a última rodada, trata como um pedido de
    correção automático: manda o card sozinho de volta pra 'Em Andamento', sem
    precisar arrastar nada na mão. Devolve True se moveu o card (não atualiza
    last_list_id de propósito - mesmo padrão de handle_doing()/handle_dev(): deixa o
    PRÓXIMO poll comparar contra o estado real do Trello, já em 'Em Andamento', e
    disparar handle_doing() normalmente - que redesenha o prompt do zero já
    considerando esse comentário, e daí handle_dev() executa ele em seguida."""
    card_id = card["id"]
    card_state = state["cards"][card_id]
    last_seen = card_state.get("last_comment_date") or ""
    comments = client.get_comments(card_id)
    new_comments = [c for c in comments if c.get("date", "") > last_seen and c.get("data", {}).get("text")]
    if not new_comments:
        return False

    log(f"Novo comentário em '{card['name']}' (Teste) -> mandando de volta pra Em Andamento pra reprocessar.")
    send_telegram_message(
        f"💬 Novo comentário em '{card['name']}' (Teste) - reiniciando o ciclo "
        f"automaticamente (Em Andamento)."
    )
    client.move_card(card_id, list_ids["DOING"])
    return True


def maybe_trigger_build(state: dict, list_ids: dict, cards: list[dict]) -> None:
    active = {list_ids["DOING"], list_ids["DEV"], list_ids["TEST"]}
    any_active = any(c["idList"] in active for c in cards)
    if any_active:
        return

    # "done" = fluxo atual (handle_done marca assim quando não tem branch pra
    # mergear, já que o trabalho já estava na BASE_BRANCH); "merged" = compat com
    # cards antigos que tinham branch própria.
    unbuilt = [
        (cid, cs) for cid, cs in state["cards"].items()
        if cs.get("stage") in ("done", "merged") and not cs.get("built")
    ]
    if not unbuilt:
        return

    # Só builda o mobile se algum card mergeado de fato mexeu em mobile/ - antes disso
    # todo merge disparava um `eas build`, mesmo pra cards 100% backend/frontend, o que
    # só gastava cota de build à toa. Cards sem "areas" registrado (mergeados antes
    # dessa informação existir) continuam builadando por segurança, já que não dá pra
    # saber o que mudaram.
    needs_build = [cid for cid, cs in unbuilt if cs.get("areas") is None or "Mobile" in cs.get("areas")]
    skip_build = [cid for cid, cs in unbuilt if cid not in needs_build]

    for cid in skip_build:
        state_mod.set_card(state, cid, built=True)
    if skip_build:
        log(f"{len(skip_build)} card(s) mergeado(s) não mexeram em mobile/ - pulando build do EAS pra eles.")

    if not needs_build:
        return

    log(f"Nenhum card ativo e {len(needs_build)} card(s) mergeado(s) tocaram mobile/ sem build -> disparando eas build...")
    send_telegram_message("🏗️ Todas as tasks concluídas. Iniciando o build do app mobile (EAS)...")

    result = run_mobile_build(MOBILE_DIR, profile=BUILD_PROFILE)
    if result.ok and result.download_url:
        send_telegram_message(f"📱 App pronto! Baixe aqui:\n{result.download_url}")
    elif result.ok:
        send_telegram_message(f"📱 Build concluído, mas não achei o link automaticamente.\n{result.message}")
    else:
        send_telegram_message(f"❌ Build falhou: {result.message[:500]}")
        return  # não marca como built - vai tentar de novo no próximo poll

    for cid in needs_build:
        state_mod.set_card(state, cid, built=True)


def tick(client: TrelloClient, list_ids: dict) -> None:
    state = state_mod.load()
    cards = client.get_cards()

    for card in cards:
        card_id = card["id"]
        cur_list = card["idList"]
        card_state = state_mod.get_card(state, card_id)
        prev_list = card_state["last_list_id"]

        try:
            # Card parado em "Teste" (cur_list == prev_list, cai fora do "nada mudou"
            # abaixo) ainda pode ter algo pra fazer: um comentário novo dispara
            # reprocessamento automático - ver check_test_for_new_comment().
            if cur_list == list_ids["TEST"] and check_test_for_new_comment(client, card, state, list_ids):
                continue

            if cur_list == prev_list:
                continue  # nada mudou pra esse card desde o último poll

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

    version = git_ops.automation_version(REPO_DIR)
    log(f"Repositório: {REPO_DIR}")
    log(f"Versão da automação: {version}")
    log(f"Branch base: {BASE_BRANCH}")
    log(f"Listas do Trello resolvidas: {list_ids}")
    send_telegram_message(f"🤖 Automação Trello ↔ Claude Code iniciada (versão {version}). De olho no board!")

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

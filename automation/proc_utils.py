"""
Resolve o comando completo pra chamar um executável instalado via npm (`claude`,
`eas`) antes de passar pro subprocess - conserta um problema clássico do Windows.

No Windows, `claude` e `eas` (instalados com `npm install -g`) normalmente não são um
`.exe` de verdade: são shims `.CMD` e/ou `.PS1` que o npm cria. `subprocess.run(["claude",
...])` em Python, sem passar pelo `cmd.exe`, delega direto pra API do Windows
(`CreateProcess`), que tem duas limitações que pegam esse caso:

1. Ao receber um nome SEM extensão, só tenta completar com `.exe` sozinha - nunca
   `.cmd`/`.bat`. `shutil.which()` já resolve isso (respeita a PATHEXT do Windows, que
   inclui .CMD/.BAT por padrão).
2. `.PS1` (script de PowerShell) NÃO está na PATHEXT por padrão em nenhuma instalação
   do Windows (é proposital, por segurança) - então nem `shutil.which()` nem o próprio
   Windows acham um `claude.ps1` sozinhos. Se a sua instalação só criou o `.ps1` (sem
   `.cmd`), CreateProcess não consegue executá-lo diretamente de jeito nenhum (não é um
   binário, precisa do interpretador do PowerShell) - por isso fazemos uma busca manual
   cobrindo `.ps1` também, e nesse caso devolvemos o comando através do
   `powershell -File <script>` em vez do caminho puro.

Em Linux/Mac isso não muda nada na prática (`shutil.which` já resolve certinho e os
binários já são executáveis de verdade), então é seguro chamar sempre, nas duas
plataformas.
"""

from __future__ import annotations

import os
import shutil
import sys

# Extensões que o Windows NÃO tenta resolver sozinho quando você só dá o nome sem
# extensão (.CMD/.BAT/.EXE geralmente já estão na PATHEXT do usuário, mas cobrimos
# de novo aqui só por garantia; .PS1 quase nunca está).
_WINDOWS_EXTRA_EXTS = [".CMD", ".BAT", ".EXE", ".PS1", ".COM"]


def _manual_path_search(name: str) -> str | None:
    path_dirs = os.environ.get("PATH", "").split(os.pathsep)
    exts = [""] + (_WINDOWS_EXTRA_EXTS if sys.platform == "win32" else [])
    for directory in path_dirs:
        if not directory:
            continue
        for ext in exts:
            candidate = os.path.join(directory, name + ext)
            if os.path.isfile(candidate):
                return candidate
    return None


def resolve_command(name: str) -> list[str]:
    """Devolve a lista de argumentos (prefixo) que executa `name` corretamente.

    Ex: `resolve_command("claude")` pode devolver `["C:\\...\\claude.CMD"]` ou, se só
    existir um `.ps1`, `["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
    "-File", "C:\\...\\claude.ps1"]`. Em caso de já ser um caminho explícito (ex: você
    setou CLAUDE_CLI_PATH no .env) ou de não achar nada, devolve `[name]` sem
    alteração - nesse caso o erro original ("comando não encontrado") aparece na hora
    de rodar, em vez de mascarar o problema aqui.
    """
    if not name:
        raise ValueError(
            "resolve_command() recebeu um nome vazio. Isso normalmente significa que uma "
            "variável de ambiente tipo CLAUDE_CLI_PATH/EAS_CLI_PATH está definida no .env "
            "como string vazia (ex: `CLAUDE_CLI_PATH=`) e foi lida com "
            "`os.environ.get('X', default)` - que só usa o default quando a chave não "
            "existe, não quando ela existe mas está vazia. Use `os.environ.get('X') or "
            "default` no lugar disso."
        )

    resolved = shutil.which(name) or _manual_path_search(name) or name

    if resolved.lower().endswith(".ps1"):
        return ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolved]
    return [resolved]

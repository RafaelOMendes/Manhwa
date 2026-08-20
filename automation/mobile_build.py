"""
Dispara um build do app mobile via EAS Build (perfil "preview", que gera um .apk
instalável direto - ver mobile/eas.json) e tenta extrair o link de download do
resultado.

Roda `eas build --platform android --profile preview --non-interactive --json`,
que (segundo a doc oficial do EAS CLI) espera o build terminar e imprime um JSON no
stdout. O formato exato de campos pode variar entre versões do eas-cli, então aqui a
gente tenta os caminhos mais comuns e, se não achar, devolve o JSON bruto + o id do
build pra você conseguir achar o link manualmente em https://expo.dev.
"""

from __future__ import annotations

import json
import os
import subprocess
from dataclasses import dataclass
from pathlib import Path

DEFAULT_TIMEOUT_SECONDS = int(os.environ.get("EAS_BUILD_TIMEOUT_SECONDS", str(60 * 30)))


@dataclass
class BuildResult:
    ok: bool
    download_url: str | None
    build_id: str | None
    message: str


def _extract_download_url(build_entry: dict) -> str | None:
    candidates = [
        build_entry.get("artifacts", {}).get("buildUrl") if isinstance(build_entry.get("artifacts"), dict) else None,
        build_entry.get("artifacts", {}).get("applicationArchiveUrl") if isinstance(build_entry.get("artifacts"), dict) else None,
        build_entry.get("buildUrl"),
        build_entry.get("url"),
    ]
    for c in candidates:
        if c:
            return c
    return None


def run_mobile_build(mobile_dir: Path, profile: str = "preview") -> BuildResult:
    eas_bin = os.environ.get("EAS_CLI_PATH", "eas")
    args = [
        eas_bin,
        "build",
        "--platform",
        "android",
        "--profile",
        profile,
        "--non-interactive",
        "--json",
    ]
    try:
        proc = subprocess.run(
            args,
            cwd=str(mobile_dir),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            timeout=DEFAULT_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired:
        return BuildResult(
            ok=False,
            download_url=None,
            build_id=None,
            message=f"Timeout depois de {DEFAULT_TIMEOUT_SECONDS}s esperando o `eas build`.",
        )

    stdout = proc.stdout or ""
    stderr = proc.stderr or ""

    # --json manda mensagens não-JSON pro stderr; o JSON de verdade vai pro stdout.
    parsed = None
    try:
        parsed = json.loads(stdout)
    except json.JSONDecodeError:
        for line in reversed(stdout.splitlines()):
            line = line.strip()
            if line.startswith("{") or line.startswith("["):
                try:
                    parsed = json.loads(line)
                    break
                except json.JSONDecodeError:
                    continue

    if proc.returncode != 0 or parsed is None:
        tail = (stdout + "\n" + stderr).strip()[-2000:]
        return BuildResult(
            ok=False,
            download_url=None,
            build_id=None,
            message=f"`eas build` falhou ou não devolveu JSON reconhecível. Saída:\n{tail}",
        )

    entry = parsed[0] if isinstance(parsed, list) and parsed else parsed
    if not isinstance(entry, dict):
        return BuildResult(ok=False, download_url=None, build_id=None, message=f"JSON inesperado: {parsed}")

    build_id = entry.get("id")
    status = entry.get("status")
    download_url = _extract_download_url(entry)

    if status and status != "FINISHED":
        return BuildResult(
            ok=False,
            download_url=download_url,
            build_id=build_id,
            message=f"Build terminou com status '{status}' (esperado FINISHED). Confira em https://expo.dev.",
        )

    if not download_url:
        return BuildResult(
            ok=True,
            download_url=None,
            build_id=build_id,
            message=(
                "Build parece ter terminado mas não encontrei o campo de URL no JSON. "
                f"Procure pelo build id {build_id} em https://expo.dev para pegar o link."
            ),
        )

    return BuildResult(ok=True, download_url=download_url, build_id=build_id, message="Build concluído.")

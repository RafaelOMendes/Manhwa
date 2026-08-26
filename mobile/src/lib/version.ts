// Versão exibida no app. Fica no bundle JS, então o `eas update` (OTA) atualiza
// ela — diferente de Constants.expoConfig.version, que é gravada no build nativo
// e NÃO muda via update.
// ⚠️ Bumpe SÓ esta constante a cada mudança entregue via `eas update`.
// NÃO toque no `expo.version` do app.json em updates OTA — ele faz parte do
// fingerprint/runtimeVersion e mudá-lo impede o update de chegar nos APKs
// instalados. Ver mobile/AGENTS.md.
export const APP_VERSION = '1.3.0';

// Versão exibida no app. Fica no bundle JS, então o `eas update` (OTA) atualiza
// ela — diferente de Constants.expoConfig.version, que é gravada no build nativo
// e NÃO muda via update.
// ⚠️ Bumpe ESTA constante (e o `version` do app.json) a cada mudança entregue.
export const APP_VERSION = '1.1.9';

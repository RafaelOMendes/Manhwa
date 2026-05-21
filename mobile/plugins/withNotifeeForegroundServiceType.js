const { withAndroidManifest } = require('@expo/config-plugins');

/**
 * O notifee declara o ForegroundService como `shortService` no manifesto do
 * core AAR, o que no Android 14+ limita o serviço a ~3 minutos. Para downloads
 * longos (muitos capítulos) precisamos do tipo `dataSync`. Este plugin
 * sobrescreve o foregroundServiceType do serviço do notifee via manifest merge.
 */
const SERVICE_NAME = 'app.notifee.core.ForegroundService';

module.exports = function withNotifeeForegroundServiceType(config) {
    return withAndroidManifest(config, (cfg) => {
        const manifest = cfg.modResults.manifest;

        // Garante o namespace `tools` (necessário pro tools:replace).
        manifest.$ = manifest.$ || {};
        manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

        const app = manifest.application && manifest.application[0];
        if (!app) return cfg;
        if (!app.service) app.service = [];

        let svc = app.service.find(
            (s) => s.$ && s.$['android:name'] === SERVICE_NAME
        );
        if (!svc) {
            svc = { $: { 'android:name': SERVICE_NAME } };
            app.service.push(svc);
        }
        svc.$['android:exported'] = 'false';
        svc.$['android:foregroundServiceType'] = 'dataSync';
        svc.$['tools:replace'] = 'android:foregroundServiceType';

        return cfg;
    });
};

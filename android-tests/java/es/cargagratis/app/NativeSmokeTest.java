package es.cargagratis.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import android.content.Context;
import android.accessibilityservice.AccessibilityService;
import android.os.SystemClock;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileInputStream;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs the packaged application in a real Android WebView, without HTTP fixtures. */
@RunWith(AndroidJUnit4.class)
public class NativeSmokeTest {
    private static final String CATALOG_CACHE = "cg-catalog-v1";
    private static final String NATIONAL_PATH = "data/chargers-spain.json";
    private static final String CACHE_KEY = "/__cg_catalog_cache_v1__/" + NATIONAL_PATH;
    private static final String NATIVE_FIXTURE_NAME = "Fixture nativa de caché persistente";
    private ActivityScenario<MainActivity> scenario;

    @Before
    public void openBundledApplication() throws Exception {
        scenario = ActivityScenario.launch(MainActivity.class);
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        String version = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionName;
        awaitCondition("El WebView debe iniciar la versión empaquetada " + version,
            "(document.querySelector('header small')?.textContent || '').includes(" + JSONObject.quote("v" + version) + ")");
        awaitCondition("El catálogo real empaquetado debe estar cargado antes de interactuar",
            "document.querySelector('.titleRow .muted')?.textContent.includes('puntos cargados de catálogo')");
        awaitCondition("El puente real de Capacitor debe ser Android",
            "window.Capacitor?.isNativePlatform() && window.Capacitor.getPlatform() === 'android'");
    }

    @After
    public void closeApplication() {
        if (scenario != null) scenario.close();
    }

    @Test(timeout = 90000)
    public void startsBundledApplicationAndLegalNotice() throws Exception {
        awaitCondition("El aviso de gratuidad y responsabilidad debe estar en el inicio",
            "(() => { const notice = document.querySelector('.legalNotice'); return !!notice && notice.textContent.includes('gratuita') && notice.textContent.includes('responsabilidad del usuario') && notice.textContent.includes('el autor no asume responsabilidad'); })()");
        awaitCondition("El aviso debe preceder al mapa en el documento",
            "(() => { const notice = document.querySelector('.legalNotice'), map = document.querySelector('#map'); return !!notice && !!map && !!(notice.compareDocumentPosition(map) & Node.DOCUMENT_POSITION_FOLLOWING); })()");
    }

    @Test(timeout = 90000)
    public void opensThreeDestinationPlanner() throws Exception {
        clickButton("nav", "viaje");
        awaitCondition("Debe abrirse el planificador real", "document.querySelector('h1')?.textContent === 'Ruta 0 €'");
        clickButton("section", "3 destinos");
        awaitCondition("Deben mostrarse los tres campos de destino",
            "[1,2,3].every(n => [...document.querySelectorAll('section label')].some(label => label.textContent.trim().startsWith('Destino ' + n) && label.querySelector('input')))");
        awaitCondition("Debe conservarse el presupuesto acordado por distancia",
            "document.querySelector('section')?.textContent.includes('4 segundos por cada 100 km')");
    }

    @Test(timeout = 90000)
    public void switchesVehicleProfilesAndCompatibleConnectors() throws Exception {
        clickButton("nav", "vehículo");
        awaitCondition("Debe abrirse el perfil del vehículo", "document.querySelector('h1')?.textContent === 'Mi vehículo'");
        clickButton("section", "Renault Zoe R90");
        awaitCondition("El Zoe debe seleccionar Tipo 2 sin CCS",
            "(() => { const group = document.querySelector('[aria-label=\"Conectores del vehículo\"]'); const button = name => [...(group?.querySelectorAll('button') || [])].find(b => b.textContent.trim() === name); return button('Tipo 2')?.getAttribute('aria-pressed') === 'true' && button('CCS')?.getAttribute('aria-pressed') === 'false'; })()");
        awaitCondition("El Zoe no debe admitir carga DC",
            "[...document.querySelectorAll('label')].some(label => label.textContent.includes('Potencia máxima de carga DC') && label.querySelector('input')?.disabled && label.querySelector('input')?.value === '0')");
        clickButton("section", "Tesla Model Y Standard Range");
        awaitCondition("Model Y debe recuperar sus filtros guardados: Todos o CCS y Tipo 2",
            "(() => { const buttons = [...(document.querySelector('[aria-label=\"Conectores del vehículo\"]')?.querySelectorAll('button') || [])]; return buttons.some(b => b.textContent.trim() === 'Todos' && b.getAttribute('aria-pressed') === 'true') || ['CCS','Tipo 2'].every(name => buttons.some(b => b.textContent.trim() === name && b.getAttribute('aria-pressed') === 'true')); })()");
        awaitCondition("El perfil Model Y debe restaurar el límite AC de 11 kW",
            "[...document.querySelectorAll('label')].some(label => label.textContent.includes('Potencia máxima AC') && label.querySelector('input')?.value === '11')");
    }

    @Test(timeout = 90000)
    public void opensBackupControlsWithNativePlugins() throws Exception {
        clickButton("nav", "seguridad");
        awaitCondition("Debe abrirse la seguridad y copia de datos",
            "document.querySelector('h1')?.textContent === 'Seguridad y privacidad' && [...document.querySelectorAll('h2')].some(h => h.textContent === 'Copia de seguridad')");
        awaitCondition("La copia debe ofrecer exportación e importación explícitas",
            "[...document.querySelectorAll('button')].some(b => b.textContent.trim() === 'Exportar copia JSON') && [...document.querySelectorAll('label')].some(label => label.textContent.includes('Seleccionar copia JSON') && label.querySelector('input[type=file]'))");
        awaitCondition("Filesystem y Share deben estar registrados en Android",
            "window.Capacitor.isPluginAvailable('Filesystem') && window.Capacitor.isPluginAvailable('Share')");

        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File backupFile = new File(context.getCacheDir(), "cargagratis-copia.json");
        if (backupFile.exists()) assertTrue("No se pudo limpiar la copia anterior del emulador", backupFile.delete());
        assertEquals("true", evaluate("(() => { localStorage.setItem('cg_geo_photon_v1_android_smoke', 'cache-no-exportable'); localStorage.setItem('cg_soc', 'NaN'); localStorage.setItem('cg_favorites', JSON.stringify(['native-smoke-favorite'])); return true; })()"));
        clickButton("section", "Exportar copia JSON");
        JSONObject backup = awaitBackupFile(backupFile);
        assertEquals("cargagratis-personal-data", backup.getString("format"));
        assertEquals(1, backup.getInt("version"));
        JSONObject settings = backup.getJSONObject("settings");
        assertTrue("La copia debe conservar datos válidos", settings.getJSONArray("cg_favorites").toString().contains("native-smoke-favorite"));
        assertTrue("La caché de geocodificación no debe exportarse", !settings.has("cg_geo_photon_v1_android_smoke"));
        assertTrue("Un valor SOC inválido no debe exportarse", !settings.has("cg_soc"));
        closeShareChooser();
        awaitCondition("La aplicación debe seguir operativa al cerrar el diálogo de compartir",
            "[...document.querySelectorAll('h2')].some(h => h.textContent === 'Copia de seguridad')");
        evaluate("(() => { localStorage.removeItem('cg_geo_photon_v1_android_smoke'); localStorage.removeItem('cg_favorites'); localStorage.setItem('cg_soc', '90'); return true; })()");
    }

    @Test(timeout = 150000)
    public void reopensWithPersistentCatalogCache() throws Exception {
        clickButton("nav", "seguridad");
        awaitCatalogSynchronization();
        String backupName = "cg-native-catalog-backup-" + SystemClock.elapsedRealtime();
        long savedAt = System.currentTimeMillis();
        JSONObject fixture = cachedNationalFixture(savedAt);
        String cacheName = JSONObject.quote(CATALOG_CACHE), backup = JSONObject.quote(backupName);
        String key = "new URL(" + JSONObject.quote(CACHE_KEY) + ", location.origin).href";
        try {
            runAsyncJavascript("Guardar fixture exclusivamente de instrumentación en CacheStorage",
                "const key = " + key + ", cache = await caches.open(" + cacheName + "), backup = await caches.open(" + backup + ");" +
                "const previous = await cache.match(key); if (previous) await backup.put(key, previous.clone());" +
                "await backup.put(new URL('/__native_catalog_backup_ready__', location.origin).href, new Response('ready'));" +
                "await cache.put(key, new Response(" + JSONObject.quote(fixture.toString()) + ", {headers:{'Content-Type':'application/json'}}));");
            scenario.close();
            scenario = null;
            openBundledApplication();
            awaitCondition("La aplicación reabierta debe mostrar las estaciones de la caché persistente real",
                "document.body.textContent.includes(" + JSONObject.quote(NATIVE_FIXTURE_NAME + " A") + ") && document.body.textContent.includes(" + JSONObject.quote(NATIVE_FIXTURE_NAME + " B") + ")");
            clickButton("nav", "seguridad");
            awaitCatalogSynchronization();
            awaitCondition("El catálogo nacional debe identificarse como guardado, sin atribuirlo a otra fuente",
                "document.querySelector('[data-catalog-resource=\"national\"]')?.getAttribute('data-catalog-source') === 'cached'");
            runAsyncJavascript("La reapertura no debe renovar la fecha de descarga ni la de los datos",
                "const response = await (await caches.open(" + cacheName + ")).match(" + key + ");" +
                "if (!response) throw Error('La caché nacional no persistió'); const record = await response.json();" +
                "if (record.savedAt !== " + savedAt + " || record.data.updated !== '2020-01-02T03:04:05.000Z') throw Error('Se alteraron las fechas de la copia guardada');" +
                "if (record.data.chargers.length !== 2) throw Error('No se recuperó el fixture de instrumentación');");
        } finally {
            if (scenario == null) openBundledApplication();
            runAsyncJavascript("Restaurar la caché anterior y borrar el fixture de instrumentación",
                "const key = " + key + ", cache = await caches.open(" + cacheName + "), backup = await caches.open(" + backup + ");" +
                "const ready = await backup.match(new URL('/__native_catalog_backup_ready__', location.origin).href);" +
                "if (ready) { const previous = await backup.match(key); if (previous) await cache.put(key, previous); else await cache.delete(key); }" +
                "await caches.delete(" + backup + ");");
        }
    }

    @Test(timeout = 120000)
    public void refreshesPublishedCatalogsInRealWebView() throws Exception {
        clickButton("nav", "seguridad");
        awaitCatalogSynchronization();
        String cacheName = JSONObject.quote(CATALOG_CACHE);
        String key = "new URL(" + JSONObject.quote(CACHE_KEY) + ", location.origin).href";
        runAsyncJavascript("Leer el instante de la copia previa a la actualización pública",
            "const response = await (await caches.open(" + cacheName + ")).match(" + key + ");" +
            "const record = response ? await response.json() : null; window.__nativeCatalogPreviousSavedAt = record?.savedAt || 0;");
        assertEquals("true", evaluate("(() => { const region = document.querySelector('[aria-label=\"Estado de los catálogos\"]'); if (!region) return false; window.__nativeCatalogSawBusy = false; window.__nativeCatalogObserver = new MutationObserver(() => { if (region.getAttribute('aria-busy') === 'true') window.__nativeCatalogSawBusy = true; }); window.__nativeCatalogObserver.observe(region, {attributes:true,attributeFilter:['aria-busy']}); return true; })()"));
        try {
            clickButton("[aria-label=\"Estado de los catálogos\"]", "Actualizar catálogos");
            awaitCondition("La actualización manual debe iniciar la consulta real",
                "window.__nativeCatalogSawBusy === true");
            awaitCatalogSynchronization();
            assertEquals("La descarga pública nacional debe superar CORS/TLS y validar el JSON real", "true",
                evaluate("document.querySelector('[data-catalog-resource=\"national\"]')?.getAttribute('data-catalog-source') === 'published'"));
            runAsyncJavascript("La publicación real debe renovar la caché con un inventario válido",
                "const response = await (await caches.open(" + cacheName + ")).match(" + key + ");" +
                "if (!response) throw Error('No se guardó el catálogo publicado'); const record = await response.json();" +
                "if (!(record.savedAt > window.__nativeCatalogPreviousSavedAt)) throw Error('No se renovó la descarga al forzar la actualización');" +
                "if (record.version !== 1 || record.path !== 'data/chargers-spain.json' || !Array.isArray(record.data?.chargers) || !record.data.chargers.length) throw Error('La respuesta publicada no contiene inventario válido');" +
                "if (record.data.chargers.some(station => station.id.startsWith('native-cache-') || !Number.isFinite(station.lat) || !Number.isFinite(station.lng) || !(station.price === null || Number.isFinite(station.price)))) throw Error('La publicación contiene datos inesperados');");
        } finally {
            evaluate("(() => { window.__nativeCatalogObserver?.disconnect(); delete window.__nativeCatalogObserver; delete window.__nativeCatalogSawBusy; delete window.__nativeCatalogPreviousSavedAt; return true; })()");
        }
    }

    private void awaitCatalogSynchronization() throws Exception {
        awaitCondition("La sincronización de catálogos debe terminar dentro de su plazo",
            "(() => { const region = document.querySelector('[aria-label=\"Estado de los catálogos\"]'); const button = [...(region?.querySelectorAll('button') || [])].find(b => b.textContent.trim() === 'Actualizar catálogos'); return !!region && region.getAttribute('aria-busy') === 'false' && !!button && !button.disabled; })()");
    }

    private JSONObject cachedNationalFixture(long savedAt) throws Exception {
        JSONArray stations = new JSONArray();
        for (int i = 0; i < 2; i++) {
            JSONArray sockets = new JSONArray()
                .put(new JSONObject().put("type", "CCS").put("powerKw", 150))
                .put(new JSONObject().put("type", "Tipo2").put("powerKw", 22));
            stations.put(new JSONObject()
                .put("id", "native-cache-" + i).put("name", NATIVE_FIXTURE_NAME + (i == 0 ? " A" : " B"))
                .put("city", "Madrid").put("lat", 40.4168 + i * .001).put("lng", -3.7038)
                .put("power", 150).put("connector", "CCS,Tipo2").put("connectors", sockets)
                .put("price", JSONObject.NULL).put("country", "ES")
                .put("source", "Fixture sintética exclusiva de instrumentación")
                .put("sourceUrl", "https://example.org/native-cache-fixture")
                .put("verified", "Sin verificar: fixture de prueba").put("availability", "Desconocida"));
        }
        JSONObject data = new JSONObject().put("updated", "2020-01-02T03:04:05.000Z").put("chargers", stations);
        return new JSONObject().put("version", 1).put("path", NATIONAL_PATH).put("savedAt", savedAt).put("data", data);
    }

    private void runAsyncJavascript(String description, String body) throws Exception {
        String script = "(() => { window.__nativeCatalogSmokeState = 'pending'; (async () => { " + body +
            " })().then(() => { window.__nativeCatalogSmokeState = 'done'; }, error => { window.__nativeCatalogSmokeState = 'error: ' + error.message; }); return true; })()";
        assertEquals("true", evaluate(script));
        long deadline = SystemClock.elapsedRealtime() + 45000;
        do {
            String state = evaluate("window.__nativeCatalogSmokeState", Math.min(15000, Math.max(1, deadline - SystemClock.elapsedRealtime())));
            if (JSONObject.quote("done").equals(state)) return;
            if (state != null && state.startsWith("\"error:")) fail(description + ": " + state);
            SystemClock.sleep(200);
        } while (SystemClock.elapsedRealtime() < deadline);
        fail(description + ": CacheStorage no terminó dentro del plazo");
    }

    private void clickButton(String scope, String name) throws Exception {
        String selector = JSONObject.quote(scope + " button");
        String label = JSONObject.quote(name);
        assertEquals("No se encontró el botón " + name, "true", evaluate(
            "(() => { const button = [...document.querySelectorAll(" + selector + ")].find(b => b.textContent.trim() === " + label + "); if (!button || button.disabled) return false; button.click(); return true; })()"));
    }

    private void awaitCondition(String description, String expression) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 45000;
        String last = "sin respuesta";
        do {
            last = evaluate("(() => { try { return Boolean(" + expression + "); } catch (error) { return false; } })()",
                Math.min(15000, Math.max(1, deadline - SystemClock.elapsedRealtime())));
            if ("true".equals(last)) return;
            SystemClock.sleep(200);
        } while (SystemClock.elapsedRealtime() < deadline);
        fail(description + ". Última respuesta JavaScript: " + last);
    }

    private String evaluate(String expression) throws Exception {
        return evaluate(expression, 15000);
    }

    private String evaluate(String expression, long timeoutMs) throws Exception {
        CountDownLatch answered = new CountDownLatch(1);
        AtomicReference<String> result = new AtomicReference<>();
        scenario.onActivity(activity -> {
            assertNotNull("Falta el puente de Capacitor", activity.getBridge());
            WebView webView = activity.getBridge().getWebView();
            assertNotNull("Falta el WebView real", webView);
            webView.evaluateJavascript(expression, value -> { result.set(value); answered.countDown(); });
        });
        assertTrue("El WebView no respondió a JavaScript dentro de " + timeoutMs + " ms", answered.await(timeoutMs, TimeUnit.MILLISECONDS));
        return result.get();
    }

    private JSONObject awaitBackupFile(File file) throws Exception {
        long deadline = SystemClock.elapsedRealtime() + 15000;
        do {
            if (file.isFile() && file.length() > 0) {
                try (FileInputStream input = new FileInputStream(file)) {
                    byte[] bytes = new byte[(int) file.length()];
                    int offset = 0;
                    while (offset < bytes.length) {
                        int read = input.read(bytes, offset, bytes.length - offset);
                        if (read < 0) break;
                        offset += read;
                    }
                    return new JSONObject(new String(bytes, 0, offset, StandardCharsets.UTF_8));
                } catch (org.json.JSONException incompleteWrite) {
                    // File existence can precede the last bytes of the native write.
                }
            }
            SystemClock.sleep(200);
        } while (SystemClock.elapsedRealtime() < deadline);
        fail("Filesystem no creó una copia JSON válida en la caché privada de Android");
        return null;
    }

    private void closeShareChooser() {
        long deadline = SystemClock.elapsedRealtime() + 15000;
        do {
            AccessibilityNodeInfo window = InstrumentationRegistry.getInstrumentation().getUiAutomation().getRootInActiveWindow();
            String packageName = window == null ? "" : String.valueOf(window.getPackageName());
            if ("com.android.intentresolver".equals(packageName) || "com.google.android.intentresolver".equals(packageName)) {
                assertTrue("No se pudo cerrar el diálogo nativo de compartir",
                    InstrumentationRegistry.getInstrumentation().getUiAutomation().performGlobalAction(AccessibilityService.GLOBAL_ACTION_BACK));
                return;
            }
            SystemClock.sleep(200);
        } while (SystemClock.elapsedRealtime() < deadline);
        fail("No se abrió el diálogo nativo Android de compartir la copia");
    }
}

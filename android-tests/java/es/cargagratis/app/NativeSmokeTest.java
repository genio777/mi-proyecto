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
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/** Runs the packaged application in a real Android WebView, without HTTP fixtures. */
@RunWith(AndroidJUnit4.class)
public class NativeSmokeTest {
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

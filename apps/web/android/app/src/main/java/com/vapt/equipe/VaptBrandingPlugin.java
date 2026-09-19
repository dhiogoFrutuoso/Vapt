package com.vapt.equipe;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;

/** Read-only identity embedded in the signed APK. Never creates launcher shortcuts. */
@CapacitorPlugin(name = "VaptBranding")
public class VaptBrandingPlugin extends Plugin {
    @PluginMethod
    public void status(PluginCall call) {
        try (InputStream input = getContext().getAssets().open("native-branding.json")) {
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = input.read(buffer)) != -1) bytes.write(buffer, 0, read);
            JSObject result = new JSObject(new String(bytes.toByteArray(), StandardCharsets.UTF_8));
            result.put("version", BuildConfig.VERSION_NAME);
            call.resolve(result);
        } catch (java.io.FileNotFoundException missing) {
            JSObject result = new JSObject();
            result.put("appId", ""); result.put("revision", "");
            result.put("version", BuildConfig.VERSION_NAME);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Não foi possível verificar a identidade instalada.", error);
        }
    }
}

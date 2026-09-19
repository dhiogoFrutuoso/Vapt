package com.vapt.equipe;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.util.Base64;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.Collections;

/** A local launcher shortcut, not a modified/resigned APK. Never stores credentials. */
@CapacitorPlugin(name = "VaptBranding")
public class VaptBrandingPlugin extends Plugin {
    private static final String ID = "vapt.restaurant";
    private static final String PREFS = "vapt.branding.local";

    public static void reset(Context context) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit();
        if (Build.VERSION.SDK_INT >= 26) {
            ShortcutManager manager = context.getSystemService(ShortcutManager.class);
            // Some launchers do not implement shortcut management. This must never block login/startup.
            try {
                if (manager != null) manager.disableShortcuts(Collections.singletonList(ID), "Entre no Vapt e personalize novamente após a atualização.");
            } catch (RuntimeException ignored) { }
        }
    }

    @PluginMethod public void status(PluginCall call) {
        JSObject result = new JSObject();
        ShortcutManager manager = Build.VERSION.SDK_INT >= 26 ? getContext().getSystemService(ShortcutManager.class) : null;
        result.put("supported", manager != null && manager.isRequestPinShortcutSupported());
        result.put("appId", getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("appId", ""));
        result.put("version", BuildConfig.VERSION_NAME);
        result.put("pinned", manager != null && manager.getPinnedShortcuts().stream().anyMatch(s -> s.getId().equals(ID) && s.isEnabled()));
        call.resolve(result);
    }

    @PluginMethod public void clear(PluginCall call) {
        reset(getContext()); call.resolve();
    }

    @PluginMethod public void personalize(PluginCall call) {
        String name = call.getString("name", "").trim();
        String appId = call.getString("appId", "");
        String image = call.getString("icon", "");
        if (name.isEmpty() || name.length() > 80 || !appId.matches("[a-zA-Z0-9_-]{1,80}")) {
            call.reject("Identidade do restaurante inválida."); return;
        }
        if (Build.VERSION.SDK_INT < 26) { call.reject("Este Android não suporta a confirmação de atalhos. A identidade continua disponível dentro do Vapt."); return; }
        ShortcutManager manager = getContext().getSystemService(ShortcutManager.class);
        if (manager == null || !manager.isRequestPinShortcutSupported()) { call.reject("A tela inicial deste aparelho não permite adicionar atalhos pelo app."); return; }
        Bitmap bitmap = null;
        try {
            if (!image.isEmpty()) {
                if (image.length() > 400000) throw new IllegalArgumentException();
                byte[] bytes = Base64.decode(image, Base64.DEFAULT);
                BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
                BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
                if (bounds.outWidth > 512 || bounds.outHeight > 512 || bounds.outWidth <= 0) throw new IllegalArgumentException();
                bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            }
        } catch (Exception error) { call.reject("Não foi possível preparar o ícone do restaurante."); return; }
        final Bitmap iconBitmap = bitmap;
        getActivity().runOnUiThread(() -> {
            try {
                Intent intent = new Intent(getContext(), MainActivity.class).setAction(Intent.ACTION_MAIN);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                ShortcutInfo shortcut = new ShortcutInfo.Builder(getContext(), ID)
                    .setShortLabel(name).setLongLabel(name + " · Vapt")
                    .setIcon(iconBitmap == null ? Icon.createWithResource(getContext(), R.mipmap.ic_launcher) : Icon.createWithBitmap(iconBitmap))
                    .setIntent(intent).build();
                manager.enableShortcuts(Collections.singletonList(ID));
                boolean existing = manager.getPinnedShortcuts().stream().anyMatch(s -> s.getId().equals(ID));
                boolean accepted = existing ? manager.updateShortcuts(Collections.singletonList(shortcut)) : manager.requestPinShortcut(shortcut, null);
                if (!accepted) { call.reject("O Android não aceitou o pedido de atalho. Tente novamente na tela inicial."); return; }
                getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("appId", appId).commit();
                getActivity().setTaskDescription(new ActivityManager.TaskDescription(name, iconBitmap));
                JSObject result = new JSObject(); result.put("updated", existing); call.resolve(result);
            } catch (Exception error) { call.reject("Não foi possível personalizar este aparelho.", error); }
        });
    }
}

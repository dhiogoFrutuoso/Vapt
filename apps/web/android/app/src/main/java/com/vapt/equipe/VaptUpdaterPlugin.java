package com.vapt.equipe;

import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

@CapacitorPlugin(name = "VaptUpdater")
public class VaptUpdaterPlugin extends Plugin {
    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String rawUrl = call.getString("url");
        if (rawUrl == null || rawUrl.isBlank()) {
            call.reject("URL do APK ausente.");
            return;
        }

        new Thread(() -> {
            File partial = null;
            try {
                URL url = new URL(rawUrl);
                if (!"https".equalsIgnoreCase(url.getProtocol()) || !url.getPath().toLowerCase().endsWith(".apk")) {
                    throw new IllegalArgumentException("URL do APK inválida.");
                }

                File updates = new File(getContext().getCacheDir(), "updates");
                if (!updates.exists() && !updates.mkdirs()) throw new IllegalStateException("Cache indisponível.");
                File apk = new File(updates, "vapt-update.apk");
                partial = new File(updates, "vapt-update.download");
                if (partial.exists()) partial.delete();
                if (apk.exists()) apk.delete();

                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(20_000);
                connection.setReadTimeout(30_000);
                connection.setInstanceFollowRedirects(true);
                connection.connect();
                if (!"https".equalsIgnoreCase(connection.getURL().getProtocol())) {
                    throw new SecurityException("Redirecionamento inseguro bloqueado.");
                }
                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                    throw new IllegalStateException("Download recusado (" + connection.getResponseCode() + ").");
                }

                long total = connection.getContentLengthLong();
                long transferred = 0;
                byte[] buffer = new byte[64 * 1024];
                try (BufferedInputStream input = new BufferedInputStream(connection.getInputStream());
                     FileOutputStream output = new FileOutputStream(partial)) {
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                        transferred += read;
                        int percent = total > 0 ? Math.min(99, (int) ((transferred * 100) / total)) : 0;
                        emitProgress(percent, transferred, total);
                    }
                    output.getFD().sync();
                } finally {
                    connection.disconnect();
                }

                if (!partial.renameTo(apk)) throw new IllegalStateException("Não foi possível concluir o arquivo.");
                emitProgress(100, transferred, total);
                openInstaller(apk);
                call.resolve();
            } catch (Exception error) {
                if (partial != null && partial.exists()) partial.delete();
                call.reject("Falha ao preparar a atualização.", error);
            }
        }, "vapt-apk-update").start();
    }

    private void emitProgress(int percent, long transferred, long total) {
        JSObject data = new JSObject();
        data.put("percent", percent);
        data.put("transferred", transferred);
        data.put("total", total);
        notifyListeners("progress", data);
    }

    private void openInstaller(File apk) {
        Uri uri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            apk
        );
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);

        getActivity().runOnUiThread(() -> {
            ((MainActivity) getActivity()).markUpdateInstallerLaunched();
            getActivity().startActivity(intent);
        });
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        call.resolve();
        getActivity().runOnUiThread(() -> ((MainActivity) getActivity()).closeApplication());
    }
}

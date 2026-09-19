package com.vapt.equipe;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean updateInstallerLaunched = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(VaptUpdaterPlugin.class);
        registerPlugin(VaptPrinterPlugin.class);
        registerPlugin(VaptSecureStoragePlugin.class);
        registerPlugin(VaptLocationPlugin.class);
        registerPlugin(VaptBrandingPlugin.class);
        resetAfterPackageUpdate();
        super.onCreate(savedInstanceState);
    }

    private void resetAfterPackageUpdate() {
        android.content.SharedPreferences prefs = getSharedPreferences("vapt.installation", MODE_PRIVATE);
        String previous = prefs.getString("version", "");
        String current = BuildConfig.VERSION_NAME;
        if (!current.equals(previous)) {
            VaptSecureStoragePlugin.clearSession(getApplicationContext());
            VaptBrandingPlugin.reset(getApplicationContext());
            prefs.edit().putString("version", current).commit();
        }
    }

    public void markUpdateInstallerLaunched() {
        updateInstallerLaunched = true;
    }

    @Override
    public void onResume() {
        super.onResume();
        if (updateInstallerLaunched) {
            updateInstallerLaunched = false;
            clearSessionAndClose();
        }
    }

    private void clearSessionAndClose() {
        VaptSecureStoragePlugin.clearSession(getApplicationContext());
        if (getBridge() == null || getBridge().getWebView() == null) {
            closeApplication();
            return;
        }
        getBridge().getWebView().evaluateJavascript(
            "sessionStorage.removeItem('vapt.device.access');" +
            "sessionStorage.removeItem('vapt.device.refresh');",
            ignored -> closeApplication()
        );
    }

    public void closeApplication() {
        finishAffinity();
        finishAndRemoveTask();
        android.os.Process.killProcess(android.os.Process.myPid());
    }
}

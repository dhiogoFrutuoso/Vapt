package com.vapt.equipe;

import android.Manifest;
import android.content.Context;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.util.List;

/** Foreground-only location, independent of Google Play Services. */
@CapacitorPlugin(name = "VaptLocation", permissions = {
    @Permission(alias = "location", strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }),
    @Permission(alias = "coarseLocation", strings = { Manifest.permission.ACCESS_COARSE_LOCATION })
})
public class VaptLocationPlugin extends Plugin {
    private final Handler handler = new Handler(Looper.getMainLooper());
    private PluginCall pending;
    private LocationManager manager;
    private LocationListener listener;
    private Runnable timeout;
    private Location bestLocation;

    @PluginMethod public void getCurrentPosition(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (pending != null) { call.reject("Aguarde a localização em andamento.", "BUSY"); return; }
            pending = call;
            // Permission comes BEFORE checking providers. A disabled provider must
            // never prevent Android from showing its permission dialog.
            if (getPermissionState("coarseLocation") != PermissionState.GRANTED &&
                getPermissionState("location") != PermissionState.GRANTED) {
                requestPermissionForAlias("location", call, "afterPermission");
            } else locate(call);
        });
    }

    @PermissionCallback private void afterPermission(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            if (pending != call) return;
            if (getPermissionState("coarseLocation") != PermissionState.GRANTED &&
                getPermissionState("location") != PermissionState.GRANTED) {
                fail("Permita a localização nas configurações do aplicativo e tente novamente.", "PERMISSION_DENIED");
            } else locate(call);
        });
    }

    @SuppressWarnings("MissingPermission") private void locate(PluginCall call) {
        manager = (LocationManager) getContext().getSystemService(Context.LOCATION_SERVICE);
        if (manager == null) { fail("Serviço de localização indisponível.", "UNAVAILABLE"); return; }
        boolean fine = getPermissionState("location") == PermissionState.GRANTED;
        List<String> providers = manager.getProviders(true);
        providers.remove(LocationManager.PASSIVE_PROVIDER);
        if (!fine) providers.remove(LocationManager.GPS_PROVIDER);
        if (providers.isEmpty()) {
            // Approximate-only devices may have no network provider, even with GPS on.
            boolean enabled = manager.isProviderEnabled(LocationManager.GPS_PROVIDER) || manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER);
            fail(enabled ? "Nenhum provedor compatível respondeu. Ajuste o pino no mapa ou permita localização precisa." :
                "Ative a localização geral do Android e tente novamente.", enabled ? "UNAVAILABLE" : "SERVICES_DISABLED");
            return;
        }
        listener = new LocationListener() {
            @Override public void onLocationChanged(Location location) {
                // Providers may replay an old fix immediately after subscribing.
                long age = SystemClock.elapsedRealtimeNanos() - location.getElapsedRealtimeNanos();
                if (age < 0 || age > 10_000_000_000L || pending == null) return;
                if (bestLocation == null || location.getAccuracy() <= bestLocation.getAccuracy()) bestLocation = location;
                if (!fine || location.getAccuracy() <= 50f) succeed(location);
            }
            @Override public void onStatusChanged(String provider, int status, Bundle extras) {}
            @Override public void onProviderEnabled(String provider) {}
            @Override public void onProviderDisabled(String provider) {}
        };
        int requested = 0;
        for (String provider : providers) {
            try {
                manager.requestLocationUpdates(provider, 0L, 0f, listener, Looper.getMainLooper());
                requested++;
            } catch (SecurityException denied) { /* Another allowed provider may work. */ }
              catch (IllegalArgumentException unavailable) { /* Provider disappeared. */ }
        }
        if (requested == 0) { fail("Nenhum provedor de localização disponível. Tente novamente ou ajuste o mapa.", "UNAVAILABLE"); return; }
        timeout = () -> {
            if (bestLocation != null) succeed(bestLocation);
            else fail("A localização está permitida, mas o aparelho não forneceu uma posição atual. Tente novamente ou informe o endereço.", "TIMEOUT");
        };
        handler.postDelayed(timeout, 15000);
    }

    private void succeed(Location location) {
        if (pending == null) return;
        PluginCall call = pending;
        JSObject coords = new JSObject();
        coords.put("latitude", location.getLatitude()); coords.put("longitude", location.getLongitude());
        coords.put("accuracy", location.getAccuracy());
        JSObject result = new JSObject(); result.put("coords", coords); result.put("timestamp", location.getTime());
        cleanup(); call.resolve(result);
    }
    private void fail(String message, String code) {
        PluginCall call = pending; cleanup(); if (call != null) call.reject(message, code);
    }
    private void cleanup() {
        if (timeout != null) handler.removeCallbacks(timeout);
        try { if (manager != null && listener != null) manager.removeUpdates(listener); } catch (SecurityException ignored) { }
        pending = null; listener = null; timeout = null; bestLocation = null;
    }
    @Override protected void handleOnDestroy() { handler.post(() -> fail("Busca interrompida.", "CANCELLED")); }
}

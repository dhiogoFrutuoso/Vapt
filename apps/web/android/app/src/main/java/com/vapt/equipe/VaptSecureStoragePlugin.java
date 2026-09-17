package com.vapt.equipe;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.KeyPairGeneratorSpec;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.math.BigInteger;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Calendar;
import java.util.HashSet;
import java.util.Set;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import javax.security.auth.x500.X500Principal;

/** Sessao persistente cifrada; a chave RSA privada nunca sai do Android Keystore. */
@CapacitorPlugin(name = "VaptSecureStorage")
public class VaptSecureStoragePlugin extends Plugin {
    private static final String PREFS = "vapt.secure.v1";
    private static final String KEY_ALIAS = "vapt.secure.rsa.v1";
    private static final String WRAPPED_KEY = "wrapped-aes-key";
    private static final Set<String> ALLOWED = new HashSet<>(Arrays.asList(
        "vapt.device.access", "vapt.device.refresh", "vapt.device.id", "vapt.device.branding"
    ));
    private SecretKey cachedKey;

    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    public static void clearSession(Context context) {
        preferences(context).edit()
            .remove("vapt.device.access")
            .remove("vapt.device.refresh")
            .remove("vapt.device.branding")
            .commit();
    }

    private boolean allowed(PluginCall call) {
        String key = call.getString("key");
        if (key == null || !ALLOWED.contains(key)) {
            call.reject("Chave de armazenamento não permitida.");
            return false;
        }
        return true;
    }

    @PluginMethod
    public synchronized void get(PluginCall call) {
        if (!allowed(call)) return;
        try {
            String stored = preferences(getContext()).getString(call.getString("key"), null);
            JSObject result = new JSObject();
            result.put("value", stored == null ? JSONObject.NULL : decrypt(stored));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Não foi possível ler a sessão segura.", error);
        }
    }

    @PluginMethod
    public synchronized void set(PluginCall call) {
        if (!allowed(call)) return;
        String value = call.getString("value");
        if (value == null) {
            call.reject("Valor de armazenamento ausente.");
            return;
        }
        try {
            boolean saved = preferences(getContext()).edit()
                .putString(call.getString("key"), encrypt(value)).commit();
            if (!saved) throw new IllegalStateException("Falha ao gravar a sessão.");
            call.resolve();
        } catch (Exception error) {
            call.reject("Não foi possível salvar a sessão segura.", error);
        }
    }

    @PluginMethod
    public synchronized void remove(PluginCall call) {
        if (!allowed(call)) return;
        if (preferences(getContext()).edit().remove(call.getString("key")).commit()) call.resolve();
        else call.reject("Não foi possível remover a sessão.");
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        byte[] iv = new byte[12];
        new SecureRandom().nextBytes(iv);
        cipher.init(Cipher.ENCRYPT_MODE, encryptionKey(), new GCMParameterSpec(128, iv));
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        ByteBuffer bytes = ByteBuffer.allocate(iv.length + encrypted.length);
        bytes.put(iv).put(encrypted);
        return Base64.encodeToString(bytes.array(), Base64.NO_WRAP);
    }

    private String decrypt(String value) throws Exception {
        byte[] bytes = Base64.decode(value, Base64.NO_WRAP);
        if (bytes.length < 28) throw new IllegalArgumentException("Sessão corrompida.");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, encryptionKey(),
            new GCMParameterSpec(128, Arrays.copyOfRange(bytes, 0, 12)));
        return new String(cipher.doFinal(bytes, 12, bytes.length - 12), StandardCharsets.UTF_8);
    }

    @SuppressWarnings("deprecation") // minSdk 22: KeyGenParameterSpec exige API 23.
    private SecretKey encryptionKey() throws Exception {
        if (cachedKey != null) return cachedKey;
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            Calendar start = Calendar.getInstance();
            Calendar end = Calendar.getInstance();
            end.add(Calendar.YEAR, 30);
            KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA", "AndroidKeyStore");
            generator.initialize(new KeyPairGeneratorSpec.Builder(getContext())
                .setAlias(KEY_ALIAS)
                .setSubject(new X500Principal("CN=Vapt Secure Storage"))
                .setSerialNumber(BigInteger.ONE)
                .setStartDate(start.getTime())
                .setEndDate(end.getTime())
                .setKeySize(2048)
                .build());
            generator.generateKeyPair();
        }

        SharedPreferences prefs = preferences(getContext());
        String wrapped = prefs.getString(WRAPPED_KEY, null);
        if (wrapped != null) {
            try {
                Cipher unwrap = Cipher.getInstance("RSA/ECB/PKCS1Padding");
                unwrap.init(Cipher.DECRYPT_MODE, store.getKey(KEY_ALIAS, null));
                cachedKey = new SecretKeySpec(unwrap.doFinal(Base64.decode(wrapped, Base64.NO_WRAP)), "AES");
                return cachedKey;
            } catch (Exception restoredOnAnotherDevice) {
                // Um backup não restaura a chave privada do Keystore: exige novo login.
                if (!prefs.edit().clear().commit()) throw restoredOnAnotherDevice;
            }
        }

        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(256, new SecureRandom());
        SecretKey key = generator.generateKey();
        Cipher wrap = Cipher.getInstance("RSA/ECB/PKCS1Padding");
        wrap.init(Cipher.ENCRYPT_MODE, store.getCertificate(KEY_ALIAS).getPublicKey());
        if (!prefs.edit().putString(WRAPPED_KEY,
            Base64.encodeToString(wrap.doFinal(key.getEncoded()), Base64.NO_WRAP)).commit()) {
            throw new IllegalStateException("Falha ao preparar a chave segura.");
        }
        cachedKey = key;
        return cachedKey;
    }
}

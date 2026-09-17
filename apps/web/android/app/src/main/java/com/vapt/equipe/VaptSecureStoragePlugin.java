package com.vapt.equipe;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.KeyPairGeneratorSpec;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
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

/** Sessao persistente cifrada com chave protegida pelo Android Keystore. */
@CapacitorPlugin(name = "VaptSecureStorage")
public class VaptSecureStoragePlugin extends Plugin {
    private static final String PREFS = "vapt.secure.v3";
    private static final String KEY_ALIAS = "vapt.secure.rsa.v3";
    private static final String AES_ALIAS = "vapt.secure.aes.v3";
    private static final String WRAPPED_KEY = "wrapped-aes-key";
    private static final String SOFTWARE_MODE = "software-key-fallback";
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
        context.getSharedPreferences("vapt.secure.v1", Context.MODE_PRIVATE).edit()
            .remove("vapt.device.access")
            .remove("vapt.device.refresh")
            .remove("vapt.device.branding")
            .commit();
        context.getSharedPreferences("vapt.secure.v2", Context.MODE_PRIVATE).edit()
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
            call.reject("Não foi possível salvar a sessão segura.", error.getClass().getSimpleName(), error);
        }
    }

    @PluginMethod
    public synchronized void remove(PluginCall call) {
        if (!allowed(call)) return;
        if (preferences(getContext()).edit().remove(call.getString("key")).commit()) call.resolve();
        else call.reject("Não foi possível remover a sessão.");
    }

    private String encrypt(String value) throws Exception {
        try {
            return encryptWithKey(value, encryptionKey());
        } catch (Exception keystoreError) {
            if (preferences(getContext()).getBoolean(SOFTWARE_MODE, false)) throw keystoreError;
            // Alguns emuladores geram a chave mas não conseguem usá-la no Cipher.
            return encryptWithKey(value, activateSoftwareKey());
        }
    }

    private String encryptWithKey(String value, SecretKey key) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        // O Android Keystore exige que ele próprio gere o IV para chaves AES.
        cipher.init(Cipher.ENCRYPT_MODE, key);
        byte[] iv = cipher.getIV();
        if (iv == null || iv.length < 12 || iv.length > 16) {
            throw new IllegalStateException("IV seguro indisponível.");
        }
        byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        ByteBuffer bytes = ByteBuffer.allocate(1 + iv.length + encrypted.length);
        bytes.put((byte) iv.length).put(iv).put(encrypted);
        return Base64.encodeToString(bytes.array(), Base64.NO_WRAP);
    }

    private String decrypt(String value) throws Exception {
        byte[] bytes = Base64.decode(value, Base64.NO_WRAP);
        if (bytes.length < 29) throw new IllegalArgumentException("Sessão corrompida.");
        int ivLength = bytes[0] & 0xff;
        if (ivLength < 12 || ivLength > 16 || bytes.length < 1 + ivLength + 16) {
            throw new IllegalArgumentException("Sessão corrompida.");
        }
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, encryptionKey(),
            new GCMParameterSpec(128, Arrays.copyOfRange(bytes, 1, 1 + ivLength)));
        return new String(cipher.doFinal(bytes, 1 + ivLength, bytes.length - 1 - ivLength), StandardCharsets.UTF_8);
    }

    @SuppressWarnings("deprecation") // minSdk 22: KeyGenParameterSpec exige API 23.
    private SecretKey encryptionKey() throws Exception {
        if (cachedKey != null) return cachedKey;
        if (preferences(getContext()).getBoolean(SOFTWARE_MODE, false)) {
            cachedKey = softwareKey();
            return cachedKey;
        }

        try {
            return androidKeystoreKey();
        } catch (Exception keystoreUnavailable) {
            return activateSoftwareKey();
        }
    }

    /** Chave aleatória no diretório privado sem backup quando o Keystore falha. */
    private SecretKey softwareKey() throws Exception {
        AtomicFile file = new AtomicFile(new File(getContext().getNoBackupFilesDir(), "vapt-secure-v3.key"));
        byte[] raw;
        try {
            raw = file.readFully();
        } catch (FileNotFoundException missing) {
            raw = new byte[32];
            new SecureRandom().nextBytes(raw);
            FileOutputStream stream = file.startWrite();
            try {
                stream.write(raw);
                file.finishWrite(stream);
            } catch (Exception writeError) {
                file.failWrite(stream);
                throw writeError;
            }
        }
        if (raw.length != 32) throw new IllegalStateException("Chave local inválida.");
        return new SecretKeySpec(raw, "AES");
    }

    private SecretKey activateSoftwareKey() throws Exception {
        SecretKey key = softwareKey();
        if (!preferences(getContext()).edit().putBoolean(SOFTWARE_MODE, true).commit()) {
            throw new IllegalStateException("Falha ao gravar modo de armazenamento.");
        }
        cachedKey = key;
        return key;
    }

    @SuppressWarnings("deprecation") // Android 5.1 ainda precisa de KeyPairGeneratorSpec.
    private SecretKey androidKeystoreKey() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            if (!store.containsAlias(AES_ALIAS)) {
                KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
                generator.init(new KeyGenParameterSpec.Builder(AES_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build());
                generator.generateKey();
            }
            cachedKey = (SecretKey) store.getKey(AES_ALIAS, null);
            if (cachedKey == null) throw new IllegalStateException("Chave segura indisponível.");
            return cachedKey;
        }

        // Somente Android 5.1 (API 22): AES no Keystore não existia ainda.
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

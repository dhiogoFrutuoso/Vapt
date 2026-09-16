package com.vapt.equipe;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "VaptPrinter")
public class VaptPrinterPlugin extends Plugin {
    @PluginMethod
    public void print(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager manager = (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                if (manager == null || getBridge() == null || getBridge().getWebView() == null) {
                    call.reject("Serviço de impressão indisponível.");
                    return;
                }

                PrintDocumentAdapter adapter = getBridge().getWebView()
                    .createPrintDocumentAdapter("Vapt - Comanda");
                PrintAttributes attributes = new PrintAttributes.Builder()
                    .setColorMode(PrintAttributes.COLOR_MODE_MONOCHROME)
                    .build();
                manager.print("Vapt - Comanda", adapter, attributes);

                JSObject result = new JSObject();
                result.put("success", true);
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Não foi possível abrir a impressão nativa.", error);
            }
        });
    }
}

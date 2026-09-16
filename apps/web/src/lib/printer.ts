import { Capacitor, registerPlugin } from '@capacitor/core';

export type PrinterDevice = {
  name: string;
  displayName: string;
  isDefault: boolean;
  status: number;
};

type PrintResult = { success: boolean; error?: string | null };
type ElectronPrinterBridge = {
  printReceipt?: () => Promise<PrintResult>;
  listPrinters?: () => Promise<PrinterDevice[]>;
  getPrinter?: () => Promise<{ deviceName: string }>;
  savePrinter?: (deviceName: string) => Promise<PrintResult & { deviceName?: string }>;
};
type AndroidPrinterPlugin = { print: () => Promise<PrintResult> };

const AndroidPrinter = registerPlugin<AndroidPrinterPlugin>('VaptPrinter');

function electronBridge(): ElectronPrinterBridge | undefined {
  return (window as unknown as { vaptSecure?: ElectronPrinterBridge }).vaptSecure;
}

export function printerPlatform(): 'windows' | 'android' | 'web' {
  if (electronBridge()?.listPrinters) return 'windows';
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') return 'android';
  return 'web';
}

export async function listPrinters(): Promise<PrinterDevice[]> {
  return (await electronBridge()?.listPrinters?.()) ?? [];
}

export async function getSavedPrinter(): Promise<string> {
  return (await electronBridge()?.getPrinter?.())?.deviceName ?? '';
}

export async function savePrinter(deviceName: string): Promise<void> {
  const result = await electronBridge()?.savePrinter?.(deviceName);
  if (result && !result.success) throw new Error(result.error || 'Não foi possível salvar a impressora.');
}

export async function printReceipt(): Promise<void> {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    const result = await AndroidPrinter.print();
    if (!result.success) throw new Error(result.error || 'A impressão nativa não respondeu.');
    return;
  }

  const result = await electronBridge()?.printReceipt?.();
  if (result) {
    if (!result.success) throw new Error(result.error || 'A impressora térmica não respondeu.');
    return;
  }

  window.print();
}

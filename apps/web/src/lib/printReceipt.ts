export async function printReceipt(): Promise<void> {
  const bridge = (window as unknown as {
    vaptSecure?: { printReceipt?: () => Promise<{ success: boolean; error?: string | null }> };
  }).vaptSecure;

  if (bridge?.printReceipt) {
    const result = await bridge.printReceipt();
    if (!result.success) throw new Error(result.error || 'A impressora térmica não respondeu.');
    return;
  }

  window.print();
}

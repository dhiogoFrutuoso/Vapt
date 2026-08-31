/**
 * Reduz a imagem no navegador antes de enviar para a API.
 * Evita payload gigante e mantem o demo rapido em 4G.
 */
export function fileToResizedDataUrl(file: File, maxSize = 640, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) {
      reject(new Error('Selecione um arquivo de imagem (PNG ou JPG).'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      reject(new Error('Imagem muito pesada. Escolha uma foto de até 5MB.'));
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não conseguimos ler esse arquivo.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Não conseguimos abrir essa imagem.'));
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Seu navegador não suporta o pré-processamento da imagem.'));
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}

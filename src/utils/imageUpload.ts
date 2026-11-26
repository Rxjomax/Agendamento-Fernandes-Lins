import { isEphemeralServer } from './serverMode';

export async function processAndUploadImageFile(
  file: File,
  options: { maxWidth?: number; maxHeight?: number; prefix?: string } = {}
): Promise<string> {
  const { maxWidth = 480, maxHeight = 480, prefix = 'photo' } = options;

  if (!file.type.startsWith('image/')) {
    throw new Error('Selecione um arquivo de imagem válido (JPG, PNG ou WebP).');
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', 0.82);
        resolve(compressed);
      };
      img.onerror = () => reject(new Error('Não foi possível ler a imagem selecionada.'));
      img.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Erro ao carregar o arquivo.'));
    reader.readAsDataURL(file);
  });

  if (!isEphemeralServer()) {
    try {
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataUrl, prefix }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json.url === 'string') {
          return json.url;
        }
      }
    } catch {
      // Fallback para a URL local caso o servidor esteja reiniciando
    }
  }

  return dataUrl;
}

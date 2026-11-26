import { AppointmentDocument } from '../types/scheduling';
import { isEphemeralServer } from './serverMode';

const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB

export async function uploadPdfDocumentFile(file: File): Promise<AppointmentDocument> {
  const isPdf =
    file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) {
    throw new Error(`O arquivo "${file.name}" não é um PDF válido.`);
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new Error(`O arquivo "${file.name}" excede o limite de 10 MB.`);
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Falha ao ler o arquivo "${file.name}".`));
    reader.readAsDataURL(file);
  });

  if (!isEphemeralServer()) {
    try {
      const res = await fetch('/api/upload-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dataUrl,
          fileName: file.name,
          size: file.size,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json && typeof json.url === 'string') {
          return {
            id: json.id || `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: json.name || file.name,
            size: Number(json.size) || file.size,
            url: json.url,
            uploadedAt: json.uploadedAt || new Date().toISOString(),
          };
        }
      }
    } catch {
      // Fallback local caso servidor esteja indisponível
    }
  }

  return {
    id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name: file.name,
    size: file.size,
    url: dataUrl,
    uploadedAt: new Date().toISOString(),
  };
}

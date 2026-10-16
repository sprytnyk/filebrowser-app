import { requireOptionalNativeModule } from 'expo';

/**
 * PDF pages drawn by Android's PdfRenderer through the app's native module (modules/pdf-pages).
 * Expo Go lacks that module, so there PDFs keep opening in another app.
 */
type PdfPagesModule = {
  open(uri: string): Promise<[number, number][]>;
  render(uri: string, index: number, width: number): Promise<string>;
};

const native = requireOptionalNativeModule<PdfPagesModule>('PdfPages');

export type PageSize = { width: number; height: number };

export function canViewPdf(): boolean {
  return native !== null;
}

/** Size of each page in PDF points; rejects for password-protected or unreadable files. */
export async function pdfPageSizes(uri: string): Promise<PageSize[]> {
  const sizes = await native!.open(uri);
  return sizes.map(([width, height]) => ({ width, height }));
}

/** File URI of page `index` drawn `width` pixels wide. */
export function renderPdfPage(uri: string, index: number, width: number): Promise<string> {
  return native!.render(uri, index, width);
}

/** Why the native module turned a file down, from its error code. */
export function pdfErrorKind(e: unknown): 'password' | 'invalid' | null {
  const code = (e as { code?: string } | null)?.code;
  if (code === 'ERR_PDF_PASSWORD') return 'password';
  if (code === 'ERR_PDF_INVALID') return 'invalid';
  return null;
}

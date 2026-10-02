import { InvoiceSignatureStyle, type InvoiceTemplateConfig } from './invoice-template.config';

/** Hôtes autorisés pour les images d'une agence (téléversées sur Cloudinary par l'application). */
const IMAGE_HOSTS = new Set(['res.cloudinary.com']);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

/**
 * Télécharge le logo ou le cachet de l'agence pour l'imprimer sur une facture. Uniquement en HTTPS depuis Cloudinary
 * (pas d'URL arbitraire : SSRF), PNG ou JPEG (formats lus par pdfkit), 2 Mo au plus, 5 s au plus.
 * Tout échec renvoie null : la facture s'imprime sans l'image.
 */
export async function loadAgencyImage(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !IMAGE_HOSTS.has(parsed.hostname)) return null;
    const response = await fetch(parsed, { redirect: 'error', signal: AbortSignal.timeout(5_000) });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !/^image\/(png|jpe?g)$/.test(type)) return null;
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_IMAGE_BYTES) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > MAX_IMAGE_BYTES ? null : buffer;
  } catch {
    return null;
  }
}

/** Logo et cachet dont un modèle a besoin, téléchargés en parallèle (null si absent ou illisible). */
export async function loadInvoiceImages(
  config: InvoiceTemplateConfig,
  urls: { logoUrl: string | null; stampUrl: string | null },
): Promise<{ logo: Buffer | null; stamp: Buffer | null }> {
  const withStamp =
    config.blocks.signature && config.signatureStyle === InvoiceSignatureStyle.IMAGE;
  const [logo, stamp] = await Promise.all([
    config.showLogo ? loadAgencyImage(urls.logoUrl) : null,
    withStamp ? loadAgencyImage(urls.stampUrl) : null,
  ]);
  return { logo, stamp };
}

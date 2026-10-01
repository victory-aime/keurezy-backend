/** Hôtes autorisés pour le logo d'une agence (téléversé sur Cloudinary par l'application). */
const LOGO_HOSTS = new Set(['res.cloudinary.com']);
const MAX_LOGO_BYTES = 2 * 1024 * 1024;

/**
 * Télécharge le logo pour l'imprimer sur une facture. Uniquement en HTTPS depuis Cloudinary
 * (pas d'URL arbitraire : SSRF), PNG ou JPEG (formats lus par pdfkit), 2 Mo au plus, 5 s au plus.
 * Tout échec renvoie null : la facture s'imprime sans logo.
 */
export async function loadAgencyLogo(url: string | null | undefined): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !LOGO_HOSTS.has(parsed.hostname)) return null;
    const response = await fetch(parsed, { redirect: 'error', signal: AbortSignal.timeout(5_000) });
    const type = response.headers.get('content-type') ?? '';
    if (!response.ok || !/^image\/(png|jpe?g)$/.test(type)) return null;
    const length = Number(response.headers.get('content-length') ?? 0);
    if (length > MAX_LOGO_BYTES) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    return buffer.length > MAX_LOGO_BYTES ? null : buffer;
  } catch {
    return null;
  }
}

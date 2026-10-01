import PDFDocument from 'pdfkit';
import { planLabel } from '../../../config/plan-labels';
import type { ReceiptAgency } from './issue-receipt';

/** Données figées d'un reçu : rien n'est relu ailleurs au moment du rendu. */
export interface ReceiptData {
  number: string;
  paidAt: Date;
  amount: number;
  plan: string;
  billingCycle: 'MONTHLY' | 'YEARLY' | null;
  periodStart: Date | null;
  periodEnd: Date | null;
  /** Référence de la commande NabooPay */
  orderId: string;
  agency: ReceiptAgency;
}

/** Émetteur : Keurezy, d'après l'environnement (« à compléter » tant que c'est absent). */
export function platformIssuer() {
  const value = (key: string) => process.env[key]?.trim() || 'à compléter';
  return {
    name: value('KEUREZY_LEGAL_NAME'),
    ninea: value('KEUREZY_NINEA'),
    rccm: value('KEUREZY_RCCM'),
    address: value('KEUREZY_ADDRESS'),
    email: value('KEUREZY_BILLING_EMAIL'),
  };
}

const LEGAL_FORMS: Record<string, string> = { INDIVIDUAL: 'Entreprise individuelle', OTHER: '' };
const date = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
// Espaces fines insécables absentes des polices standard du PDF : espace simple
const amount = (xof: number) =>
  `${new Intl.NumberFormat('fr-FR').format(xof).replace(/[  ]/g, ' ')} F CFA`;

const BRAND = '#673ab6';
const MUTED = '#6b7280';
const TEXT = '#111827';

/**
 * Reçu de paiement d'abonnement (Keurezy → agence), format standard A4. Polices standard du PDF
 * (pas de fichier de police) : les textes restent en caractères latins usuels.
 */
export function renderReceiptPdf(data: ReceiptData, options: { compress?: boolean } = {}) {
  const issuer = platformIssuer();
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    compress: options.compress ?? true,
    info: { Title: `Reçu ${data.number}`, Author: issuer.name },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const left = 50;
  const right = doc.page.width - 50;
  const width = right - left;

  // En-tête : émetteur à gauche, titre et numéro à droite
  doc.fillColor(BRAND).font('Helvetica-Bold').fontSize(20).text('Keurezy', left, 50);
  doc.fillColor(MUTED).font('Helvetica').fontSize(9);
  [
    issuer.name,
    `NINEA : ${issuer.ninea}`,
    `RCCM : ${issuer.rccm}`,
    issuer.address,
    issuer.email,
  ].forEach((line) => doc.text(line, left));
  const headerBottom = doc.y;

  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(14);
  doc.text('REÇU DE PAIEMENT', left, 50, { width, align: 'right' });
  doc.font('Helvetica').fontSize(10);
  doc.text(`N° ${data.number}`, { width, align: 'right' });
  doc.text(`Date : ${date(data.paidAt)}`, { width, align: 'right' });

  // Client
  const agency = data.agency;
  const legalForm = agency.legalForm ? (LEGAL_FORMS[agency.legalForm] ?? agency.legalForm) : '';
  doc.fillColor(MUTED).fontSize(9).text('REÇU DE', left, Math.max(headerBottom, doc.y) + 30);
  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(11);
  doc.text([agency.companyName ?? agency.name, legalForm].filter(Boolean).join(' - '), left);
  doc.font('Helvetica').fontSize(10);
  [
    agency.address,
    agency.ninea ? `NINEA : ${agency.ninea}` : null,
    agency.rccm ? `RCCM : ${agency.rccm}` : null,
    agency.email,
  ]
    .filter((line): line is string => !!line)
    .forEach((line) => doc.text(line, left));

  // Ligne du reçu
  const tableTop = doc.y + 25;
  const cols = { label: left, period: left + 250, amount: right - 110 };
  doc.rect(left, tableTop, width, 22).fill('#f4f5f7');
  doc.fillColor(TEXT).font('Helvetica-Bold').fontSize(9);
  doc.text('DÉSIGNATION', cols.label + 8, tableTop + 7);
  doc.text('PÉRIODE', cols.period, tableTop + 7);
  doc.text('MONTANT', cols.amount, tableTop + 7, { width: 102, align: 'right' });

  const cycle = data.billingCycle === 'YEARLY' ? 'annuel' : data.billingCycle ? 'mensuel' : '';
  const rowTop = tableTop + 32;
  doc.font('Helvetica').fontSize(10);
  doc.text(
    `Abonnement ${planLabel(data.plan)}${cycle ? ` (${cycle})` : ''}`,
    cols.label + 8,
    rowTop,
    {
      width: 235,
    },
  );
  doc.text(
    data.periodStart && data.periodEnd
      ? `Du ${date(data.periodStart)} au ${date(data.periodEnd)}`
      : '-',
    cols.period,
    rowTop,
    { width: 150 },
  );
  doc.text(amount(data.amount), cols.amount, rowTop, { width: 102, align: 'right' });

  // Total
  const totalTop = rowTop + 35;
  doc.moveTo(left, totalTop).lineTo(right, totalTop).strokeColor('#e5e7eb').stroke();
  doc.font('Helvetica-Bold').fontSize(12);
  doc.text('Total réglé', cols.period, totalTop + 12);
  doc.text(amount(data.amount), cols.amount, totalTop + 12, { width: 102, align: 'right' });

  // Règlement et mentions
  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  doc.text(
    `Réglé le ${date(data.paidAt)} par NabooPay (Wave ou Orange Money). Référence : ${data.orderId}.`,
    left,
    totalTop + 50,
    { width },
  );
  doc.moveDown(0.5);
  doc.text('Reçu de paiement, non soumis à la TVA.', { width });

  doc
    .fontSize(8)
    .text(
      `${issuer.name} - ${issuer.email} - Document généré automatiquement.`,
      left,
      doc.page.height - 70,
      { width, align: 'center' },
    );

  doc.end();
  return done;
}

import PDFDocument from 'pdfkit';
import { amountInWords } from './amount-in-words';
import {
  InvoiceFont,
  InvoiceLayout,
  InvoiceSignatureStyle,
  type InvoiceTemplateConfig,
} from './invoice-template.config';
import { fillVariables, type InvoiceVariableValues } from './invoice-variables';

/** Ligne de facture : montant = quantité × prix unitaire (XOF, entiers). */
export interface InvoiceLine {
  description: string;
  /** Période couverte, ex. « Du 01/10/2026 au 31/10/2026 » */
  period?: string | null;
  quantity: number;
  unitPrice: number;
}

export type InvoiceWatermark = 'BROUILLON' | 'ANNULÉE';

const WATERMARK_COLORS: Record<InvoiceWatermark, string> = {
  BROUILLON: '#6b7280',
  ANNULÉE: '#dc2626',
};

/** Données figées d'une facture (ou données d'exemple pour l'aperçu d'un modèle). */
export interface InvoiceRenderData {
  number: string;
  issuedAt: Date;
  dueAt: Date;
  /** Mention en travers de la page : brouillon (pas encore émise) ou annulée */
  watermark?: InvoiceWatermark | null;
  /** Taux de TVA en % (0 : non soumis) */
  vatRate: number;
  agency: {
    name: string;
    companyName: string | null;
    ninea: string | null;
    rccm: string | null;
    address: string;
    phone: string | null;
    email: string;
    bankName: string | null;
    bankAccount: string | null;
    mobileMoneyNumber: string | null;
    /** Logo déjà téléchargé (le rendu ne fait aucun appel réseau) */
    logo?: Buffer | null;
    /** Cachet ou signature scanné, déjà téléchargé */
    stamp?: Buffer | null;
  };
  client: { name: string; email: string | null; phone: string | null; address: string | null };
  booking?: {
    reference: string;
    period: string;
    duration: string;
    rentalType: string;
    deposit: number;
  } | null;
  property?: { title: string; address: string | null; city: string | null } | null;
  lines: InvoiceLine[];
}

export interface InvoiceTotals {
  ht: number;
  vat: number;
  ttc: number;
}

export function invoiceTotals(lines: InvoiceLine[], vatRate: number): InvoiceTotals {
  const ht = lines.reduce((sum, l) => sum + Math.round(l.quantity * l.unitPrice), 0);
  const vat = Math.round((ht * vatRate) / 100);
  return { ht, vat, ttc: ht + vat };
}

const date = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });
// Espaces fines insécables absentes des polices standard du PDF : espace simple
export const formatXof = (xof: number) =>
  `${new Intl.NumberFormat('fr-FR').format(xof).replace(/[  ]/g, ' ')} F CFA`;

/** Valeurs des variables du catalogue pour une facture (vide si l'information manque). */
export function invoiceVariableValues(
  data: InvoiceRenderData,
  totals: InvoiceTotals,
): InvoiceVariableValues {
  const { agency, client, booking, property } = data;
  return {
    'agence.nom': agency.name,
    'agence.raison_sociale': agency.companyName ?? agency.name,
    'agence.ninea': agency.ninea ?? '',
    'agence.rccm': agency.rccm ?? '',
    'agence.adresse': agency.address,
    'agence.telephone': agency.phone ?? '',
    'agence.email': agency.email,
    'client.nom': client.name,
    'client.email': client.email ?? '',
    'client.telephone': client.phone ?? '',
    'client.adresse': client.address ?? '',
    'facture.numero': data.number,
    'facture.date': date(data.issuedAt),
    'facture.echeance': date(data.dueAt),
    'facture.total_ht': formatXof(totals.ht),
    'facture.tva': formatXof(totals.vat),
    'facture.total_ttc': formatXof(totals.ttc),
    'facture.montant_lettres': amountInWords(totals.ttc),
    'reservation.reference': booking?.reference ?? '',
    'reservation.periode': booking?.period ?? '',
    'reservation.duree': booking?.duration ?? '',
    'reservation.type': booking?.rentalType ?? '',
    'reservation.caution': booking ? formatXof(booking.deposit) : '',
    'bien.titre': property?.title ?? '',
    'bien.adresse': property?.address ?? '',
    'bien.ville': property?.city ?? '',
  };
}

const FONTS: Record<InvoiceFont, { regular: string; bold: string }> = {
  [InvoiceFont.HELVETICA]: { regular: 'Helvetica', bold: 'Helvetica-Bold' },
  [InvoiceFont.TIMES]: { regular: 'Times-Roman', bold: 'Times-Bold' },
  [InvoiceFont.COURIER]: { regular: 'Courier', bold: 'Courier-Bold' },
};

const MUTED = '#6b7280';
const TEXT = '#111827';
const LINE = '#e5e7eb';

/**
 * Facture PDF selon un modèle structuré : 3 mises en page (Classique, Moderne, Minimal),
 * couleurs, police, colonnes, blocs et textes à variables. Même moteur pour l'aperçu de l'éditeur
 * et pour les factures émises. Tout est écrit comme du texte : rien n'est interprété.
 */
export function renderInvoicePdf(
  config: InvoiceTemplateConfig,
  data: InvoiceRenderData,
  options: { compress?: boolean } = {},
): Promise<Buffer> {
  const totals = invoiceTotals(data.lines, data.vatRate);
  const values = invoiceVariableValues(data, totals);
  const fill = (text: string) => fillVariables(text, values).trim();
  const font = FONTS[config.font];
  const { primaryColor: primary, accentColor: accent, layout } = config;

  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    compress: options.compress ?? true,
    info: { Title: `Facture ${data.number}`, Author: data.agency.companyName ?? data.agency.name },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageWidth = doc.page.width;
  const left = 50;
  const right = pageWidth - 50;
  const width = right - left;
  const bottomLimit = doc.page.height - 110;
  const logo = config.showLogo ? data.agency.logo : null;
  const agencyTitle = data.agency.companyName ?? data.agency.name;

  // ── En-tête ────────────────────────────────────────────────────────────────
  let top = 50;
  const titleColor = layout === InvoiceLayout.MODERN ? '#ffffff' : primary;
  if (layout === InvoiceLayout.MODERN) {
    doc.rect(0, 0, pageWidth, 120).fill(primary);
  }
  if (logo) {
    try {
      doc.image(logo, left, top - 10, { fit: [110, 45] });
      top += 45;
    } catch {
      // Logo illisible : la facture reste valable sans lui
    }
  }
  doc
    .fillColor(layout === InvoiceLayout.MODERN ? '#ffffff' : primary)
    .font(font.bold)
    .fontSize(14)
    .text(agencyTitle, left, top, { width: width / 2 });

  doc
    .fillColor(titleColor)
    .font(font.bold)
    .fontSize(layout === InvoiceLayout.MINIMAL ? 26 : 22)
    .text(fill(config.texts.title) || 'Facture', left + width / 2, 45, {
      width: width / 2,
      align: 'right',
    });
  doc.font(font.regular).fontSize(10);
  doc.text(`N° ${data.number}`, { width: width / 2, align: 'right' });
  doc.text(`Date : ${date(data.issuedAt)}`, { width: width / 2, align: 'right' });
  doc.text(`Échéance : ${date(data.dueAt)}`, { width: width / 2, align: 'right' });

  // ── Agence et client ───────────────────────────────────────────────────────
  const partiesTop = layout === InvoiceLayout.MODERN ? 140 : Math.max(doc.y, top + 20) + 20;
  const agencyLines = [
    data.agency.address,
    data.agency.phone,
    data.agency.email,
    config.blocks.legal && data.agency.ninea ? `NINEA : ${data.agency.ninea}` : null,
    config.blocks.legal && data.agency.rccm ? `RCCM : ${data.agency.rccm}` : null,
  ].filter((line): line is string => !!line);
  doc.fillColor(MUTED).font(font.regular).fontSize(9);
  doc.text('ÉMETTEUR', left, partiesTop);
  doc.fillColor(TEXT).fontSize(10);
  agencyLines.forEach((line) => doc.text(line, left, undefined, { width: width / 2 - 20 }));
  const agencyBottom = doc.y;

  const clientX = left + width / 2 + 10;
  const clientWidth = width / 2 - 10;
  if (layout === InvoiceLayout.CLASSIC) {
    doc
      .rect(clientX - 10, partiesTop - 8, clientWidth + 10, 80)
      .strokeColor(LINE)
      .stroke();
  }
  doc.fillColor(accent).font(font.bold).fontSize(9).text('FACTURÉ À', clientX, partiesTop);
  doc.fillColor(TEXT).font(font.bold).fontSize(11).text(data.client.name, clientX, undefined, {
    width: clientWidth,
  });
  doc.font(font.regular).fontSize(10);
  [data.client.address, data.client.email, data.client.phone]
    .filter((line): line is string => !!line)
    .forEach((line) => doc.text(line, clientX, undefined, { width: clientWidth }));

  let y = Math.max(agencyBottom, doc.y, partiesTop + 80) + 20;
  if (data.property) {
    doc.fillColor(MUTED).fontSize(9).text('BIEN', left, y);
    doc.fillColor(TEXT).fontSize(10);
    doc.text(
      [data.property.title, data.property.address, data.property.city].filter(Boolean).join(', '),
      left,
      undefined,
      { width },
    );
    y = doc.y + 12;
  }
  const intro = fill(config.texts.intro);
  if (intro) {
    doc.fillColor(TEXT).font(font.regular).fontSize(10).text(intro, left, y, { width });
    y = doc.y + 12;
  }

  // ── Tableau ────────────────────────────────────────────────────────────────
  type Column = {
    title: string;
    width: number;
    align: 'left' | 'right';
    value: (l: InvoiceLine) => string;
  };
  const optional: Column[] = [
    ...(config.columns.period
      ? [
          {
            title: 'PÉRIODE',
            width: 105,
            align: 'left' as const,
            value: (l: InvoiceLine) => l.period ?? '',
          },
        ]
      : []),
    ...(config.columns.quantity
      ? [
          {
            title: 'QTÉ',
            width: 32,
            align: 'right' as const,
            value: (l: InvoiceLine) => String(l.quantity),
          },
        ]
      : []),
    ...(config.columns.unitPrice
      ? [
          {
            title: 'PRIX UNIT.',
            width: 78,
            align: 'right' as const,
            value: (l: InvoiceLine) => formatXof(l.unitPrice),
          },
        ]
      : []),
    ...(config.columns.vat
      ? [{ title: 'TVA', width: 38, align: 'right' as const, value: () => `${data.vatRate} %` }]
      : []),
  ];
  const totalCol: Column = {
    title: 'TOTAL',
    width: 82,
    align: 'right',
    value: (l) => formatXof(Math.round(l.quantity * l.unitPrice)),
  };
  const fixedWidth = optional.reduce((sum, c) => sum + c.width, 0) + totalCol.width;
  const columns: Column[] = [
    { title: 'DÉSIGNATION', width: width - fixedWidth, align: 'left', value: (l) => l.description },
    ...optional,
    totalCol,
  ];

  const drawHeader = (at: number) => {
    if (layout === InvoiceLayout.MODERN) doc.rect(left, at, width, 22).fill(primary);
    else if (layout === InvoiceLayout.CLASSIC) doc.rect(left, at, width, 22).fill('#f3f4f6');
    doc
      .fillColor(layout === InvoiceLayout.MODERN ? '#ffffff' : TEXT)
      .font(font.bold)
      .fontSize(8);
    let x = left;
    for (const col of columns) {
      doc.text(col.title, x + 6, at + 7, { width: col.width - 12, align: col.align });
      x += col.width;
    }
    if (layout === InvoiceLayout.MINIMAL) {
      doc
        .moveTo(left, at + 22)
        .lineTo(right, at + 22)
        .strokeColor(primary)
        .stroke();
    }
    return at + 30;
  };

  y = drawHeader(y);
  doc.font(font.regular).fontSize(9).fillColor(TEXT);
  for (const line of data.lines) {
    const height = Math.max(
      ...columns.map((col) =>
        doc.heightOfString(col.value(line) || ' ', { width: col.width - 12 }),
      ),
    );
    if (y + height > bottomLimit) {
      doc.addPage();
      y = drawHeader(50);
      doc.font(font.regular).fontSize(9).fillColor(TEXT);
    }
    let x = left;
    for (const col of columns) {
      doc.text(col.value(line), x + 6, y, { width: col.width - 12, align: col.align });
      x += col.width;
    }
    y += height + 8;
    doc
      .moveTo(left, y - 4)
      .lineTo(right, y - 4)
      .strokeColor(LINE)
      .stroke();
  }

  // ── Totaux ─────────────────────────────────────────────────────────────────
  if (y + 120 > bottomLimit) {
    doc.addPage();
    y = 50;
  }
  const labelX = right - 230;
  const totalLine = (label: string, value: string, strong = false) => {
    doc
      .fillColor(strong ? accent : TEXT)
      .font(strong ? font.bold : font.regular)
      .fontSize(strong ? 12 : 10);
    doc.text(label, labelX, y, { width: 130 });
    doc.text(value, labelX + 130, y, { width: 100, align: 'right' });
    y += strong ? 20 : 16;
  };
  y += 6;
  if (data.vatRate > 0) {
    totalLine('Total HT', formatXof(totals.ht));
    totalLine(`TVA (${data.vatRate} %)`, formatXof(totals.vat));
    totalLine('Total TTC', formatXof(totals.ttc), true);
  } else {
    totalLine('Total', formatXof(totals.ttc), true);
  }

  doc.fillColor(MUTED).font(font.regular).fontSize(9);
  doc.text(`Arrêtée la présente facture à la somme de ${amountInWords(totals.ttc)}.`, left, y + 8, {
    width,
  });
  if (data.vatRate === 0) doc.text('TVA non applicable.', { width });

  // ── Conditions, paiement, mentions ─────────────────────────────────────────
  const paragraphs: [string, string][] = [];
  const terms = fill(config.texts.paymentTerms);
  if (terms) paragraphs.push(['Conditions de paiement', terms]);
  if (config.blocks.bank) {
    const bank = [
      data.agency.bankName ? `Banque : ${data.agency.bankName}` : null,
      data.agency.bankAccount ? `RIB / IBAN : ${data.agency.bankAccount}` : null,
      data.agency.mobileMoneyNumber
        ? `Wave / Orange Money : ${data.agency.mobileMoneyNumber}`
        : null,
    ].filter(Boolean);
    if (bank.length) paragraphs.push(['Coordonnées de paiement', bank.join('   ')]);
  }
  const notes = fill(config.texts.notes);
  if (notes) paragraphs.push(['Notes', notes]);
  doc.moveDown(1);
  for (const [title, text] of paragraphs) {
    doc.fillColor(primary).font(font.bold).fontSize(9).text(title, left, undefined, { width });
    doc.fillColor(TEXT).font(font.regular).fontSize(9).text(text, { width });
    doc.moveDown(0.6);
  }

  if (config.blocks.signature) {
    const box = { x: right - 200, y: Math.min(doc.y + 10, bottomLimit - 90), w: 200, h: 90 };
    doc.rect(box.x, box.y, box.w, box.h).strokeColor(LINE).stroke();
    doc
      .fillColor(MUTED)
      .font(font.regular)
      .fontSize(8)
      .text('Signature et cachet', box.x + 6, box.y + 6);
    const style = config.signatureStyle ?? InvoiceSignatureStyle.BOX;
    if (style === InvoiceSignatureStyle.IMAGE && data.agency.stamp) {
      try {
        doc.image(data.agency.stamp, box.x + 10, box.y + 18, {
          fit: [box.w - 20, box.h - 24],
          align: 'center',
          valign: 'center',
        });
      } catch {
        // Image illisible : cadre vide, à signer à la main
      }
    } else if (style === InvoiceSignatureStyle.GENERATED) {
      drawGeneratedStamp(doc, data, { x: box.x + 25, y: box.y + 20, w: 150, h: 62 }, font);
    }
  }

  const footer = fill(config.texts.footer);
  if (footer) {
    doc
      .fillColor(MUTED)
      .font(font.regular)
      .fontSize(8)
      .text(footer, left, doc.page.height - 70, { width, align: 'center' });
  }

  if (data.watermark) {
    doc.save();
    doc.rotate(-30, { origin: [pageWidth / 2, doc.page.height / 2] });
    doc
      .fillColor(WATERMARK_COLORS[data.watermark])
      .fillOpacity(0.25)
      .font('Helvetica-Bold')
      // Taille réduite pour les mots longs : la mention reste dans la page une fois inclinée
      .fontSize(data.watermark.length > 7 ? 70 : 90)
      .text(data.watermark, 0, doc.page.height / 2 - 45, { width: pageWidth, align: 'center' });
    doc.restore();
  }

  doc.end();
  return done;
}

/**
 * Cachet dessiné (sans scan) : double cadre légèrement incliné, à la couleur d'un tampon encreur,
 * avec la raison sociale, l'adresse, le NINEA et le RCCM de l'agence. Un repère visuel, pas une
 * signature électronique : il n'atteste rien de plus que les mentions déjà imprimées.
 */
function drawGeneratedStamp(
  doc: PDFKit.PDFDocument,
  data: InvoiceRenderData,
  area: { x: number; y: number; w: number; h: number },
  font: { regular: string; bold: string },
) {
  const ink = '#1e3a8a';
  const { agency } = data;
  doc.save();
  doc.rotate(-4, { origin: [area.x + area.w / 2, area.y + area.h / 2] });
  doc.opacity(0.85).strokeColor(ink).lineWidth(1.6);
  doc.roundedRect(area.x, area.y, area.w, area.h, 6).stroke();
  doc
    .lineWidth(0.6)
    .roundedRect(area.x + 3, area.y + 3, area.w - 6, area.h - 6, 4)
    .stroke();
  // Une ligne par mention, coupée par « … » si elle dépasse : le cachet garde sa forme
  const line = (text: string, y: number, size: number, bold = false) =>
    doc
      .fillColor(ink)
      .font(bold ? font.bold : font.regular)
      .fontSize(size)
      .text(text, area.x + 8, area.y + y, {
        width: area.w - 16,
        height: size + 2,
        align: 'center',
        ellipsis: true,
      });
  line((agency.companyName ?? agency.name).toUpperCase(), 8, 8.5, true);
  line(agency.address, 19, 6.5);
  if (agency.ninea) line(`NINEA ${agency.ninea}`, 28, 6.5);
  if (agency.rccm) line(`RCCM ${agency.rccm}`, 37, 6.5);
  line('LA DIRECTION', 48, 7, true);
  doc.restore();
}

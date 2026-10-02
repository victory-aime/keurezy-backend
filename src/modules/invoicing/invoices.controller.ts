import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { API_URL } from '../../config/api';
import { AgencyProfileId } from '../../guard/current-user.decorator';
import { RequirePermission } from '../../guard/permission.guard';
import {
  CancelInvoiceDto,
  CreateInvoiceDto,
  InvoiceDraftDto,
  ListInvoicesDto,
  PayInvoiceDto,
} from './invoices.dto';
import { InvoicesService } from './invoices.service';

/** Factures de l'agence à ses clients. Owner, et staff avec la permission de facturation. */
@ApiTags('Invoicing')
@Controller()
@ApiBearerAuth()
@RequirePermission('manage_invoices')
@ApiQuery({ name: 'agencyId', required: true, description: "Identifiant de l'agence" })
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Get(API_URL.INVOICING.INVOICES)
  @ApiOperation({ summary: 'Factures de l’agence (paginées), avec le nombre par statut' })
  list(
    @Query('agencyId') agencyId: string,
    @AgencyProfileId() userId: string,
    @Query() query: ListInvoicesDto,
  ) {
    return this.invoices.list(agencyId, userId, query);
  }

  @Get(API_URL.INVOICING.INVOICE_BOOKINGS)
  @ApiOperation({ summary: 'Réservations confirmées ou terminées, à facturer' })
  bookings(@Query('agencyId') agencyId: string, @AgencyProfileId() userId: string) {
    return this.invoices.invoiceableBookings(agencyId, userId);
  }

  @Get(API_URL.INVOICING.INVOICE_DETAIL)
  @ApiQuery({ name: 'id', required: true })
  @ApiNotFoundResponse({ description: 'INVOICE_NOT_FOUND' })
  get(
    @Query('agencyId') agencyId: string,
    @Query('id') id: string,
    @AgencyProfileId() userId: string,
  ) {
    return this.invoices.get(agencyId, userId, id);
  }

  @Post(API_URL.INVOICING.INVOICES)
  @ApiOperation({ summary: 'Nouveau brouillon : depuis une réservation ou facture libre' })
  @ApiNotFoundResponse({ description: 'BOOKING_NOT_INVOICEABLE, TEMPLATE_NOT_FOUND' })
  @ApiUnprocessableEntityResponse({ description: 'DRAFT_REQUIRED, INVOICE_TOTAL_TOO_LARGE' })
  create(
    @Query('agencyId') agencyId: string,
    @AgencyProfileId() userId: string,
    @Body() data: CreateInvoiceDto,
  ) {
    return this.invoices.create(agencyId, userId, data);
  }

  @Patch(API_URL.INVOICING.INVOICES)
  @ApiOperation({ summary: 'Modifier un brouillon' })
  @ApiQuery({ name: 'id', required: true })
  @ApiConflictResponse({ description: 'INVOICE_NOT_DRAFT' })
  update(
    @Query('agencyId') agencyId: string,
    @Query('id') id: string,
    @AgencyProfileId() userId: string,
    @Body() data: InvoiceDraftDto,
  ) {
    return this.invoices.update(agencyId, userId, id, data);
  }

  @Delete(API_URL.INVOICING.INVOICES)
  @ApiOperation({ summary: 'Supprimer un brouillon' })
  @ApiQuery({ name: 'id', required: true })
  @ApiConflictResponse({ description: 'INVOICE_NOT_DRAFT' })
  remove(
    @Query('agencyId') agencyId: string,
    @Query('id') id: string,
    @AgencyProfileId() userId: string,
  ) {
    return this.invoices.remove(agencyId, userId, id);
  }

  @Post(API_URL.INVOICING.INVOICE_ISSUE)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Émettre un brouillon',
    description: 'Attribue le numéro suivant et fige le contenu : la facture ne se modifie plus.',
  })
  @ApiQuery({ name: 'id', required: true })
  @ApiConflictResponse({ description: 'INVOICE_NOT_DRAFT' })
  issue(
    @Query('agencyId') agencyId: string,
    @Query('id') id: string,
    @AgencyProfileId() userId: string,
  ) {
    return this.invoices.issue(agencyId, userId, id);
  }

  @Post(API_URL.INVOICING.INVOICE_PAY)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Marquer une facture émise comme payée' })
  @ApiQuery({ name: 'id', required: true })
  @ApiConflictResponse({ description: 'INVOICE_WRONG_STATUS' })
  @ApiUnprocessableEntityResponse({ description: 'PAID_IN_FUTURE, PAID_BEFORE_ISSUE' })
  pay(
    @Query('agencyId') agencyId: string,
    @Query('id') id: string,
    @AgencyProfileId() userId: string,
    @Body() data: PayInvoiceDto,
  ) {
    return this.invoices.pay(agencyId, userId, id, data);
  }

  @Post(API_URL.INVOICING.INVOICE_CANCEL)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Annuler une facture émise ou payée (motif obligatoire)' })
  @ApiQuery({ name: 'id', required: true })
  @ApiConflictResponse({ description: 'INVOICE_WRONG_STATUS' })
  cancel(
    @Query('agencyId') agencyId: string,
    @Query('id') id: string,
    @AgencyProfileId() userId: string,
    @Body() data: CancelInvoiceDto,
  ) {
    return this.invoices.cancel(agencyId, userId, id, data);
  }

  @Get(API_URL.INVOICING.INVOICE_PDF)
  @ApiOperation({ summary: 'PDF d’une facture (brouillon : mention BROUILLON)' })
  @ApiQuery({ name: 'id', required: true })
  @ApiQuery({ name: 'download', required: false, description: '1 : téléchargement' })
  @ApiOkResponse({ description: 'application/pdf' })
  async pdf(
    @Query('agencyId') agencyId: string,
    @Query('id') id: string,
    @Query('download') download: string | undefined,
    @AgencyProfileId() userId: string,
  ) {
    const { filename, pdf } = await this.invoices.pdf(agencyId, userId, id);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `${download === '1' ? 'attachment' : 'inline'}; filename="${filename}"`,
    });
  }
}

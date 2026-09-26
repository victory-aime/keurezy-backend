import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { ApiTags } from '@nestjs/swagger';
import { PaymentService } from './services/payment.service';
import { API_URL } from '../../config/api';
import { NabooSignatureGuard } from '../../guard/naboo.guard';

@ApiTags('Payments')
@Controller()
export class PaymentsController {
  private readonly logger = new Logger(PaymentsController.name);
  constructor(private readonly paymentService: PaymentService) {}

  @AllowAnonymous()
  @Post('webhooks/naboo')
  @UseGuards(NabooSignatureGuard)
  @HttpCode(HttpStatus.OK)
  handleWebhook(@Body() payload: any) {
    setImmediate(() => {
      this.paymentService.handleWebhook(payload).catch((err) => {
        this.logger.error('Erreur traitement webhook:', err.message, err.stack);
      });
    });
    return { received: true };
  }

  @AllowAnonymous()
  @Get(API_URL.COMMON.PAYMENT_POLLING)
  getPaymentStatus(@Query('orderId') orderId: string) {
    return this.paymentService.getPaymentStatus(orderId);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtGuard } from 'src/auth/guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import { CreateTicketPaymentDto } from './dto/create-ticket-payment.dto';
import { TicketPaymentService } from './ticket-payment.service';

@Controller('payments')
export class PaymentsController {
  constructor(private payments: TicketPaymentService) {}

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(['Technician', 'Admin', 'Supervisor', 'Administrator'])
  @Get('tickets/:crmTicketId')
  listForTicket(@Param('crmTicketId') crmTicketId: string) {
    return this.payments.listForTicket(crmTicketId);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(['Technician', 'Admin', 'Supervisor', 'Administrator'])
  @Post('tickets/:crmTicketId')
  async initiate(
    @Req() req: { user: { id: string } },
    @Param('crmTicketId') crmTicketId: string,
    @Body() body: CreateTicketPaymentDto,
  ) {
    if (
      !body.resend_sms &&
      !body.invoice_id &&
      !(body.items?.length || body.charge_codes?.length)
    ) {
      throw new BadRequestException(
        'items, charge_codes, invoice_id, or resend_sms is required',
      );
    }
    return this.payments.initiateForTicket(crmTicketId, body, req.user.id);
  }

  @Get('public/:reference/summary')
  getPublicSummary(@Param('reference') reference: string) {
    return this.payments.getPublicCheckoutSummary(reference);
  }

  /** Starts BML hosted checkout (pay.bml.com.mv). No auth. */
  @Get('public/:reference/bml')
  async goToBml(@Param('reference') reference: string, @Res() res: Response) {
    const url = await this.payments.resolveBmlHostedRedirect(reference);
    res.setHeader('Cache-Control', 'no-store');
    return res.redirect(302, url);
  }

  /** Legacy SMS link — routes to checkout or BML. No auth. */
  @Get('public/:reference/open')
  async openCustomerPayment(
    @Param('reference') reference: string,
    @Res() res: Response,
  ) {
    const result = await this.payments.resolveCustomerPaymentOpen(reference);
    if (result.kind === 'redirect') {
      return res.redirect(302, result.url);
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.type('text/html').send(result.html);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(['Technician', 'Admin', 'Supervisor', 'Administrator'])
  @Get(':reference')
  async getPayment(@Param('reference') reference: string) {
    return this.payments.getByReference(reference);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(['Technician', 'Admin', 'Supervisor', 'Administrator'])
  @Post(':reference/reconcile')
  async reconcile(
    @Req() req: { user: { id: string } },
    @Param('reference') reference: string,
  ) {
    return this.payments.reconcile(reference, req.user.id);
  }

  @Post('webhooks/bml')
  async bmlWebhook(
    @Req()
    req: {
      headers: Record<string, string | string[] | undefined>;
      body: Record<string, unknown>;
    },
  ) {
    return this.payments.processWebhook(req.body ?? {}, req.headers);
  }
}

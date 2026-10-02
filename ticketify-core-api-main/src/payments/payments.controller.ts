import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { JwtGuard } from 'src/auth/guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import {
  TicketAccessGuard,
  TicketScope,
} from 'src/infrastructure/security/ticket-access.guard';
import { CreateTicketPaymentDto } from './dto/create-ticket-payment.dto';
import { TicketPaymentService } from './ticket-payment.service';

const REFERENCE_PATTERN = /^TKT-PAY-[A-Za-z0-9_-]{4,64}$/;

function assertReference(reference: string): string {
  if (!REFERENCE_PATTERN.test(reference ?? '')) {
    throw new BadRequestException('Invalid payment reference');
  }
  return reference;
}

@Controller('payments')
export class PaymentsController {
  constructor(private payments: TicketPaymentService) {}

  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles(['Technician', 'Admin', 'Supervisor', 'Administrator'])
  @Get('tickets/:crmTicketId')
  listForTicket(@Param('crmTicketId') crmTicketId: string) {
    return this.payments.listForTicket(crmTicketId);
  }

  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles(['Technician', 'Admin', 'Supervisor', 'Administrator'])
  @Throttle({ default: { limit: 10, ttl: 60000 } })
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

  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  @Get('public/:reference/summary')
  getPublicSummary(@Param('reference') reference: string) {
    return this.payments.getPublicCheckoutSummary(assertReference(reference));
  }

  /** Return page: asks BML for the real result. Never trusts redirect query params. */
  @Throttle({ default: { limit: 40, ttl: 60000 } })
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('public/:reference/verify')
  verifyPublic(@Param('reference') reference: string) {
    return this.payments.verifyPublic(assertReference(reference));
  }

  /** Starts BML hosted checkout (pay.bml.com.mv). No auth. */
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Get('public/:reference/bml')
  async goToBml(@Param('reference') reference: string, @Res() res: Response) {
    const url = await this.payments.resolveBmlHostedRedirect(
      assertReference(reference),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return res.redirect(302, url);
  }

  /** Legacy SMS link — routes to checkout or BML. No auth. */
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Get('public/:reference/open')
  async openCustomerPayment(
    @Param('reference') reference: string,
    @Res() res: Response,
  ) {
    const result = await this.payments.resolveCustomerPaymentOpen(
      assertReference(reference),
    );
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    if (result.kind === 'redirect') {
      return res.redirect(302, result.url);
    }
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.type('text/html').send(result.html);
  }

  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('reference', 'payment')
  @Roles(['Technician', 'Admin', 'Supervisor', 'Administrator'])
  @Get(':reference')
  async getPayment(@Param('reference') reference: string) {
    return this.payments.getByReference(reference);
  }

  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('reference', 'payment')
  @Roles(['Technician', 'Admin', 'Supervisor', 'Administrator'])
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post(':reference/reconcile')
  async reconcile(
    @Req() req: { user: { id: string } },
    @Param('reference') reference: string,
  ) {
    return this.payments.reconcile(reference, req.user.id);
  }

  @Throttle({ default: { limit: 120, ttl: 60000 } })
  @HttpCode(200)
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

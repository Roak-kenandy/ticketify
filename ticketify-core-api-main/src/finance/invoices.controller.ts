import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import {
  TicketAccessGuard,
  TicketScope,
} from 'src/infrastructure/security/ticket-access.guard';
import { CreateInvoiceDto } from './dto/create-invoice.dto';
import { TicketInvoiceService } from './ticket-invoice.service';
import { TicketReceiptService } from './ticket-receipt.service';
import { Access } from 'src/auth/access/access';
import { FIELD } from 'src/auth/access/requirements';

@Controller('invoices')
export class InvoicesController {
  constructor(
    private invoices: TicketInvoiceService,
    private receipts: TicketReceiptService,
  ) {}

  @UseGuards(JwtGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Access(FIELD)
  @Get('tickets/:crmTicketId')
  listForTicket(@Param('crmTicketId') crmTicketId: string) {
    return this.invoices.listForTicket(crmTicketId);
  }

  @UseGuards(JwtGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Access(FIELD)
  @Post('tickets/:crmTicketId')
  create(
    @Req() req: { user: { id: string } },
    @Param('crmTicketId') crmTicketId: string,
    @Body() body: CreateInvoiceDto,
  ) {
    return this.invoices.createFromChargeCodes(
      crmTicketId,
      body.charge_codes,
      req.user.id,
      body.issue !== false,
    );
  }

  @UseGuards(JwtGuard, TicketAccessGuard)
  @TicketScope('id', 'invoice')
  @Access(FIELD)
  @Get(':id')
  getInvoice(@Param('id') id: string) {
    return this.invoices.getById(id);
  }

  @UseGuards(JwtGuard, TicketAccessGuard)
  @TicketScope('id', 'invoice')
  @Access(FIELD)
  @Get(':id/receipt')
  async getReceiptForInvoice(@Param('id') id: string) {
    const invoice = await this.invoices.getById(id);
    return (
      invoice.receipt ?? { message: 'No receipt yet — payment not confirmed' }
    );
  }
}

@Controller('receipts')
export class ReceiptsController {
  constructor(private receipts: TicketReceiptService) {}

  @UseGuards(JwtGuard, TicketAccessGuard)
  @TicketScope('reference', 'payment')
  @Access(FIELD)
  @Get('payments/:reference')
  async byPayment(@Param('reference') reference: string) {
    const receipt = await this.receipts.getByPaymentReference(reference);
    if (!receipt) {
      return { found: false };
    }
    return receipt;
  }

  @UseGuards(JwtGuard, TicketAccessGuard)
  @TicketScope('receiptNumber', 'receipt')
  @Access(FIELD)
  @Get(':receiptNumber')
  byNumber(@Param('receiptNumber') receiptNumber: string) {
    return this.receipts.getByReceiptNumber(receiptNumber);
  }
}

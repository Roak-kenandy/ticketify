import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtGuard } from 'src/auth/guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import {
  TicketAccessGuard,
  TicketScope,
} from 'src/infrastructure/security/ticket-access.guard';
import {
  FIELD_ROLES,
  INVENTORY_ROLES,
  ITEM_MASTER_ROLES,
} from 'src/auth/ops-roles';
import {
  InventoryAdjustmentDto,
  InventoryDeclarationDto,
  InventoryItemDto,
  InventoryItemUpdateDto,
  InventoryReversalDto,
} from './dto/inventory.dto';
import { InventoryItemsService } from './inventory-items.service';
import {
  InventoryActor,
  TicketInventoryService,
} from './ticket-inventory.service';
import {
  InventoryReportQuery,
  InventoryReportService,
} from './inventory-report.service';

const TICKET_ROLES = [...new Set([...FIELD_ROLES, ...INVENTORY_ROLES])];

type AuthedRequest = { user: InventoryActor };

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly items: InventoryItemsService,
    private readonly tickets: TicketInventoryService,
    private readonly report: InventoryReportService,
  ) {}

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(TICKET_ROLES)
  @Get('items')
  listItems(
    @Query('include_inactive', new ParseBoolPipe({ optional: true }))
    includeInactive?: boolean,
  ) {
    return this.items.list(Boolean(includeInactive));
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(TICKET_ROLES)
  @Get('items/:id')
  getItem(@Param('id') id: string) {
    return this.items.get(id);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(ITEM_MASTER_ROLES)
  @Post('items')
  createItem(@Req() req: AuthedRequest, @Body() body: InventoryItemDto) {
    return this.items.create(body, req.user.id);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(ITEM_MASTER_ROLES)
  @Patch('items/:id')
  updateItem(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: InventoryItemUpdateDto,
  ) {
    return this.items.update(id, body, req.user.id);
  }

  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles(TICKET_ROLES)
  @Get('tickets/:crmTicketId')
  ticketInventory(@Param('crmTicketId') crmTicketId: string) {
    return this.tickets.view(crmTicketId);
  }

  @UseGuards(JwtGuard, RolesGuard, TicketAccessGuard)
  @TicketScope('crmTicketId')
  @Roles(TICKET_ROLES)
  @Post('tickets/:crmTicketId/declaration')
  declare(
    @Req() req: AuthedRequest,
    @Param('crmTicketId') crmTicketId: string,
    @Body() body: InventoryDeclarationDto,
  ) {
    return this.tickets.declare(crmTicketId, req.user, body);
  }

  /** Ticket access is checked in the service once the line's ticket is known. */
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(TICKET_ROLES)
  @Post('consumptions/:id/reverse')
  reverse(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: InventoryReversalDto,
  ) {
    return this.tickets.reverse(id, req.user, body.reason);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(INVENTORY_ROLES)
  @Post('consumptions/:id/adjust')
  adjust(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() body: InventoryAdjustmentDto,
  ) {
    return this.tickets.adjust(id, req.user, body.quantity, body.reason);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(INVENTORY_ROLES)
  @Get('report/filters')
  reportFilters() {
    return this.report.filterOptions();
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(INVENTORY_ROLES)
  @Get('report')
  async reportRows(@Query() query: InventoryReportQuery) {
    const rows = await this.report.list(query);
    return { rows, summary: this.report.summarize(rows) };
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(INVENTORY_ROLES)
  @Get('report/export')
  async exportReport(
    @Query() query: InventoryReportQuery & { format?: string },
    @Res() res: Response,
  ) {
    const rows = await this.report.list(query);
    const stamp = new Date().toISOString().slice(0, 10);
    if (query.format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="inventory-consumption-${stamp}.csv"`,
      );
      res.send(this.report.toCsv(rows));
      return;
    }
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="inventory-consumption-${stamp}.xls"`,
    );
    res.send(this.report.toExcel(rows));
  }
}

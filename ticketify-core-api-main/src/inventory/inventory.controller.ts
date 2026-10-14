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
import { StockIssueDto, StockReturnDto } from './dto/stock.dto';
import { displayDate, ReportColumn, ReportMeta, toCsv, toExcel } from './report-format';
import { StockReportQuery, StockReportService } from './stock-report.service';
import { TechnicianStockService } from './technician-stock.service';

const TICKET_ROLES = [...new Set([...FIELD_ROLES, ...INVENTORY_ROLES])];

type AuthedRequest = { user: InventoryActor };

@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly items: InventoryItemsService,
    private readonly tickets: TicketInventoryService,
    private readonly report: InventoryReportService,
    private readonly stock: TechnicianStockService,
    private readonly stockReport: StockReportService,
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

  /** The caller's own issued stock; the field app only offers these items. */
  @UseGuards(JwtGuard, RolesGuard)
  @Roles(TICKET_ROLES)
  @Get('stock/mine')
  myStock(@Req() req: AuthedRequest) {
    return this.stock.mine(req.user);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(INVENTORY_ROLES)
  @Get('stock/technicians')
  stockTechnicians() {
    return this.stock.technicians();
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(INVENTORY_ROLES)
  @Post('stock/issue')
  issueStock(@Req() req: AuthedRequest, @Body() body: StockIssueDto) {
    return this.stock.issue(req.user, body);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(INVENTORY_ROLES)
  @Post('stock/return')
  returnStock(@Req() req: AuthedRequest, @Body() body: StockReturnDto) {
    return this.stock.returnStock(req.user, body);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(INVENTORY_ROLES)
  @Get('stock/summary')
  stockSummary(@Query() query: StockReportQuery) {
    return this.stockReport.summary(query);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(INVENTORY_ROLES)
  @Get('stock/summary/export')
  async exportStockSummary(
    @Query() query: StockReportQuery & { format?: string },
    @Res() res: Response,
  ) {
    const [{ rows }, meta] = await Promise.all([
      this.stockReport.summary(query),
      this.stockReport.exportMeta('Technician stock', query, 'in hand is the balance right now'),
    ]);
    sendSheet(res, query.format, 'technician-stock', 'Technician stock', this.stockReport.summaryColumns, rows, meta);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(INVENTORY_ROLES)
  @Get('stock/movements')
  stockMovements(@Query() query: StockReportQuery) {
    return this.stockReport.movements(query);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(INVENTORY_ROLES)
  @Get('stock/movements/export')
  async exportStockMovements(
    @Query() query: StockReportQuery & { format?: string },
    @Res() res: Response,
  ) {
    const [rows, meta] = await Promise.all([
      this.stockReport.movements(query),
      this.stockReport.exportMeta('Stock issues and returns', query, 'by date / time of each issue or return'),
    ]);
    sendSheet(res, query.format, 'stock-issues-returns', 'Issues and returns', this.stockReport.movementColumns, rows, meta);
  }

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(INVENTORY_ROLES)
  @Get('stock/serials')
  stockSerials(@Query() query: StockReportQuery) {
    return this.stockReport.serials(query);
  }
}

function sendSheet<Row>(
  res: Response,
  format: string | undefined,
  fileName: string,
  sheetName: string,
  columns: ReportColumn<Row>[],
  rows: Row[],
  meta: ReportMeta = [],
) {
  const stamp = displayDate(new Date()).replace(' ', '-').replace(':', '');
  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}-${stamp}.csv"`);
    res.send(toCsv(columns, rows, meta));
    return;
  }
  res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}-${stamp}.xls"`);
  res.send(toExcel(sheetName, columns, rows, meta));
}

import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';
import { addTaxToSubtotal, parseGstRate } from 'src/finance/tax.util';

export type ChargeLineInput = { code: string; quantity: number };

export type ResolvedChargeLine = {
  code: string;
  label: string;
  unit_amount_mvr: string;
  quantity: number;
  line_total_mvr: string;
};

@Injectable()
export class ChargeCatalogService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  gstRate(): number {
    return parseGstRate(this.config.get<string>('TICKETIFY_GST_RATE'));
  }

  async catalogWithMeta() {
    const items = await this.prisma.chargeCatalogItem.findMany({
      where: { active: true },
      orderBy: { label: 'asc' },
    });
    return {
      currency: 'MVR',
      gst_rate: this.gstRate(),
      items: items.map(i => ({
        code: i.code,
        label: i.label,
        amount_mvr: i.amount_mvr.toString(),
        quantity_enabled: true,
      })),
    };
  }

  async resolveLines(items: ChargeLineInput[]): Promise<{
    lines: ResolvedChargeLine[];
    subtotal_mvr: number;
    tax_mvr: number;
    total_mvr: number;
    gst_rate: number;
  }> {
    if (!items?.length) {
      throw new BadRequestException('Select at least one charge item');
    }

    const codes = items.map(i => i.code);
    const catalog = await this.prisma.chargeCatalogItem.findMany({
      where: { code: { in: codes }, active: true },
    });
    const byCode = new Map(catalog.map(c => [c.code, c]));

    const lines: ResolvedChargeLine[] = [];
    let subtotalRaw = 0;

    for (const input of items) {
      const qty = Math.max(1, Math.floor(Number(input.quantity) || 1));
      const row = byCode.get(input.code);
      if (!row) {
        throw new BadRequestException(`Unknown charge code: ${input.code}`);
      }
      const unit = Number(row.amount_mvr);
      const lineTotal = unit * qty;
      subtotalRaw += lineTotal;
      lines.push({
        code: row.code,
        label: row.label,
        unit_amount_mvr: row.amount_mvr.toString(),
        quantity: qty,
        line_total_mvr: lineTotal.toFixed(2),
      });
    }

    const gst_rate = this.gstRate();
    const { subtotal, tax, total } = addTaxToSubtotal(subtotalRaw, gst_rate);

    return {
      lines,
      subtotal_mvr: subtotal,
      tax_mvr: tax,
      total_mvr: total,
      gst_rate,
    };
  }

  formatLinesForSms(lines: ResolvedChargeLine[]): string {
    return lines
      .map(l => `${l.label} x${l.quantity} (${l.line_total_mvr} MVR)`)
      .join('; ');
  }
}

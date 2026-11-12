import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';

export type SequencePrefix = 'INV' | 'RCP' | 'PAY';

@Injectable()
export class FinanceSequenceService {
  constructor(private prisma: PrismaService) {}

  async nextNumber(prefix: 'INV' | 'RCP'): Promise<string> {
    const { year, seq } = await this.next(prefix);
    return `${prefix}-${year}-${String(seq).padStart(6, '0')}`;
  }

  /** Yearly counter; the row lock keeps concurrent callers from sharing a number. */
  async next(prefix: SequencePrefix): Promise<{ year: number; seq: number }> {
    const key = `finance.${prefix.toLowerCase()}_sequence`;
    const year = new Date().getFullYear();

    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.systemConfig.findUnique({ where: { key } });
      if (!existing) {
        const seed =
          prefix === 'PAY' ? await this.paymentsThisYear(tx, year) : 0;
        await tx.$executeRaw`
          INSERT INTO system_config (key, value)
          VALUES (${key}, ${JSON.stringify({ year, seq: seed })}::jsonb)
          ON CONFLICT (key) DO NOTHING`;
      }
      const [row] = await tx.$queryRaw<
        { value: { year?: number; seq?: number } }[]
      >`
        SELECT value FROM system_config WHERE key = ${key} FOR UPDATE`;
      const current = row?.value ?? {};
      const seq = current.year === year ? (current.seq ?? 0) + 1 : 1;
      await tx.systemConfig.update({
        where: { key },
        data: { value: { year, seq } },
      });
      return { year, seq };
    });
  }

  private paymentsThisYear(
    tx: Pick<PrismaService, 'ticketPayment'>,
    year: number,
  ): Promise<number> {
    return tx.ticketPayment.count({
      where: { created_at: { gte: new Date(year, 0, 1) } },
    });
  }
}

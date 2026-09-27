import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';

@Injectable()
export class FinanceSequenceService {
  constructor(private prisma: PrismaService) {}

  async nextNumber(prefix: 'INV' | 'RCP'): Promise<string> {
    const key = `finance.${prefix.toLowerCase()}_sequence`;
    const year = new Date().getFullYear();

    const result = await this.prisma.$transaction(async (tx) => {
      const row = await tx.systemConfig.findUnique({ where: { key } });
      const current = (row?.value as { year?: number; seq?: number }) ?? {
        year,
        seq: 0,
      };
      const seq =
        current.year === year ? (current.seq ?? 0) + 1 : 1;
      await tx.systemConfig.upsert({
        where: { key },
        create: { key, value: { year, seq } },
        update: { value: { year, seq } },
      });
      return seq;
    });

    return `${prefix}-${year}-${String(result).padStart(6, '0')}`;
  }
}

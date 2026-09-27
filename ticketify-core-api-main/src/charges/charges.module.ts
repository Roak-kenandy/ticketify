import { Module } from '@nestjs/common';
import { ChargesController } from './charges.controller';
import { PrismaModule } from 'src/infrastructure/config/prisma/prisma.module';
import { ChargeCatalogService } from './charge-catalog.service';
import { AuthModule } from 'src/auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [ChargesController],
  providers: [ChargeCatalogService],
  exports: [ChargeCatalogService],
})
export class ChargesModule {}

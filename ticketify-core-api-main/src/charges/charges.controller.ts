import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { ChargeCatalogService } from './charge-catalog.service';
import { Access } from 'src/auth/access/access';
import { FIELD } from 'src/auth/access/requirements';

@Controller('charges')
export class ChargesController {
  constructor(private catalog: ChargeCatalogService) {}

  @UseGuards(JwtGuard)
  @Access(FIELD)
  @Get('catalog')
  getCatalog() {
    return this.catalog.catalogWithMeta();
  }
}

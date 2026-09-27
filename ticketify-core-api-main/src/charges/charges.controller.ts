import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtGuard } from 'src/auth/guard';
import { RolesGuard } from 'src/auth/guard/roles.guard';
import { Roles } from 'src/infrastructure/decorators/roles.decorator';
import { ChargeCatalogService } from './charge-catalog.service';

@Controller('charges')
export class ChargesController {
  constructor(private catalog: ChargeCatalogService) {}

  @UseGuards(JwtGuard, RolesGuard)
  @Roles(['Technician', 'Admin', 'Supervisor', 'Administrator'])
  @Get('catalog')
  getCatalog() {
    return this.catalog.catalogWithMeta();
  }
}

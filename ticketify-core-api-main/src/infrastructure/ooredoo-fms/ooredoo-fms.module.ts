import { Global, Module } from '@nestjs/common';
import { OoredooFmsClient } from './ooredoo-fms.client';

@Global()
@Module({
  providers: [OoredooFmsClient],
  exports: [OoredooFmsClient],
})
export class OoredooFmsModule {}

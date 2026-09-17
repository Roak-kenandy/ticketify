import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class EnvironmentConfigService {
  constructor(private configService: ConfigService) {}

  get DatabaseUrl(): string {
    return this.configService.get<string>('DATABASE_URL');
  }
}

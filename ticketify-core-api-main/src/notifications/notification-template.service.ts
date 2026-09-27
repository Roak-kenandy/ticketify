import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/infrastructure/config/prisma/prisma.service';

@Injectable()
export class NotificationTemplateService {
  constructor(private prisma: PrismaService) {}

  async render(
    triggerKey: string,
    variables: Record<string, string | number>,
  ): Promise<string | null> {
    const template = await this.prisma.notificationTemplate.findUnique({
      where: { trigger_key: triggerKey },
    });
    if (!template?.enabled) {
      return null;
    }
    let body = template.body_template;
    for (const [key, value] of Object.entries(variables)) {
      body = body.replace(new RegExp(`\\[${key}\\]`, 'g'), String(value));
    }
    return body;
  }
}

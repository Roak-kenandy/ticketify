import { HttpException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LoggerService } from 'src/infrastructure/logger/logger.service';

@Injectable()
export default class SMSService {
  constructor(
    private configService: ConfigService,
    private logger: LoggerService,
  ) {}

  async publishSMS(newNotification: { phone: string; message: string }) {
    const apiUrl =
      this.configService.get<string>('SMS_API_URL') ??
      'https://o-papi1-lb01.ooredoo.mv/bulk_sms/v2';
    const username = this.configService.get<string>('SMS_USERNAME');
    const accessKey = this.configService.get<string>('SMS_ACCESS_KEY');
    const authBearer = this.configService.get<string>('SMS_AUTH_BEARER');

    if (!username || !accessKey) {
      this.logger.error(
        'Notification Service',
        'SMS credentials missing (SMS_USERNAME / SMS_ACCESS_KEY)',
      );
      throw new HttpException(
        { status: 503, error: 'SMS not configured' },
        503,
      );
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (authBearer) {
        let authorization = authBearer.trim();
        authorization = authorization.replace(/^Bearer\s+Bearer\s+/i, 'Bearer ');
        if (!/^Bearer\s+/i.test(authorization)) {
          authorization = `Bearer ${authorization}`;
        }
        headers.Authorization = authorization;
      }

      const new_notification = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          username,
          access_key: accessKey,
          message: newNotification.message,
          batch: `960${newNotification.phone}`,
        }),
      });

      this.logger.log(
        'Notification Service',
        `SMS dispatch status ${new_notification.status}`,
      );

      if (!new_notification.ok) {
        const body = await new_notification.text().catch(() => '');
        this.logger.error(
          'Notification Service',
          `SMS API error ${new_notification.status}: ${body.slice(0, 200)}`,
        );
        throw new HttpException(
          {
            status: new_notification.status,
            error: 'SMS provider rejected the message',
          },
          502,
        );
      }

      return new_notification;
    } catch (error) {
      this.logger.error('Notification Service', `SMS failed: ${error}`);
      throw new HttpException(
        {
          status: 500,
          error: 'Failed to send SMS',
        },
        500,
      );
    }
  }
}

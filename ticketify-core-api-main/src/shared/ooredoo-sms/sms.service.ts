import * as OneSignal from 'onesignal-node';
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
    try {
      const new_notification = await fetch(
        'https://o-papi1-lb01.ooredoo.mv/bulk_sms/v2',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer Bearer 5f39b5d6-b51f-3cd6-928a-0882ea03fa63',
          },
          body: JSON.stringify({
            username: 'sms@medianet.mv',
            access_key:
              'eGRWT2w1cmtTT1loWUZzL09mQlY2SXpES1VTZjhnWGJrdkhFWEs0eTZaeGRxZlBvdFVXWmFWdVV2UnJNMkpOUA==',
            message: newNotification.message,
            batch: `960${newNotification.phone}`,
          }),
        },
      );

      this.logger.log(
        'Notification Service',
        'Sending notification' + JSON.stringify(newNotification),
      );

      return new_notification;
    } catch (error) {
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

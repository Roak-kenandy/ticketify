import { Injectable, PipeTransform } from '@nestjs/common';
import { HttpErrorByCode } from '@nestjs/common/utils/http-error-by-code.util';

@Injectable()
export class ParseDatePipe implements PipeTransform<string, Date> {
  transform(value: string): Date {
    const date = new Date(value);

    if (isNaN(date.getTime())) {
      throw new HttpErrorByCode['400']('Invalid date');
    }
    return date;
  }
}

import { Injectable } from '@nestjs/common';
import * as argon from 'argon2';

@Injectable()
export class Hasher {
  constructor() {}
  async hashPassword(password: string) {
    return await argon.hash(password);
  }
}

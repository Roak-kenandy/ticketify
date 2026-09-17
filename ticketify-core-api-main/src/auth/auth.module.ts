import { forwardRef, Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtModule } from '@nestjs/jwt';
import { LoggerModule } from 'src/infrastructure/logger/logger.module';
import { JwtStrategy } from './strategy';

@Module({
  imports: [JwtModule.register({}), LoggerModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}

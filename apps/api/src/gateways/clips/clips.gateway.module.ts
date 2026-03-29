import { Module } from '@nestjs/common';
import { ClipsGateway } from './clips.gateway';

@Module({
  providers: [ClipsGateway],
  exports: [ClipsGateway],
})
export class ClipsGatewayModule {}

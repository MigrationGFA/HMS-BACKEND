import { Module } from '@nestjs/common';
import { IcuController } from './icu.controller';
import { IcuService } from './icu.service';

@Module({
  imports: [],
  controllers: [IcuController],
  providers: [IcuService],
  exports: [IcuService],
})
export class IcuModule {}

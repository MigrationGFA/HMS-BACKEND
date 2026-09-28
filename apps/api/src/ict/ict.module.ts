import { Module } from '@nestjs/common';
import { IctController } from './ict.controller';
import { IctService } from './ict.service';

@Module({
  controllers: [IctController],
  providers: [IctService],
})
export class IctModule {}

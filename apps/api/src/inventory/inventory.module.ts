import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { StockController } from './stock.controller';
import { ProcurementController } from './procurement.controller';
import { InventoryService } from './inventory.service';

@Module({
  imports: [],
  controllers: [InventoryController, StockController, ProcurementController],
  providers: [InventoryService],
  exports: [InventoryService],
})
export class InventoryModule {}

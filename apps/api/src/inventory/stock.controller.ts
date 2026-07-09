import { Controller } from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Controller('inventory/stock')
export class StockController {
  constructor(private readonly inventoryService: InventoryService) {}
}

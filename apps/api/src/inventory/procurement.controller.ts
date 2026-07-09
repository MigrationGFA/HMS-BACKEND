import { Controller } from '@nestjs/common';
import { InventoryService } from './inventory.service';

@Controller('inventory/procurement')
export class ProcurementController {
  constructor(private readonly inventoryService: InventoryService) {}
}

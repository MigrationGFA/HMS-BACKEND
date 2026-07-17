import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreatePharmacyReturnDto } from './dto/pharmacy-return.dto';
import { PharmacyReturnsService } from './pharmacy-returns.service';

@Controller('pharmacy/returns')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PharmacyReturnsController {
  constructor(private readonly returnsService: PharmacyReturnsService) {}

  /**
   * Method: GET
   * URL: /api/pharmacy/returns/summary
   * Purpose: Summary cards for drug returns (today/week counts, units, value)
   * Required permission: pharmacy:return-read
   * Request body: none
   * Response example: { data: { todayCount, todayUnits, todayValue, weekCount, totalCount } }
   * Error cases: 401, 403
   */
  @Get('summary')
  @RequirePermissions(PERMISSIONS.PHARMACY_RETURN_READ)
  async summary() {
    const data = await this.returnsService.summary();
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/returns?q=&page=&limit=
   * Purpose: List completed drug returns
   * Required permission: pharmacy:return-read
   * Request body: none
   * Response example: { data: { items: [...], meta } }
   * Error cases: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.PHARMACY_RETURN_READ)
  async list(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.returnsService.list({
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/pharmacy/returns/lookup?q=RX-2026-0001
   * Purpose: Look up a dispensed Rx or walk-in sale with returnable line quantities
   * Required permission: pharmacy:return-read
   * Request body: none
   * Response example: { data: { sourceType, sourceId, refNo, lines: [{ sourceItemId, qtyReturnable, ... }] } }
   * Error cases: 400 short query, 401, 403, 404
   */
  @Get('lookup')
  @RequirePermissions(PERMISSIONS.PHARMACY_RETURN_READ)
  async lookup(@Query('q') q?: string) {
    const data = await this.returnsService.lookup(q ?? '');
    return { data };
  }

  /**
   * Method: POST
   * URL: /api/pharmacy/returns
   * Purpose: Commit a drug return (stock restored to batches, qtyReturned incremented)
   * Required permission: pharmacy:return-create
   * Request body: { sourceType, sourceId, items: [{ sourceItemId, quantity }], reason, returnedByRole, returnedByName }
   * Response example: { data: { returnId, returnNo, totalValue, items } }
   * Error cases: 400 qty exceeds returnable / not dispensed, 401, 403, 404
   */
  @Post()
  @RequirePermissions(PERMISSIONS.PHARMACY_RETURN_CREATE)
  async create(
    @Body() dto: CreatePharmacyReturnDto,
    @CurrentUser() user: AuthUser,
  ) {
    const data = await this.returnsService.create(dto, user);
    return { data };
  }
}

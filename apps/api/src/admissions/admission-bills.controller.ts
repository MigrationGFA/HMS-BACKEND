import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../common/constants';
import { AdmissionBillsService } from './admission-bills.service';

@Controller('admission-bills')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdmissionBillsController {
  constructor(private readonly service: AdmissionBillsService) {}

  /**
   * Method: GET
   * URL: /api/admission-bills?paymentStatus=&personId=&admissionId=&q=&page=&limit=
   * Purpose: List admission package bills
   * Required permission: admission:read
   * Response: { data: { items, meta } }
   * Errors: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  async list(
    @Query('paymentStatus') paymentStatus?: string,
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const data = await this.service.list({
      paymentStatus,
      personId: personId ? Number(personId) : undefined,
      admissionId: admissionId ? Number(admissionId) : undefined,
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data };
  }

  /**
   * Method: GET
   * URL: /api/admissions/billing-items
   * (registered on wards/admissions controller — see below)
   */

  /**
   * Method: GET
   * URL: /api/admission-bills/:id
   * Purpose: Admission bill detail with line items
   * Required permission: admission:read
   * Response: { data: AdmissionBill }
   * Errors: 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.ADMISSION_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const data = await this.service.findById(id);
    return { data };
  }
}

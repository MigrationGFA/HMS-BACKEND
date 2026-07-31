import { Controller, Get, Query } from '@nestjs/common';
import { ServiceCatalogService } from './service-catalog.service';

/**
 * Public (no JWT) catalog endpoints for the marketing / landing site.
 * Keep this controller free of JwtAuthGuard / PermissionsGuard.
 */
@Controller('billing')
export class PublicServiceCatalogController {
  constructor(private readonly catalog: ServiceCatalogService) {}

  /**
   * Method: GET
   * URL: /api/billing/services/bookable?q=&categoryId=
   * Purpose: ACTIVE + ONLINE_BOOKABLE services for public appointment booking
   * Required permission: public (no auth)
   * Response: { data: { items: [{ serviceId, serviceCode, name, categoryName, departmentName, generalPrice, durationMinutes, appointmentRequired }] } }
   * Errors: 500
   */
  @Get('services/bookable')
  async listBookable(
    @Query('q') q?: string,
    @Query('categoryId') categoryId?: string,
  ) {
    return {
      data: await this.catalog.listBookable({
        q,
        categoryId: categoryId ? Number(categoryId) : undefined,
      }),
    };
  }
}

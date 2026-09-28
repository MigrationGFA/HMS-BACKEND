import { Controller, Get, Param } from '@nestjs/common';
import { CmsService } from './cms.service';

@Controller('public/site')
export class CmsPublicController {
  constructor(private readonly cms: CmsService) {}

  /**
   * Method: GET
   * URL: /api/public/site/:pageSlug
   * Purpose: Published marketing page payload for the public website
   */
  @Get(':pageSlug')
  async getPublished(@Param('pageSlug') pageSlug: string) {
    const data = await this.cms.getPageBySlug(pageSlug, true);
    return { data };
  }
}

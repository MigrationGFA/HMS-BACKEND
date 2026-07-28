import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
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
import { CreateLabTestDto, UpdateLabTestDto } from './dto/lab.dto';
import { LaboratoryService } from './laboratory.service';

@Controller('laboratory/tests')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LabTestsController {
  constructor(private readonly laboratoryService: LaboratoryService) {}

  /**
   * Method: POST
   * URL: /api/laboratory/tests
   * Purpose: Create a lab test catalog entry (admin)
   * Required permission: lab:update
   * Request body: { testCode, name, category, specimenType, turnaround, unitPrice, container?, loincCode?, isPanel?, status? }
   * Response example: { data: { labTestId, testCode, name, unitPrice, status: "Active" } }
   * Error cases: 400 duplicate code, 401, 403
   */
  @Post()
  @RequirePermissions(PERMISSIONS.LAB_UPDATE)
  async create(@Body() dto: CreateLabTestDto, @CurrentUser() user: AuthUser) {
    const test = await this.laboratoryService.createTest(dto, user);
    return { data: test };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/tests?q=&category=&status=&page=&limit=
   * Purpose: Lab test catalog for doctor picker / admin
   * Required permission: lab:read
   * Request body: none
   * Response example: { data: { items: [{ labTestId, testCode, name, category, specimenType, turnaround, unitPrice }], meta } }
   * Error cases: 401, 403
   */
  @Get()
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async list(
    @Query('q') q?: string,
    @Query('category') category?: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.laboratoryService.listTests({
      q,
      category,
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 100,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/laboratory/tests/:id
   * Purpose: Lab test detail
   * Required permission: lab:read
   * Request body: none
   * Response example: { data: { labTestId, testCode, name, ... } }
   * Error cases: 401, 403, 404
   */
  @Get(':id')
  @RequirePermissions(PERMISSIONS.LAB_READ)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const test = await this.laboratoryService.findTestById(id);
    return { data: test };
  }

  /**
   * Method: PATCH
   * URL: /api/laboratory/tests/:id
   * Purpose: Update catalog price/status/metadata
   * Required permission: lab:update
   * Request body: partial UpdateLabTestDto
   * Response example: { data: { labTestId, unitPrice, status } }
   * Error cases: 400, 401, 403, 404
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.LAB_UPDATE)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateLabTestDto,
    @CurrentUser() user: AuthUser,
  ) {
    const test = await this.laboratoryService.updateTest(id, dto, user);
    return { data: test };
  }
}

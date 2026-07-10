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
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '../auth/types/auth-user.type';
import { CreateTriageDto, UpdateTriageDto } from './dto/triage.dto';
import { TriageService } from './triage.service';

@Controller('triage')
export class TriageController {
  constructor(private readonly triageService: TriageService) {}

  /**
   * Method: POST
   * URL: /api/triage
   * Purpose: Create triage queue entry + vitals for a person
   * Required permission: JWT
   * Request body: CreateTriageDto (personId required; vitals optional)
   * Response example: { data: { triageId, queueNo, personId, person: {...}, ... } }
   * Error cases: 400 validation, 401 unauthorized, 404 person not found
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  async create(@Body() dto: CreateTriageDto, @CurrentUser() user: AuthUser) {
    const row = await this.triageService.create(dto, user);
    return { data: row };
  }

  /**
   * Method: GET
   * URL: /api/triage?status=&clinic=&priority=&q=&page=&limit=
   * Purpose: List triage queue (person demographics joined by PERSON_ID)
   * Required permission: JWT
   * Request body: none
   * Response example: { data: { items: [...], meta } }
   * Error cases: 401 unauthorized
   */
  @Get()
  @UseGuards(JwtAuthGuard)
  async list(
    @Query('status') status?: string,
    @Query('clinic') clinic?: string,
    @Query('priority') priority?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.triageService.list({
      status,
      clinic,
      priority,
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/triage/:id
   * Purpose: Get triage by id
   * Required permission: JWT
   * Request body: none
   * Response example: { data: { triageId, personId, person, vitals... } }
   * Error cases: 401, 404
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const row = await this.triageService.findById(id);
    return { data: row };
  }

  /**
   * Method: PATCH
   * URL: /api/triage/:id
   * Purpose: Update triage status / priority / vitals
   * Required permission: JWT
   * Request body: UpdateTriageDto
   * Response example: { data: { triageId, status, ... } }
   * Error cases: 400, 401, 404
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTriageDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.triageService.update(id, dto, user);
    return { data: row };
  }
}

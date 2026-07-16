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
import { NursingOpsService } from './nursing-ops.service';
import {
  CreateExternalMedDto,
  CreateHandoverDto,
  CreateIcuInfusionDto,
  CreateIcuNoteDto,
  CreateMarEntryDto,
  CreateMessageDto,
  CreateNursingOrderDto,
  CreateNursingTaskDto,
  CreateShiftDto,
  EndShiftDto,
  GenerateReportDto,
  MarActionDto,
  UpdateNursingTaskDto,
} from './dto/nursing-ops.dto';

@Controller('nursing')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class NursingOpsController {
  constructor(private readonly ops: NursingOpsService) {}

  // ── Orders ─────────────────────────────────────────────────────────

  @Get('orders')
  @RequirePermissions(PERMISSIONS.NURSING_ORDER_READ)
  async listOrders(
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
    @Query('kind') kind?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.ops.listOrders({
      personId: personId ? Number(personId) : undefined,
      admissionId: admissionId ? Number(admissionId) : undefined,
      kind,
      status,
    });
    return { data: result };
  }

  @Post('orders')
  @RequirePermissions(PERMISSIONS.NURSING_ORDER_CREATE)
  async createOrder(
    @Body() dto: CreateNursingOrderDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.createOrder(dto, user);
    return { data: row };
  }

  @Patch('orders/:id/acknowledge')
  @RequirePermissions(PERMISSIONS.NURSING_ORDER_UPDATE)
  async acknowledgeOrder(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.acknowledgeOrder(id, user);
    return { data: row };
  }

  // ── Tasks ──────────────────────────────────────────────────────────

  @Get('tasks')
  @RequirePermissions(PERMISSIONS.NURSING_TASK_READ)
  async listTasks(
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    const result = await this.ops.listTasks({
      personId: personId ? Number(personId) : undefined,
      admissionId: admissionId ? Number(admissionId) : undefined,
      status,
      category,
    });
    return { data: result };
  }

  @Post('tasks')
  @RequirePermissions(PERMISSIONS.NURSING_TASK_CREATE)
  async createTask(
    @Body() dto: CreateNursingTaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.createTask(dto, user);
    return { data: row };
  }

  @Patch('tasks/:id')
  @RequirePermissions(PERMISSIONS.NURSING_TASK_UPDATE)
  async updateTask(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNursingTaskDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.updateTask(id, dto, user);
    return { data: row };
  }

  // ── MAR ────────────────────────────────────────────────────────────

  @Get('mar')
  @RequirePermissions(PERMISSIONS.NURSING_MAR_READ)
  async listMar(
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
    @Query('status') status?: string,
    @Query('kind') kind?: string,
  ) {
    const result = await this.ops.listMar({
      personId: personId ? Number(personId) : undefined,
      admissionId: admissionId ? Number(admissionId) : undefined,
      status,
      kind,
    });
    return { data: result };
  }

  @Post('mar')
  @RequirePermissions(PERMISSIONS.NURSING_MAR_CREATE)
  async createMar(
    @Body() dto: CreateMarEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.createMar(dto, user);
    return { data: row };
  }

  @Post('mar/external')
  @RequirePermissions(PERMISSIONS.NURSING_MAR_CREATE)
  async createExternalMed(
    @Body() dto: CreateExternalMedDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.createExternalMed(dto, user);
    return { data: row };
  }

  @Post('mar/:id/administer')
  @RequirePermissions(PERMISSIONS.NURSING_MAR_UPDATE)
  async administer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarActionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.marAction(id, 'administer', dto, user);
    return { data: row };
  }

  @Post('mar/:id/refuse')
  @RequirePermissions(PERMISSIONS.NURSING_MAR_UPDATE)
  async refuse(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarActionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.marAction(id, 'refuse', dto, user);
    return { data: row };
  }

  @Post('mar/:id/miss')
  @RequirePermissions(PERMISSIONS.NURSING_MAR_UPDATE)
  async miss(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarActionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.marAction(id, 'miss', dto, user);
    return { data: row };
  }

  @Post('mar/:id/hold')
  @RequirePermissions(PERMISSIONS.NURSING_MAR_UPDATE)
  async hold(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MarActionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.marAction(id, 'hold', dto, user);
    return { data: row };
  }

  @Post('mar/:id/dispense')
  @RequirePermissions(PERMISSIONS.NURSING_MAR_UPDATE)
  async dispense(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.markMarDispensed(id, user);
    return { data: row };
  }

  // ── Samples ────────────────────────────────────────────────────────

  @Get('samples')
  @RequirePermissions(PERMISSIONS.NURSING_SAMPLE_READ)
  async listSamples(
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
  ) {
    const result = await this.ops.listSamples({
      personId: personId ? Number(personId) : undefined,
      admissionId: admissionId ? Number(admissionId) : undefined,
    });
    return { data: result };
  }

  @Post('samples/:id/collect')
  @RequirePermissions(PERMISSIONS.NURSING_SAMPLE_UPDATE)
  async collectSample(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.collectSample(id, user);
    return { data: row };
  }

  // ── Shifts ─────────────────────────────────────────────────────────

  @Get('shifts')
  @RequirePermissions(PERMISSIONS.NURSING_SHIFT_READ)
  async listShifts(
    @Query('wardId') wardId?: string,
    @Query('status') status?: string,
  ) {
    const result = await this.ops.listShifts({
      wardId: wardId ? Number(wardId) : undefined,
      status,
    });
    return { data: result };
  }

  @Get('shifts/current')
  @RequirePermissions(PERMISSIONS.NURSING_SHIFT_READ)
  async currentShift(@Query('wardId') wardId?: string) {
    const row = await this.ops.getCurrentShift(
      wardId ? Number(wardId) : undefined,
    );
    return { data: row };
  }

  @Post('shifts/start')
  @RequirePermissions(PERMISSIONS.NURSING_SHIFT_CREATE)
  async startShift(
    @Body() dto: CreateShiftDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.startShift(dto, user);
    return { data: row };
  }

  @Patch('shifts/:id/end')
  @RequirePermissions(PERMISSIONS.NURSING_SHIFT_UPDATE)
  async endShift(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EndShiftDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.endShift(id, dto, user);
    return { data: row };
  }

  // ── Handovers ──────────────────────────────────────────────────────

  @Get('handovers')
  @RequirePermissions(PERMISSIONS.NURSING_HANDOVER_READ)
  async listHandovers(@Query('wardId') wardId?: string) {
    const result = await this.ops.listHandovers({
      wardId: wardId ? Number(wardId) : undefined,
    });
    return { data: result };
  }

  @Post('handovers')
  @RequirePermissions(PERMISSIONS.NURSING_HANDOVER_CREATE)
  async createHandover(
    @Body() dto: CreateHandoverDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.createHandover(dto, user);
    return { data: row };
  }

  @Patch('handovers/:id/acknowledge')
  @RequirePermissions(PERMISSIONS.NURSING_HANDOVER_UPDATE)
  async acknowledgeHandover(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.acknowledgeHandover(id, user);
    return { data: row };
  }

  // ── ICU ────────────────────────────────────────────────────────────

  @Get('icu/board')
  @RequirePermissions(PERMISSIONS.NURSING_ICU_READ)
  async icuBoard() {
    const result = await this.ops.icuBoard();
    return { data: result };
  }

  @Get('icu/notes')
  @RequirePermissions(PERMISSIONS.NURSING_ICU_READ)
  async listIcuNotes(
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
  ) {
    const result = await this.ops.listIcuNotes({
      personId: personId ? Number(personId) : undefined,
      admissionId: admissionId ? Number(admissionId) : undefined,
    });
    return { data: result };
  }

  @Post('icu/notes')
  @RequirePermissions(PERMISSIONS.NURSING_ICU_CREATE)
  async createIcuNote(
    @Body() dto: CreateIcuNoteDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.createIcuNote(dto, user);
    return { data: row };
  }

  @Get('icu/infusions')
  @RequirePermissions(PERMISSIONS.NURSING_ICU_READ)
  async listIcuInfusions(
    @Query('personId') personId?: string,
    @Query('admissionId') admissionId?: string,
  ) {
    const result = await this.ops.listIcuInfusions({
      personId: personId ? Number(personId) : undefined,
      admissionId: admissionId ? Number(admissionId) : undefined,
    });
    return { data: result };
  }

  @Post('icu/infusions')
  @RequirePermissions(PERMISSIONS.NURSING_ICU_CREATE)
  async createIcuInfusion(
    @Body() dto: CreateIcuInfusionDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.createIcuInfusion(dto, user);
    return { data: row };
  }

  // ── Comms ──────────────────────────────────────────────────────────

  @Get('messages')
  @RequirePermissions(PERMISSIONS.NURSING_COMMS_READ)
  async listMessages(@Query('channel') channel?: string) {
    const result = await this.ops.listMessages({ channel });
    return { data: result };
  }

  @Post('messages')
  @RequirePermissions(PERMISSIONS.NURSING_COMMS_CREATE)
  async createMessage(
    @Body() dto: CreateMessageDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.createMessage(dto, user);
    return { data: row };
  }

  @Patch('messages/:id/read')
  @RequirePermissions(PERMISSIONS.NURSING_COMMS_UPDATE)
  async markRead(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.markMessageRead(id, user);
    return { data: row };
  }

  // ── Reports & analytics ────────────────────────────────────────────

  @Get('reports')
  @RequirePermissions(PERMISSIONS.NURSING_REPORT_READ)
  async listReports() {
    const result = await this.ops.listReports();
    return { data: result };
  }

  @Post('reports/generate')
  @RequirePermissions(PERMISSIONS.NURSING_REPORT_CREATE)
  async generateReport(
    @Body() dto: GenerateReportDto,
    @CurrentUser() user: AuthUser,
  ) {
    const row = await this.ops.generateReport(dto, user);
    return { data: row };
  }

  @Get('analytics/summary')
  @RequirePermissions(PERMISSIONS.NURSING_ANALYTICS_READ)
  async analytics() {
    const result = await this.ops.analyticsSummary();
    return { data: result };
  }
}

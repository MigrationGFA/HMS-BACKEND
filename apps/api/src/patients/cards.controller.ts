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
import { CardsService } from './cards.service';

@Controller('cards')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class CardsController {
  constructor(private readonly cardsService: CardsService) {}

  /**
   * Method: GET
   * URL: /api/cards?paymentStatus=&personId=&q=&page=&limit=
   * Purpose: List registration cards (Records continue-from-payment table + Cashier queue)
   * Required permission: card:read
   * Request body: none
   * Response example: { data: { items: [{ cardId, cardNo, paymentStatus, totalAmount, person }], meta } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get()
  @RequirePermissions(PERMISSIONS.CARD_READ)
  async list(
    @Query('paymentStatus') paymentStatus?: string,
    @Query('personId') personId?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.cardsService.list({
      paymentStatus,
      personId: personId ? Number(personId) : undefined,
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: GET
   * URL: /api/cards/person/:personId
   * Purpose: Latest card + payment status for a person (Records workflow gate)
   * Required permission: card:read
   * Request body: none
   * Response example: { data: { card: {...} | null, paymentCleared: boolean } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get('person/:personId')
  @RequirePermissions(PERMISSIONS.CARD_READ)
  async latestForPerson(@Param('personId', ParseIntPipe) personId: number) {
    const card = await this.cardsService.latestForPerson(personId);
    const paymentCleared = !card || card.paymentStatus !== 'Pending';
    return { data: { card, paymentCleared } };
  }

  /**
   * Method: GET
   * URL: /api/cards/:cardId
   * Purpose: Get one card and whether payment is cleared (continue-from-payment check)
   * Required permission: card:read
   * Request body: none
   * Response example: { data: { card: {...}, paymentCleared: boolean } }
   * Error cases: 401, 403, 404
   */
  @Get(':cardId')
  @RequirePermissions(PERMISSIONS.CARD_READ)
  async findOne(@Param('cardId', ParseIntPipe) cardId: number) {
    const card = await this.cardsService.findById(cardId);
    const paymentCleared = card.paymentStatus !== 'Pending';
    return { data: { card, paymentCleared } };
  }
}

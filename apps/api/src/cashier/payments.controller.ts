import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
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
import { CardsService } from '../patients/cards.service';
import { ConfirmCardPaymentDto } from './dto/confirm-card-payment.dto';
import { ConfirmWalkInPaymentDto } from '../pharmacy/dto/walk-in-sale.dto';
import { WalkInSalesService } from '../pharmacy/walk-in-sales.service';
import { ConfirmPrescriptionPaymentDto } from '../clinical/prescriptions/dto/prescription.dto';
import { PrescriptionsService } from '../clinical/prescriptions/prescriptions.service';
import { ConfirmLabRequestPaymentDto } from '../laboratory/dto/lab.dto';
import { LaboratoryService } from '../laboratory/laboratory.service';
import { AdmissionBillsService } from '../admissions/admission-bills.service';
import { ConfirmAdmissionBillPaymentDto } from '../admissions/dto/admission-bill.dto';
import { RadiologyService } from '../radiology/radiology.service';
import { ConfirmImagingRequestPaymentDto } from '../radiology/dto/imaging.dto';
import { CashierService } from './cashier.service';
import { PsychiatryService } from '../psychiatry/psychiatry.service';
import { PayOpcConsultationDto } from '../psychiatry/dto/psychiatric-opc.dto';

function personLabel(person?: {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
} | null): string {
  if (!person) return 'Unknown';
  return (
    [person.firstName, person.middleName, person.lastName]
      .filter(Boolean)
      .join(' ') || 'Unknown'
  );
}

@Controller('cashier/payments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PaymentsController {
  constructor(
    private readonly cardsService: CardsService,
    private readonly walkInSales: WalkInSalesService,
    private readonly prescriptionsService: PrescriptionsService,
    private readonly laboratoryService: LaboratoryService,
    private readonly admissionBills: AdmissionBillsService,
    private readonly radiologyService: RadiologyService,
    private readonly cashierService: CashierService,
    private readonly psychiatryService: PsychiatryService,
  ) {}

  /**
   * Method: GET
   * URL: /api/cashier/payments/cards?paymentStatus=Pending&q=&page=&limit=
   * Purpose: Cashier work queue — registration cards awaiting payment
   * Required permission: card:read
   * Request body: none
   * Response example: { data: { items: [{ cardId, cardNo, paymentStatus, totalAmount, person }], meta } }
   * Error cases: 401 unauthorized, 403 missing permission
   */
  @Get('cards')
  @RequirePermissions(PERMISSIONS.CARD_READ)
  async listCardPayments(
    @Query('paymentStatus') paymentStatus?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.cardsService.list({
      paymentStatus: paymentStatus ?? 'Pending',
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/cashier/payments/cards/:cardId/confirm
   * Purpose: Confirm a pending registration-card payment (unblocks Records workflow)
   * Required permission: card:confirm-payment
   * Request body: { paymentChannel: "Cash" | "POS Card" | "Bank Transfer" | "Online Card" | "Wallet", paymentRef?: string }
   * Response example: { data: { cardId, paymentStatus: "Paid", status: "Active", paidAt, confirmedBy } }
   * Error cases: 400 validation, 401 unauthorized, 403 missing permission, 404 card not found, 409 already paid/waived
   */
  @Post('cards/:cardId/confirm')
  @RequirePermissions(PERMISSIONS.CARD_CONFIRM_PAYMENT)
  async confirmCardPayment(
    @Param('cardId', ParseIntPipe) cardId: number,
    @Body() dto: ConfirmCardPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    const card = await this.cardsService.confirmPayment(cardId, dto, user);
    const collectedAmount =
      dto.patientAmount != null && Number.isFinite(dto.patientAmount)
        ? dto.patientAmount
        : card.totalAmount;
    const paymentRef =
      dto.payerLiability != null
        ? `${dto.paymentRef ?? ''} [co-pay=${collectedAmount};payer=${dto.payerLiability}${dto.authCode ? `;auth=${dto.authCode}` : ''}]`.trim()
        : dto.paymentRef;
    await this.cashierService.recordReceipt({
      sourceType: 'card',
      sourceId: card.cardId,
      personId: card.personId,
      amount: collectedAmount,
      channel: dto.paymentChannel,
      paymentRef,
      patientName: personLabel(card.person),
      sourceRef: card.cardNo,
      user,
    });
    return {
      data: {
        ...card,
        collectedAmount,
        payerLiability: dto.payerLiability ?? null,
        splitBilling: dto.patientAmount != null || dto.payerLiability != null,
      },
    };
  }

  /**
   * Method: GET
   * URL: /api/cashier/payments/pharmacy-sales?paymentStatus=Unpaid&q=&page=&limit=
   * Purpose: Cashier queue — walk-in pharmacy sales awaiting payment before dispense
   * Required permission: pharmacy:sale-read
   * Request body: none
   * Response example: { data: { items: [{ saleId, saleNo, total, paymentStatus, person, items }], meta } }
   * Error cases: 401, 403
   */
  @Get('pharmacy-sales')
  @RequirePermissions(PERMISSIONS.PHARMACY_SALE_READ)
  async listPharmacySales(
    @Query('paymentStatus') paymentStatus?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.walkInSales.list({
      paymentStatus: paymentStatus ?? 'Unpaid',
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/cashier/payments/pharmacy-sales/:saleId/confirm
   * Purpose: Confirm walk-in pharmacy payment — unlocks pharmacist dispense
   * Required permission: pharmacy:sale-pay
   * Request body: { paymentChannel: "Cash" | "POS Card" | "Bank Transfer" | "Online Card" | "Wallet", paymentRef?: string }
   * Response example: { data: { saleId, saleNo, paymentStatus: "Paid", status: "Paid", paidBy } }
   * Error cases: 400 already paid / cancelled, 401, 403, 404
   */
  @Post('pharmacy-sales/:saleId/confirm')
  @RequirePermissions(PERMISSIONS.PHARMACY_SALE_PAY)
  async confirmPharmacySalePayment(
    @Param('saleId', ParseIntPipe) saleId: number,
    @Body() dto: ConfirmWalkInPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    const sale = await this.walkInSales.confirmPayment(saleId, dto, user);
    await this.cashierService.recordReceipt({
      sourceType: 'pharmacy',
      sourceId: sale.saleId,
      personId: sale.personId,
      amount: sale.total,
      channel: dto.paymentChannel,
      paymentRef: dto.paymentRef,
      patientName: personLabel(sale.person),
      sourceRef: sale.saleNo,
      user,
    });
    return { data: sale };
  }

  /**
   * Method: GET
   * URL: /api/cashier/payments/prescriptions?paymentStatus=Unpaid,Emergency&q=&page=&limit=
   * Purpose: Cashier queue — doctor prescriptions awaiting payment (including emergency-dispensed unpaid bills)
   * Required permission: prescription:read
   * Request body: none
   * Response example: { data: { items: [{ prescriptionId, rxNo, total, paymentStatus, person }], meta } }
   * Error cases: 401, 403
   */
  @Get('prescriptions')
  @RequirePermissions(PERMISSIONS.PRESCRIPTION_READ)
  async listPrescriptionPayments(
    @Query('paymentStatus') paymentStatus?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.prescriptionsService.list({
      paymentStatus: paymentStatus ?? 'Unpaid,Emergency',
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/cashier/payments/prescriptions/:id/confirm
   * Purpose: Confirm doctor prescription payment (clears unpaid/emergency bill)
   * Required permission: prescription:pay
   * Request body: { paymentChannel, paymentRef? }
   * Response example: { data: { prescriptionId, paymentStatus: "Paid", paidBy, ... } }
   * Error cases: 400 already paid, 401, 403, 404
   */
  @Post('prescriptions/:id/confirm')
  @RequirePermissions(PERMISSIONS.PRESCRIPTION_PAY)
  async confirmPrescriptionPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmPrescriptionPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    const rx = await this.prescriptionsService.confirmPayment(id, dto, user);
    await this.cashierService.recordReceipt({
      sourceType: 'prescription',
      sourceId: rx.prescriptionId,
      personId: rx.personId,
      amount: rx.total,
      channel: dto.paymentChannel,
      paymentRef: dto.paymentRef,
      patientName: personLabel(rx.person),
      sourceRef: rx.rxNo,
      user,
    });
    return { data: rx };
  }

  /**
   * Method: GET
   * URL: /api/cashier/payments/lab-requests?paymentStatus=Unpaid&q=&page=&limit=
   * Purpose: Cashier queue — doctor lab requests awaiting payment
   * Required permission: lab:pay
   * Request body: none
   * Response example: { data: { items: [{ labRequestId, requestNo, totalAmount, paymentStatus, person, items }], meta } }
   * Error cases: 401, 403
   */
  @Get('lab-requests')
  @RequirePermissions(PERMISSIONS.LAB_PAY)
  async listLabRequestPayments(
    @Query('paymentStatus') paymentStatus?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.laboratoryService.listRequests({
      paymentStatus: paymentStatus ?? 'Unpaid',
      status: 'Sent',
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/cashier/payments/lab-requests/:id/confirm
   * Purpose: Confirm lab request payment (unlocks sample processing later)
   * Required permission: lab:pay
   * Request body: { paymentChannel, paymentRef? }
   * Response example: { data: { labRequestId, paymentStatus: "Paid", paidBy, ... } }
   * Error cases: 400 already paid/cancelled, 401, 403, 404
   */
  @Post('lab-requests/:id/confirm')
  @RequirePermissions(PERMISSIONS.LAB_PAY)
  async confirmLabRequestPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmLabRequestPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    const request = await this.laboratoryService.confirmPayment(id, dto, user);
    await this.cashierService.recordReceipt({
      sourceType: 'lab',
      sourceId: request.labRequestId,
      personId: request.personId,
      amount: request.totalAmount,
      channel: dto.paymentChannel,
      paymentRef: dto.paymentRef,
      patientName: personLabel(request.person),
      sourceRef: request.requestNo,
      user,
    });
    return { data: request };
  }

  /**
   * Method: GET
   * URL: /api/cashier/payments/admission-bills?paymentStatus=Unpaid&q=&page=&limit=
   * Purpose: Cashier queue — admission package bills awaiting payment
   * Required permission: admission:pay
   * Request body: none
   * Response example: { data: { items: [{ admissionBillId, billNo, totalAmount, paymentStatus, person, lines }], meta } }
   * Error cases: 401, 403
   */
  @Get('admission-bills')
  @RequirePermissions(PERMISSIONS.ADMISSION_PAY)
  async listAdmissionBillPayments(
    @Query('paymentStatus') paymentStatus?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.admissionBills.list({
      paymentStatus: paymentStatus ?? 'Unpaid',
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/cashier/payments/admission-bills/:id/confirm
   * Purpose: Confirm admission package payment (cashier does not set prices)
   * Required permission: admission:pay
   * Request body: { paymentChannel, paymentRef? }
   * Response example: { data: { admissionBillId, billNo, paymentStatus: "Paid", paidBy, ... } }
   * Error cases: 400 already paid, 401, 403, 404
   */
  @Post('admission-bills/:id/confirm')
  @RequirePermissions(PERMISSIONS.ADMISSION_PAY)
  async confirmAdmissionBillPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmAdmissionBillPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    const bill = await this.admissionBills.confirmPayment(id, dto, user);
    await this.cashierService.recordReceipt({
      sourceType: 'admission',
      sourceId: bill.admissionBillId,
      personId: bill.personId,
      amount: bill.totalAmount,
      channel: dto.paymentChannel,
      paymentRef: dto.paymentRef,
      patientName: personLabel(bill.person),
      sourceRef: bill.billNo,
      user,
    });
    return { data: bill };
  }

  /**
   * Method: GET
   * URL: /api/cashier/payments/imaging-requests?paymentStatus=Unpaid&q=&page=&limit=
   * Purpose: Cashier queue — doctor imaging requests awaiting payment
   * Required permission: imaging:pay
   * Response: { data: { items: [{ imagingRequestId, requestNo, totalAmount, paymentStatus, person, items }], meta } }
   * Errors: 401, 403
   */
  @Get('imaging-requests')
  @RequirePermissions(PERMISSIONS.IMAGING_PAY)
  async listImagingRequestPayments(
    @Query('paymentStatus') paymentStatus?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.radiologyService.listRequests({
      paymentStatus: paymentStatus ?? 'Unpaid',
      status: 'Sent,Accepted',
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/cashier/payments/imaging-requests/:id/confirm
   * Purpose: Confirm imaging request payment (unlocks radiology attendance)
   * Required permission: imaging:pay
   * Request body: { paymentChannel, paymentRef? }
   * Response: { data: { imagingRequestId, paymentStatus: "Paid", … } }
   * Errors: 400 already paid/cancelled, 401, 403, 404
   */
  @Post('imaging-requests/:id/confirm')
  @RequirePermissions(PERMISSIONS.IMAGING_PAY)
  async confirmImagingRequestPayment(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ConfirmImagingRequestPaymentDto,
    @CurrentUser() user: AuthUser,
  ) {
    const request = await this.radiologyService.confirmPayment(id, dto, user);
    await this.cashierService.recordReceipt({
      sourceType: 'imaging',
      sourceId: request.imagingRequestId,
      personId: request.personId,
      amount: request.totalAmount,
      channel: dto.paymentChannel,
      paymentRef: dto.paymentRef,
      patientName: personLabel(request.person),
      sourceRef: request.requestNo,
      user,
    });
    return { data: request };
  }

  /**
   * Method: GET
   * URL: /api/cashier/payments/opc-consults?q=&page=&limit=
   * Purpose: Cashier queue — unpaid psychiatric OPC consultations
   * Required permission: opc:read
   */
  @Get('opc-consults')
  @RequirePermissions(PERMISSIONS.OPC_READ)
  async listOpcConsultPayments(
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.psychiatryService.listUnpaidConsults({
      q,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 50,
    });
    return { data: result };
  }

  /**
   * Method: POST
   * URL: /api/cashier/payments/opc-consults/:id/pay
   * Purpose: Confirm psychiatric OPC consultation payment
   * Required permission: opc:update
   * Request body: { channel, paymentRef? }
   */
  @Post('opc-consults/:id/pay')
  @RequirePermissions(PERMISSIONS.OPC_UPDATE)
  async payOpcConsult(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayOpcConsultationDto,
    @CurrentUser() user: AuthUser,
  ) {
    const visit = await this.psychiatryService.payConsultation(id, dto, user);
    await this.cashierService.recordReceipt({
      sourceType: 'opc',
      sourceId: visit.visitId,
      personId: visit.personId,
      amount: visit.consultAmount,
      channel: dto.channel,
      paymentRef: dto.paymentRef,
      patientName: personLabel(visit.person),
      sourceRef: visit.visitNo,
      user,
    });
    return { data: visit };
  }
}

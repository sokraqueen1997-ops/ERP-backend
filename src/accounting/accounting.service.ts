import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { CreateAccountDto, UpdateAccountDto } from './dto/account.dto';
import { CreatePaymentDto, CreateReceiptDto } from './dto/voucher.dto';

export interface LedgerQuery {
  page?: number;
  pageSize?: number;
}

@Injectable()
export class AccountingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly customersService: CustomersService,
    private readonly suppliersService: SuppliersService,
  ) {}

  private static voucherNumber(type: string, voucherSeq: number): string {
    const prefix = type === 'RECEIPT' ? 'RC' : 'PV';
    return `${prefix}-${String(voucherSeq).padStart(6, '0')}`;
  }

  private withVoucherNumber<T extends { type: string; voucherSeq: number }>(t: T) {
    return { ...t, voucherNumber: AccountingService.voucherNumber(t.type, t.voucherSeq) };
  }

  async findAllAccounts() {
    return this.prisma.account.findMany({ orderBy: { name: 'asc' } });
  }

  async findAccount(id: string) {
    const account = await this.prisma.account.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Account not found');
    return account;
  }

  async createAccount(dto: CreateAccountDto) {
    const opening = dto.openingBalance ?? 0;

    return this.prisma.$transaction(async (tx) => {
      const account = await tx.account.create({
        data: {
          name: dto.name,
          type: dto.type,
          bankName: dto.bankName,
          accountNumber: dto.accountNumber,
          iban: dto.iban,
          balance: opening,
        },
      });

      if (opening > 0) {
        await tx.accountTransaction.create({
          data: {
            accountId: account.id,
            type: 'RECEIPT',
            category: 'OPENING_BALANCE',
            amount: opening,
            balanceAfter: opening,
            description: 'رصيد افتتاحي',
          },
        });
      }

      return account;
    });
  }

  async updateAccount(id: string, dto: UpdateAccountDto) {
    await this.findAccount(id);
    return this.prisma.account.update({ where: { id }, data: dto });
  }

  /** سند قبض — money coming into an account. Optionally credits a customer's ledger. */
  async createReceipt(accountId: string, dto: CreateReceiptDto, userId?: string) {
    const account = await this.findAccount(accountId);
    if (!account.isActive) throw new BadRequestException('Account is inactive');

    if (dto.relatedCustomerId) {
      await this.customersService.findOne(dto.relatedCustomerId);
    }

    const newBalance = Number(account.balance) + dto.amount;

    const transaction = await this.prisma.$transaction(async (tx) => {
      await tx.account.update({ where: { id: accountId }, data: { balance: newBalance } });

      return tx.accountTransaction.create({
        data: {
          accountId,
          type: 'RECEIPT',
          category: dto.category ?? 'OTHER',
          amount: dto.amount,
          balanceAfter: newBalance,
          description: dto.description,
          relatedCustomerId: dto.relatedCustomerId,
          createdById: userId,
        },
      });
    });

    // Posted as a separate step (not nested in the DB transaction above) —
    // consistent with how quotation-to-sale conversion is handled elsewhere
    // in this codebase. If this call fails, the account entry above still
    // stands and the customer ledger can be reconciled manually.
    if (dto.relatedCustomerId) {
      await this.customersService.addTransaction(
        dto.relatedCustomerId,
        {
          type: 'PAYMENT',
          amount: -dto.amount,
          notes: `سند قبض ${AccountingService.voucherNumber('RECEIPT', transaction.voucherSeq)}`,
        },
        userId,
      );
    }

    return this.withVoucherNumber(transaction);
  }

  /** سند صرف — money going out of an account. Optionally credits a supplier's ledger. */
  async createPayment(accountId: string, dto: CreatePaymentDto, userId?: string) {
    const account = await this.findAccount(accountId);
    if (!account.isActive) throw new BadRequestException('Account is inactive');

    if (dto.relatedSupplierId) {
      await this.suppliersService.findOne(dto.relatedSupplierId);
    }

    const newBalance = Number(account.balance) - dto.amount;
    if (newBalance < 0) {
      throw new BadRequestException(
        `Insufficient balance in "${account.name}": available ${account.balance}, requested ${dto.amount}`,
      );
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      await tx.account.update({ where: { id: accountId }, data: { balance: newBalance } });

      return tx.accountTransaction.create({
        data: {
          accountId,
          type: 'PAYMENT',
          category: dto.category ?? 'OTHER',
          amount: dto.amount,
          balanceAfter: newBalance,
          description: dto.description,
          relatedSupplierId: dto.relatedSupplierId,
          createdById: userId,
        },
      });
    });

    if (dto.relatedSupplierId) {
      await this.suppliersService.addTransaction(
        dto.relatedSupplierId,
        {
          type: 'PAYMENT',
          amount: -dto.amount,
          notes: `سند صرف ${AccountingService.voucherNumber('PAYMENT', transaction.voucherSeq)}`,
        },
        userId,
      );
    }

    return this.withVoucherNumber(transaction);
  }

  async findAccountLedger(accountId: string, query: LedgerQuery) {
    await this.findAccount(accountId);

    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize = query.pageSize && query.pageSize > 0 ? Math.min(query.pageSize, 100) : 25;

    const [items, total] = await Promise.all([
      this.prisma.accountTransaction.findMany({
        where: { accountId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          relatedCustomer: { select: { id: true, name: true } },
          relatedSupplier: { select: { id: true, name: true } },
        },
      }),
      this.prisma.accountTransaction.count({ where: { accountId } }),
    ]);

    return {
      items: items.map((t) => this.withVoucherNumber(t)),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }
}

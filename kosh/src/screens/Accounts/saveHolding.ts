import { AccountRepository } from '@/storage/repositories/AccountRepository';
import { HoldingRepository } from '@/storage/repositories/HoldingRepository';
import { Bucket } from '@/types/account';
import { HoldingExtras } from '@/types/holding';

export interface SaveHoldingInput {
  profileId: string;
  bucket: Bucket;
  provider: string;
  accountNickname: string;
  instrumentName: string;
  valueInr: number;
  asOfDate: string;
  quantity?: number;
  unitPrice?: number;
  extras?: HoldingExtras;
}

export function saveHolding(i: SaveHoldingInput) {
  const account = AccountRepository.findOrCreate({
    profileId: i.profileId,
    bucket: i.bucket,
    provider: i.provider,
    nickname: i.accountNickname,
  });
  return HoldingRepository.create({
    accountId: account.id,
    instrumentName: i.instrumentName,
    valueInr: i.valueInr,
    asOfDate: i.asOfDate,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    extras: i.extras,
  });
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

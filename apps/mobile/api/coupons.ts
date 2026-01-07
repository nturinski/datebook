import { apiFetch } from '@/api/client';

export type CouponStatus = 'ACTIVE' | 'REDEEMED' | 'EXPIRED';

export type Coupon = {
  id: string;
  relationshipId: string;
  issuerUserId: string;
  recipientUserId: string;
  title: string;
  description: string | null;
  templateId: string;
  expiresAt: string | null;
  status: CouponStatus;
  redeemedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CreateCouponResponse =
  | { ok: true; coupon: Coupon }
  | { ok: false; error: string; details?: unknown };

export async function createCoupon(args: {
  relationshipId: string;
  recipientUserId: string;
  title: string;
  description?: string;
  templateId: string;
  expiresAt?: string;
}): Promise<Coupon> {
  const res = await apiFetch<CreateCouponResponse>('/coupons', {
    method: 'POST',
    json: {
      relationshipId: args.relationshipId,
      recipientUserId: args.recipientUserId,
      title: args.title,
      ...(typeof args.description === 'string' ? { description: args.description } : {}),
      templateId: args.templateId,
      ...(typeof args.expiresAt === 'string' ? { expiresAt: args.expiresAt } : {}),
    },
  });

  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to create coupon');
  return res.coupon;
}

export type ListCouponsResponse =
  | { ok: true; coupons: Coupon[] }
  | { ok: false; error: string; details?: unknown };

export async function listCoupons(args: { relationshipId: string; status?: CouponStatus }): Promise<Coupon[]> {
  const qs = new URLSearchParams({ relationshipId: args.relationshipId });
  if (args.status) qs.set('status', args.status);

  const res = await apiFetch<ListCouponsResponse>(`/coupons?${qs.toString()}`);
  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to load coupons');
  return Array.isArray(res.coupons) ? res.coupons : [];
}

export type GetCouponResponse =
  | { ok: true; coupon: Coupon }
  | { ok: false; error: string; details?: unknown };

export async function getCoupon(id: string): Promise<Coupon> {
  const res = await apiFetch<GetCouponResponse>(`/coupons/${id}`);
  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to load coupon');
  return res.coupon;
}

export type RedeemCouponResponse =
  | { ok: true; coupon: Coupon }
  | { ok: false; error: string; details?: unknown };

export async function redeemCoupon(id: string): Promise<Coupon> {
  const res = await apiFetch<RedeemCouponResponse>(`/coupons/${id}/redeem`, {
    method: 'POST',
  });
  if (!('ok' in res) || !res.ok) throw new Error((res as any)?.error ?? 'Failed to redeem coupon');
  return res.coupon;
}

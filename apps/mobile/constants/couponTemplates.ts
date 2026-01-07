import { PaperColors } from '@/constants/paper';

export type CouponTemplate = {
  id: string;
  name: string;
  background: string;
  accent: string;
  border: string;
};

// Fixed MVP presets (no custom images / no freeform design tools).
export const COUPON_TEMPLATES: readonly CouponTemplate[] = [
  {
    id: 'pastel_01',
    name: 'Rose',
    background: '#F7D7D4',
    accent: '#7A2E2E',
    border: 'rgba(122,46,46,0.22)',
  },
  {
    id: 'pastel_02',
    name: 'Lavender',
    background: '#DCD6F6',
    accent: '#3C2A6E',
    border: 'rgba(60,42,110,0.20)',
  },
  {
    id: 'pastel_03',
    name: 'Mint',
    background: '#D8F0E2',
    accent: '#1F6F3D',
    border: 'rgba(31,111,61,0.18)',
  },
  {
    id: 'pastel_04',
    name: 'Sky',
    background: '#D7ECFA',
    accent: '#1B4B66',
    border: 'rgba(27,75,102,0.18)',
  },
  {
    id: 'pastel_05',
    name: 'Butter',
    background: '#F6EBC9',
    accent: PaperColors.ink,
    border: 'rgba(46,42,39,0.16)',
  },
] as const;

export function getCouponTemplate(templateId: string | null | undefined): CouponTemplate {
  const found = COUPON_TEMPLATES.find((t) => t.id === templateId);
  return found ?? COUPON_TEMPLATES[0]!;
}

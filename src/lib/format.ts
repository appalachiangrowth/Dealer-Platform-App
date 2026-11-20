import type { Vehicle, VehicleStatus } from './types';

export function money(v: number | string | null | undefined): string {
  const n = Number(v);
  if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return '—';
  return `$${Math.round(n).toLocaleString('en-US')}`;
}

export function miles(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `${Number(v).toLocaleString('en-US')} mi`;
}

export function vehicleName(v: { year?: number | string | null; make?: string; model?: string; trim?: string }): string {
  return [v.year || '', v.make || '', v.model || '', v.trim || ''].join(' ').replace(/\s+/g, ' ').trim();
}

export function dateTime(iso?: string | number | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  const h = d.getHours() % 12 || 12;
  return `${M} ${d.getDate()}, ${d.getFullYear()} · ${h}:${p(d.getMinutes())} ${d.getHours() >= 12 ? 'PM' : 'AM'}`;
}

/**
 * The backend stores PUBLISHED / DRAFT / SOLD. In the app:
 *   Available = PUBLISHED (for sale on the website and feeds)
 *   Pending   = DRAFT     (saved, hidden from the website)
 *   Sold      = SOLD
 */
export const STATUS_LABEL: Record<VehicleStatus, string> = { PUBLISHED: 'Available', DRAFT: 'Pending', SOLD: 'Sold' };
export const STATUSES: VehicleStatus[] = ['PUBLISHED', 'DRAFT', 'SOLD'];

export function cover(v: Pick<Vehicle, 'images'>): string {
  return v.images?.[0] || '';
}

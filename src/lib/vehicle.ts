import type { Vehicle, VehicleStatus, VinDecode } from './types';

/** What the form edits (text inputs keep strings; converted in toBody). */
export interface VehicleDraft {
  vin: string;
  stockNumber: string;
  year: string;
  make: string;
  model: string;
  trim: string;
  price: string;
  mileage: string;
  condition: string;
  /** '' = "Select…" (not sent on create; the server default applies), 'Yes' | 'No' */
  certified: '' | 'Yes' | 'No';
  exteriorColor: string;
  interiorColor: string;
  bodyStyle: string;
  vehicleType: string;
  transmission: string;
  drivetrain: string;
  fuelType: string;
  engine: string;
  status: VehicleStatus;
  features: string;
  description: string;
  images: string[];
  syndicateCargurus: boolean;
  syndicateFacebook: boolean;
  /** only set by AI Quick Add (the web form keeps them in their own box); sent as safetyFeatures when present */
  safetyFeatures?: string[];
}

export const EMPTY_DRAFT: VehicleDraft = {
  vin: '', stockNumber: '', year: '', make: '', model: '', trim: '', price: '', mileage: '', condition: 'Used', certified: '',
  exteriorColor: '', interiorColor: '', bodyStyle: '', vehicleType: 'Car', transmission: '', drivetrain: '', fuelType: '', engine: '',
  status: 'PUBLISHED', features: '', description: '', images: [], syndicateCargurus: true, syndicateFacebook: true,
};

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v));

export function draftFrom(v: Vehicle): VehicleDraft {
  return {
    vin: str(v.vin), stockNumber: str(v.stockNumber), year: str(v.year), make: str(v.make), model: str(v.model), trim: str(v.trim),
    price: v.price === null || v.price === undefined ? '' : String(Number(v.price)), mileage: str(v.mileage),
    condition: str(v.condition), certified: v.certified ? 'Yes' : 'No',
    exteriorColor: str(v.exteriorColor), interiorColor: str(v.interiorColor), bodyStyle: str(v.bodyStyle), vehicleType: str(v.vehicleType),
    transmission: str(v.transmission), drivetrain: str(v.drivetrain), fuelType: str(v.fuelType), engine: str(v.engine),
    status: v.status, features: (v.features || []).join('\n'), description: str(v.description), images: [...(v.images || [])],
    syndicateCargurus: v.syndicateCargurus !== false, syndicateFacebook: v.syndicateFacebook !== false,
  };
}

export const cleanVin = (s: string) => s.toUpperCase().replace(/[\s-]/g, '');
export const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;
const numOf = (s: string) => Number(String(s).replace(/[$,\s]/g, ''));
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);

/** Body of POST /dealer/vehicles and PATCH /dealer/vehicles/:id (same keys as the web portal's form). */
export function toBody(d: VehicleDraft): Record<string, unknown> {
  const b: Record<string, unknown> = {
    vin: cleanVin(d.vin),
    stockNumber: d.stockNumber.trim(),
    year: d.year.trim() === '' ? null : parseInt(d.year, 10),
    make: d.make.trim(),
    model: d.model.trim(),
    trim: d.trim.trim(),
    price: d.price.trim() === '' ? null : numOf(d.price),
    mileage: d.mileage.trim() === '' ? null : Math.round(numOf(d.mileage)),
    condition: d.condition,
    exteriorColor: d.exteriorColor.trim(),
    interiorColor: d.interiorColor.trim(),
    bodyStyle: d.bodyStyle,
    vehicleType: d.vehicleType.trim(),
    transmission: d.transmission.trim(),
    drivetrain: d.drivetrain,
    fuelType: d.fuelType,
    engine: d.engine.trim(),
    status: d.status,
    features: lines(d.features),
    description: d.description.trim(),
    images: d.images,
    syndicateCargurus: d.syndicateCargurus,
    syndicateFacebook: d.syndicateFacebook,
  };
  // Certified Pre-Owned: blank = leave it to the server (the column is yes/no, there is no null)
  if (d.certified) b.certified = d.certified === 'Yes';
  if (d.safetyFeatures?.length) b.safetyFeatures = d.safetyFeatures;
  return b;
}

export type FieldErrors = Partial<Record<keyof VehicleDraft, string>>;

/**
 * The backend's save rules (vehicle.fields.ts: cleanVehicleInput + publishProblems), checked before submit:
 *  - Year 1900 … this year + 2
 *  - Available (PUBLISHED) needs Year, Make, Model, Price, Mileage and at least one photo
 *  - Pending / Sold need at least a make or a model
 *  - a VIN, when given, is 17 letters/digits without I, O, Q
 */
export function validate(d: VehicleDraft): FieldErrors {
  const e: FieldErrors = {};
  const maxYear = new Date().getFullYear() + 2;
  const vin = cleanVin(d.vin);
  if (vin && !VIN_RE.test(vin)) e.vin = 'A VIN has exactly 17 letters and numbers, and never I, O or Q.';
  if (d.year.trim()) {
    const y = Number(d.year);
    if (!Number.isInteger(y) || y < 1900 || y > maxYear) e.year = `Year must be between 1900 and ${maxYear}.`;
  }
  if (d.price.trim()) {
    const p = numOf(d.price);
    if (!Number.isFinite(p) || p < 0) e.price = 'Enter the price as a number.';
  }
  if (d.mileage.trim()) {
    const m = numOf(d.mileage);
    if (!Number.isFinite(m) || m < 0 || Math.floor(m) !== m) e.mileage = 'Mileage must be a whole number.';
  }
  if (d.status === 'PUBLISHED') {
    if (!d.year.trim()) e.year = e.year || 'Year is required to make it Available.';
    if (!d.make.trim()) e.make = 'Make is required to make it Available.';
    if (!d.model.trim()) e.model = 'Model is required to make it Available.';
    if (!d.price.trim()) e.price = e.price || 'Price is required to make it Available.';
    if (!d.mileage.trim()) e.mileage = e.mileage || 'Mileage is required to make it Available.';
    if (!d.images.length) e.images = 'Add at least one photo, or save it as Pending.';
  } else if (!d.make.trim() && !d.model.trim()) {
    e.make = 'Enter at least a make or model.';
  }
  return e;
}

/** What CarGurus also needs (shown as a hint, never blocks saving) — same list as dealer-portal/lib/cargurus.ts. */
export function cargurusMissing(d: VehicleDraft): string[] {
  const out: string[] = [];
  if (!VIN_RE.test(cleanVin(d.vin))) out.push('VIN');
  if (!d.trim.trim()) out.push('Trim');
  if (!(numOf(d.price) > 0)) out.push('Price');
  if (!d.exteriorColor.trim()) out.push('Exterior Color');
  if (!d.transmission.trim()) out.push('Transmission');
  if (!d.stockNumber.trim()) out.push('Stock #');
  if (!d.description.trim()) out.push('Description');
  if (!d.images.length) out.push('Photos');
  return out;
}

/** Fills the form from POST /dealer/ai/decode-vin (only non-empty answers overwrite). */
export function applyVin(d: VehicleDraft, r: VinDecode): VehicleDraft {
  const f = r.fields || ({} as VinDecode['fields']);
  const pick = (cur: string, v?: string) => (v && String(v).trim() ? String(v).trim() : cur);
  return {
    ...d,
    year: pick(d.year, f.year),
    make: pick(d.make, f.make),
    model: pick(d.model, f.model),
    trim: pick(d.trim, f.trim),
    bodyStyle: pick(d.bodyStyle, f.body),
    vehicleType: pick(d.vehicleType, f.vtype),
    engine: pick(d.engine, f.engine),
    transmission: pick(d.transmission, f.trans),
    drivetrain: pick(d.drivetrain, f.drive),
    fuelType: pick(d.fuelType, f.fuel),
  };
}

/** Shapes of the backend answers (see backend/src/** in the Dealership-Platform repository). */

export type VehicleStatus = 'PUBLISHED' | 'DRAFT' | 'SOLD';

/** GET /auth/me */
export interface Me {
  user: { id: string; kind: 'owner' | 'dealer'; login: string; name: string; email: string; role: string; perms: string[] };
  tenant: null | { id: string; name: string; logo: string; dealerCode: string; status: string; domains: string[]; siteUrl: string; features: Record<string, boolean> };
  support?: { email?: string; phone?: string; note?: string };
}

/** POST /auth/login → 200 */
export interface LoginResult {
  token: string;
  kind: 'owner' | 'dealer';
  tenantId?: string;
}

export interface CgIssue {
  field: string;
  column?: string;
  label: string;
  msg: string;
}

/** One vehicle (GET /dealer/vehicles/:id and the items of GET /dealer/vehicles) */
export interface Vehicle {
  id: string;
  status: VehicleStatus;
  slug?: string;
  title?: string;
  year: number | null;
  make: string;
  model: string;
  trim: string;
  vehicleType: string;
  bodyStyle: string;
  condition: string;
  certified: boolean;
  price: number | string | null;
  mileage: number | null;
  stockNumber: string;
  vin: string;
  exteriorColor: string;
  interiorColor: string;
  engine: string;
  drivetrain: string;
  transmission: string;
  fuelType: string;
  description: string;
  features: string[];
  images: string[];
  featured?: boolean;
  syndicateCargurus?: boolean;
  syndicateFacebook?: boolean;
  createdAt?: string;
  updatedAt?: string;
  /** list only: null = not sent to CarGurus, otherwise the problems ([] = ready) */
  cargurus?: { issues: CgIssue[] } | null;
}

/** GET /dealer/vehicles */
export interface VehicleList {
  items: Vehicle[];
  total: number;
  page: number;
  pageSize: number;
  cargurusOn: boolean;
  channels: { cargurus: boolean; marketplace: boolean; websiteOnly: boolean };
  counts: { PUBLISHED: number; DRAFT: number; SOLD: number; cgReady: number; cgExcluded: number };
}

/** GET /dealer/dashboard */
export interface Dashboard {
  vehicles: { published: number; draft: number; sold: number };
  inventoryValue: number;
  averagePrice: number;
  leads: { last7: number; last30: number; unread: number };
  progress: number;
}

/** POST /dealer/ai/decode-vin { vin } */
export interface VinDecode {
  fields: { year: string; make: string; model: string; trim: string; body: string; vtype: string; engine: string; fuel: string; drive: string; trans: string; doors?: string; seats?: string };
  clean: boolean;
  warnings: string[];
  checkDigitOk: boolean;
}

export interface CgRow {
  id: string;
  name: string;
  vin: string;
  stock: string;
  price: number | null;
  mileage: number | null;
  photos: number;
  image: string;
  live?: boolean;
  issues?: CgIssue[];
}

/** GET /dealer/feeds/cargurus/monitor */
export interface CgMonitor {
  ready: CgRow[];
  attention: CgRow[];
  liveCount: number;
  approved: { at: string; vehicles: number; by: string } | null;
  lastSync: { sent?: boolean; status?: string; reason?: string; at?: string; rows?: number } | null;
  pending: { id: string; at: string; vehicles: number } | null;
  dealer: { id?: string; name?: string; street?: string; city?: string; state?: string; zip?: string; crmEmail?: string };
  dealerWarnings: string[];
  xmlUrl: string;
}

/** POST /platform/cargurus/:tenantId/:id/dry-run and POST /api/cargurus/dry-run (Platform Admin only) */
export interface CgDryRun {
  status: 'READY_TO_SYNC' | 'ACTION_REQUIRED';
  blockers: string[];
  mode: string;
  submission: { id: string; status: string; createdAt: string };
  summary: { totalEvaluated: number; validCount: number; blockedCount: number; excludedFromFile: number; allPassed: boolean; dealershipProfileComplete: boolean; profileIssues: string[] };
  fileGeneration: { success: boolean; error: string | null; rowsCount: number; estimatedSizeBytes: number; warnings: string[] };
  sftpStaging: { protocol: string; targetHost: string; targetPort: number; remotePath: string; configured: boolean; missing: string[] };
  flaggedList: { row: number; vin: string; stock: string; name: string; reasons: string[] }[];
  timestamp: string;
}

/** Result of an upload to CarGurus (approve / resend) */
export interface CgDispatch {
  sent?: boolean;
  status?: string;
  reason?: string;
  rows?: number;
  host?: string;
  remotePath?: string;
  at?: string;
}

export interface FbItem {
  name: string;
  url: string;
}
export interface FbResult {
  url: string;
  name: string;
  status: string;
  note?: string;
  error?: string;
}
export interface FbJob {
  runId?: string;
  status: 'queued' | 'running' | 'finished';
  total: number;
  ok: number;
  failed: number;
  cancelled: boolean;
  label?: string;
  results: FbResult[];
}
export interface MpBatch {
  total: number;
  done: number;
  attention: number;
  failed: number;
  queued: number;
  running: number;
  finishedAt: number | null;
  items: { id: string; name: string; status: string; step: string; error: string }[];
}
/** GET /dealer/facebook/state?peek=1 */
export interface FbState {
  browserOpen: boolean;
  loggedIn: boolean | null;
  busy: boolean;
  busyWhat: string;
  job: FbJob | null;
  mp: { running: boolean; batch?: MpBatch | null };
  account: { fbUserId: string; fbName: string; connectedAt: string | null; pages: FbItem[] };
}
/** GET /dealer/facebook/quick-config */
export interface FbQuickConfig {
  account: { fbUserId: string; fbName: string; connectedAt: string | null; pages: FbItem[] };
  connection: { connected: boolean; loginLost: boolean; fbName: string };
}
/** GET /dealer/facebook/history → { runs } */
export interface FbRun {
  id: string;
  caption: string;
  media: number;
  ok: number;
  failed: number;
  cancelled: boolean;
  startedAt: string;
  finishedAt: string | null;
  results: FbResult[];
}

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export type Hours = Partial<Record<DayKey, { s: 'open' | 'closed'; o: string; c: string }>>;

/** GET /dealer/settings → { settings, tenant } (only the Business details used by the app are typed) */
export interface BusinessSettings {
  name: string;
  logo: string;
  phone: string;
  email: string;
  siteUrl: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  hours: Hours | null;
  hoursShort?: string;
}
export interface SettingsAnswer {
  settings: BusinessSettings & Record<string, unknown>;
  tenant: { id: string; name: string; dealerCode: string; domains: string[]; status: string };
}

/** POST /dealer/ai/command { text, auto } — the "Just tell it" bar, used by the app as AI search */
export interface AiCommand {
  intent: 'action' | 'question' | 'search' | 'navigate' | 'unclear';
  reply: string;
  /** a short keyword the AI suggests for the normal search (may be empty) */
  search: string;
  page?: string;
  car_ids: string[];
  cars: { id: string; name: string; stock: string; ext: string; price: number | null; status: VehicleStatus; photos: number }[];
  errors: string[];
  /** true when the server has no AI key: the text is meant as a normal search */
  noAi?: boolean;
}

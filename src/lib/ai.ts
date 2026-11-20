import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as VideoThumbnails from 'expo-video-thumbnails';
import { api, uploadPhoto } from './api';
import { applyVin, cleanVin, EMPTY_DRAFT, type VehicleDraft } from './vehicle';
import type { VinDecode } from './types';

/**
 * AI Quick Add — the mobile port of dealer-portal/lib/ai.ts + app/dealer/inventory/ai/page.tsx.
 *
 * The backend AI endpoints take JSON, not multipart: small base64 JPEG copies of the pictures go to the AI,
 * while the full photos are uploaded to POST /dealer/media (field "files") like every other vehicle photo, so the
 * server's .jpeg conversion applies to them.
 *
 *   GET  /dealer/ai/status            → { hasKey, provider, model, video, voice }
 *   POST /dealer/ai/analyze           { vehicle, images: [{ media_type, data }] }   ≤ 40 pictures, ≤ 2,000,000 base64 chars each
 *   POST /dealer/ai/analyze-video     { frames: [{ data }], audio }                 ≤ 12 frames per request, ≤ 1,000,000 chars each
 *   POST /dealer/ai/read-closeups     { images: [{ kind, data }] }                  ≤ 4 pictures (VIN sticker, odometer)
 *   POST /dealer/ai/write-description { facts }                                     → { text }
 *   POST /dealer/ai/decode-vin        { vin }
 */
export type AiStatus = { hasKey: boolean; provider: string; model: string; video: boolean; voice: boolean };

export type Finding = { value: string | number | null; confidence: string; evidence: string };
type Named = { name: string; confidence?: string; evidence?: string };
type Angle = { n: number; angle: string; quality: number };
export interface Findings {
  vehicle_matches_vin?: { status: string; note: string };
  exterior_color?: Finding;
  interior_color?: Finding;
  interior_material?: Finding;
  transmission?: Finding;
  odometer_miles?: Finding;
  vin_in_photo?: Finding;
  vin_in_video?: Finding;
  seen_vehicle?: string;
  features?: Named[];
  safety_features?: Named[];
  visible_condition_notes?: { note: string; evidence?: string }[];
  spoken_notes?: string[];
  photos?: Angle[];
  frames?: Angle[];
  vin_frames?: number[];
  odometer_frames?: number[];
  best_cover_photo?: number | null;
  description?: string;
}
type Closeups = { vin: { value: string; confidence: string; valid: boolean } | null; odometer_miles: { value: number; confidence: string } | null };

export type LocalPhoto = { key: string; uri: string; width: number; height: number; name?: string | null; mimeType?: string | null };
export type LocalVideo = { uri: string; name: string; durationMs: number };

export const MAX_AI_PHOTOS = 40;
export const MIN_VIDEO_MS = 3000;

const ANGLE_ORDER = ['front_left', 'front', 'front_right', 'right', 'rear_right', 'rear', 'rear_left', 'left', 'wheel', 'interior_front', 'dashboard', 'odometer', 'console', 'front_seats', 'rear_seats', 'trunk', 'engine', 'detail', 'damage', 'other', 'document', 'vin_label'];
const rankOf = (angle?: string) => {
  const i = ANGLE_ORDER.indexOf(angle || 'other');
  return i < 0 ? ANGLE_ORDER.indexOf('other') : i;
};

/** The 9th character of a VIN is a check digit (same check as the backend). */
export function vinOk(v: unknown): boolean {
  const s = String(v || '').toUpperCase();
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(s)) return false;
  const m: Record<string, number> = { A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8, J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9, S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9 };
  const w = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += (/\d/.test(s[i]) ? Number(s[i]) : m[s[i]]) * w[i];
  return (sum % 11 === 10 ? 'X' : String(sum % 11)) === s[8];
}

/** A small JPEG copy (longest side ≤ maxSide) as base64 — what the AI reads. Never enlarges. */
export async function shrink(uri: string, width: number, height: number, maxSide: number, compress: number): Promise<string> {
  const ctx = ImageManipulator.manipulate(uri);
  const longest = Math.max(width || 0, height || 0);
  if (!longest || longest > maxSide) {
    if (!longest || width >= height) ctx.resize({ width: maxSide, height: null });
    else ctx.resize({ width: null, height: maxSide });
  }
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
  if (!out.base64) throw new Error('This picture could not be prepared for the AI.');
  return out.base64;
}

type Frame = { t: number; uri: string; width: number; height: number; data: string };

/**
 * Still pictures from the walkaround video, evenly spread (one about every 5 seconds, 12 – 18 in total).
 * Only these small pictures go to the AI; the video itself never leaves the phone.
 */
export async function extractFrames(video: LocalVideo, onProgress: (done: number, total: number) => void): Promise<Frame[]> {
  const dur = video.durationMs;
  if (!dur) throw new Error('The length of this video could not be read. Try another video, or use photos.');
  if (dur < MIN_VIDEO_MS) throw new Error('The video is too short. Film at least 30 seconds around the car.');
  const n = Math.max(12, Math.min(18, Math.round(dur / 5000)));
  const frames: Frame[] = [];
  for (let i = 0; i < n; i++) {
    const t = Math.round(Math.min(dur - 200, 300 + ((dur - 600) * i) / (n - 1)));
    try {
      const th = await VideoThumbnails.getThumbnailAsync(video.uri, { time: Math.max(0, t), quality: 0.9 });
      frames.push({ t, uri: th.uri, width: th.width, height: th.height, data: await shrink(th.uri, th.width, th.height, 448, 0.72) });
    } catch {
      /* a moment that cannot be read is skipped */
    }
    onProgress(i + 1, n);
  }
  if (!frames.length) throw new Error("This video format can't be read on this phone. Try an MP4 video, or use photos.");
  return frames;
}

/** The answers of the video parts → one set of findings (same rules as the web portal's mergeVideo). */
function mergeVideo(list: { r: Findings; off: number }[]): Findings {
  const rank: Record<string, number> = { high: 3, medium: 2, low: 1 };
  type Key = 'vin_in_video' | 'exterior_color' | 'interior_color' | 'interior_material' | 'transmission' | 'odometer_miles';
  const best = (key: Key, test?: (v: Finding) => boolean): Finding | null => {
    let b: Finding | null = null;
    for (const { r } of list) {
      const v = r[key];
      if (v && v.value != null && v.value !== '' && (!test || test(v)) && (!b || (rank[v.confidence] || 0) > (rank[b.confidence] || 0))) b = v;
    }
    return b;
  };
  const union = (key: 'features' | 'safety_features'): Named[] => {
    const seen = new Set<string>();
    const out: Named[] = [];
    for (const { r } of list)
      for (const x of r[key] || []) {
        const id = String(x.name || '').toLowerCase();
        if (id && !seen.has(id)) {
          seen.add(id);
          out.push(x);
        }
      }
    return out;
  };
  const first = list[0].r;
  const f: Findings = { ...first };
  f.vin_in_video = best('vin_in_video', (v) => vinOk(v.value)) || best('vin_in_video') || { value: null, confidence: 'low', evidence: 'not visible' };
  for (const k of ['exterior_color', 'interior_color', 'interior_material', 'transmission', 'odometer_miles'] as const) f[k] = best(k) || first[k] || { value: null, confidence: 'low', evidence: '' };
  f.seen_vehicle = list.map((x) => x.r.seen_vehicle).find(Boolean) || '';
  f.features = union('features');
  f.safety_features = union('safety_features');
  f.visible_condition_notes = list.flatMap((x) => x.r.visible_condition_notes || []);
  f.spoken_notes = [...new Set(list.flatMap((x) => x.r.spoken_notes || []))];
  f.frames = list.flatMap(({ r, off }) => (r.frames || []).map((x) => ({ ...x, n: x.n + off })));
  f.vin_frames = list.flatMap(({ r, off }) => (r.vin_frames || []).map((n) => n + off));
  f.odometer_frames = list.flatMap(({ r, off }) => (r.odometer_frames || []).map((n) => n + off));
  return f;
}

const AI_TIMEOUT = 180_000;
const aiPost = <T,>(path: string, body: unknown) => api<T>(`/dealer/ai/${path}`, { method: 'POST', body, timeout: AI_TIMEOUT });

export type StepKey = 'upload' | 'photos' | 'video' | 'vin' | 'text';
export type StepState = { st: 'run' | 'ok' | 'skip' | 'fail'; text: string };
export interface AiResult {
  draft: VehicleDraft;
  /** fields the AI (or the VIN record it found) filled in — highlighted in the review form */
  aiFields: (keyof VehicleDraft)[];
  /** things the dealer should check */
  notes: string[];
}

const val = (f?: Finding | null) => (f && f.value !== null && f.value !== undefined && f.value !== '' ? String(f.value) : '');
const sure = (f?: Finding | null) => !!f && f.confidence !== 'low';

/**
 * The whole "Analyze with AI" run:
 *   1. full photos → POST /dealer/media (kept for the listing, stored as .jpeg)      ┐ at the same time
 *   2. small copies → /dealer/ai/analyze; video stills → /dealer/ai/analyze-video    ┘
 *   3. VIN (typed, or read from a photo / close-up) → /dealer/ai/decode-vin
 *   4. description → /dealer/ai/write-description
 */
export async function runAiExtraction(
  input: { photos: LocalPhoto[]; video: LocalVideo | null; vin: string; dealership: string; canVideo: boolean },
  step: (k: StepKey, s: StepState) => void,
): Promise<AiResult> {
  const notes: string[] = [];
  const photos = input.photos.slice(0, MAX_AI_PHOTOS);
  let vin = vinOk(cleanVin(input.vin)) ? cleanVin(input.vin) : '';
  const box: { d: VinDecode | null } = { d: null };

  const decode = async (v: string) => {
    try {
      box.d = await api<VinDecode>('/dealer/ai/decode-vin', { method: 'POST', body: { vin: v }, timeout: 45_000 });
    } catch {
      box.d = null;
    }
    return box.d;
  };
  if (vin) {
    step('vin', { st: 'run', text: 'Looking up the VIN…' });
    const d = await decode(vin);
    step('vin', d ? { st: 'ok', text: `VIN: ${[d.fields.year, d.fields.make, d.fields.model].filter(Boolean).join(' ') || vin}` } : { st: 'fail', text: 'The VIN could not be looked up' });
  }

  // 1. the full photos, one after another (order kept), with progress
  const uploadAll = async (): Promise<(string | null)[]> => {
    const urls: (string | null)[] = [];
    let failed = 0;
    for (let i = 0; i < photos.length; i++) {
      const p = photos[i];
      step('upload', { st: 'run', text: `Uploading photo ${i + 1} of ${photos.length}…` });
      try {
        const f = await uploadPhoto({ uri: p.uri, name: p.name, mimeType: p.mimeType });
        urls.push(f.url);
      } catch {
        urls.push(null);
        failed++;
      }
    }
    if (photos.length) step('upload', failed ? { st: 'fail', text: `${photos.length - failed} of ${photos.length} photos uploaded` } : { st: 'ok', text: `${photos.length} photo${photos.length === 1 ? '' : 's'} uploaded (saved as .jpeg)` });
    if (failed) notes.push(`${failed} photo${failed === 1 ? '' : 's'} could not be uploaded. Add ${failed === 1 ? 'it' : 'them'} again in the Photos section.`);
    return urls;
  };

  // 2a. photos → AI
  const readPhotos = async (): Promise<Findings | null> => {
    if (!photos.length) return null;
    step('photos', { st: 'run', text: 'AI is reading the photos…' });
    try {
      const images: { media_type: string; data: string }[] = [];
      for (const p of photos) images.push({ media_type: 'image/jpeg', data: await shrink(p.uri, p.width, p.height, 512, 0.8) });
      const f = box.d ? box.d.fields : null;
      const r = await aiPost<{ findings: Findings }>('analyze', { vehicle: f ? { year: f.year, make: f.make, model: f.model, trim: f.trim, body: f.body } : {}, images });
      step('photos', { st: 'ok', text: 'Photos read' });
      return r.findings;
    } catch (e) {
      step('photos', { st: 'fail', text: (e as Error).message });
      if (!input.video) throw e;
      return null;
    }
  };

  // 2b. video → stills → AI (in parts of 10), then sharp close-ups of the VIN sticker and the odometer
  const readVideo = async (): Promise<{ f: Findings; frames: Frame[]; close: Closeups | null } | null> => {
    const video = input.video;
    if (!video) return null;
    if (!input.canVideo) {
      step('video', { st: 'skip', text: 'Video reading is not switched on for this server' });
      notes.push('The AI on this server cannot read videos (it needs Gemini, OpenRouter or Qwen). Only the photos were used.');
      return null;
    }
    try {
      step('video', { st: 'run', text: 'Picking moments from the video…' });
      const frames = await extractFrames(video, (d, t) => step('video', { st: 'run', text: `Picking moments from the video (${d} of ${t})…` }));
      const parts: { off: number; frames: Frame[] }[] = [];
      for (let i = 0; i < frames.length; i += 10) parts.push({ off: i, frames: frames.slice(i, i + 10) });
      let done = 0;
      step('video', { st: 'run', text: `AI is reading the video (0 of ${parts.length} parts done)…` });
      const out = await Promise.allSettled(
        parts.map(async (p) => {
          // audio: '' — the dealer's voice is not sent from the phone (the web portal reads it in the browser)
          const r = await aiPost<{ findings: Findings }>('analyze-video', { frames: p.frames.map((x) => ({ data: x.data })), audio: '' });
          step('video', { st: 'run', text: `AI is reading the video (${++done} of ${parts.length} parts done)…` });
          return r;
        }),
      );
      const ok: { r: Findings; off: number }[] = [];
      out.forEach((x, k) => {
        if (x.status === 'fulfilled') ok.push({ r: x.value.findings, off: parts[k].off });
      });
      if (!ok.length) throw (out[0] as PromiseRejectedResult).reason;
      const f = mergeVideo(ok);

      let close: Closeups | null = null;
      const fr = f.frames || [];
      const byAngle = (g: string) => fr.filter((x) => x.angle === g).sort((a, b) => b.quality - a.quality).map((x) => x.n);
      const vinN = [...new Set([...(f.vin_frames || []), ...byAngle('vin_label'), ...byAngle('document')])].slice(0, 2);
      const odoN = [...new Set([...(f.odometer_frames || []), ...byAngle('odometer'), ...byAngle('dashboard')])].slice(0, 2);
      const imgs: { kind: string; data: string }[] = [];
      for (const [list, kind] of [[vinN, 'VIN sticker'], [odoN, 'instrument cluster / odometer']] as const)
        for (const n of list) {
          const x = frames[n - 1];
          if (x) imgs.push({ kind, data: await shrink(x.uri, x.width, x.height, 1600, 0.9) });
        }
      if (imgs.length) close = await aiPost<Closeups>('read-closeups', { images: imgs.slice(0, 4) }).catch(() => null);
      step('video', { st: 'ok', text: `Video read (${frames.length} moments)` });
      return { f, frames, close };
    } catch (e) {
      step('video', { st: 'fail', text: (e as Error).message });
      if (!photos.length) throw e;
      notes.push(`The video could not be read: ${(e as Error).message}`);
      return null;
    }
  };

  const [urls, pf, vf] = await Promise.all([uploadAll(), readPhotos(), readVideo()]);

  // 3. VIN read by the AI → the official VIN record
  if (!vin) {
    const cands = [vf?.close?.vin?.value, val(pf?.vin_in_photo), val(vf?.f.vin_in_video)].map((x) => cleanVin(String(x || ''))).filter(Boolean);
    const good = cands.find((x) => vinOk(x));
    if (good) {
      step('vin', { st: 'run', text: 'VIN found — looking it up…' });
      vin = good;
      const d = await decode(good);
      step('vin', d ? { st: 'ok', text: `VIN found: ${[d.fields.year, d.fields.make, d.fields.model].filter(Boolean).join(' ') || good}` } : { st: 'fail', text: `VIN ${good} read, but it could not be looked up` });
    } else {
      step('vin', { st: 'skip', text: cands.length ? 'A VIN was seen but could not be read for sure' : 'No VIN visible' });
      notes.push(cands.length ? `The AI read "${cands[0]}" as the VIN but it does not pass the VIN check. Type the VIN and tap Decode VIN.` : 'No VIN was found. Type the VIN and tap Decode VIN to fill in year, make, model and engine.');
    }
  }

  // ---- the review form ----
  let draft: VehicleDraft = { ...EMPTY_DRAFT };
  const ai = new Set<keyof VehicleDraft>();
  const put = <K extends keyof VehicleDraft>(k: K, v: VehicleDraft[K] | '' | null | undefined) => {
    if (v === '' || v === null || v === undefined) return;
    draft = { ...draft, [k]: v };
    ai.add(k);
  };
  const d = box.d;
  if (vin) put('vin', vin);
  if (d) {
    const before = draft;
    draft = applyVin(draft, d);
    for (const k of ['year', 'make', 'model', 'trim', 'bodyStyle', 'vehicleType', 'engine', 'transmission', 'drivetrain', 'fuelType'] as const) if (draft[k] !== before[k]) ai.add(k);
    if (!d.checkDigitOk) notes.push('The VIN check digit does not match — please compare the VIN with the sticker.');
  } else if (vf?.f.seen_vehicle) {
    const [make, ...rest] = vf.f.seen_vehicle.trim().split(/\s+/);
    put('make', make);
    put('model', rest.join(' '));
    notes.push(`Make and model ("${vf.f.seen_vehicle}") come from what the AI saw in the video — please check them.`);
  }

  const pick = (k: 'exterior_color' | 'interior_color' | 'interior_material' | 'transmission' | 'odometer_miles'): Finding | undefined => {
    const a = pf?.[k];
    const b = vf?.f[k];
    if (val(a) && (sure(a) || !val(b))) return a;
    return val(b) ? b : a;
  };
  const low: string[] = [];
  const ext = pick('exterior_color');
  put('exteriorColor', val(ext));
  if (val(ext) && !sure(ext)) low.push('exterior colour');
  const int = pick('interior_color');
  if (val(int) && val(int) !== 'Other') {
    put('interiorColor', val(int));
    if (!sure(int)) low.push('interior colour');
  }
  if (!draft.transmission) put('transmission', val(pick('transmission')));
  const odo = vf?.close?.odometer_miles?.value ?? pick('odometer_miles')?.value;
  if (odo !== null && odo !== undefined && String(odo).replace(/[^0-9]/g, '')) {
    put('mileage', String(odo).replace(/[^0-9]/g, ''));
    if (!vf?.close?.odometer_miles && !sure(pick('odometer_miles'))) low.push('mileage');
  }
  if (low.length) notes.push(`The AI was not sure about: ${low.join(', ')}. Please check.`);

  const names = (list?: Named[]) => (list || []).filter((x) => x && x.name && x.confidence !== 'low').map((x) => String(x.name).trim());
  const uniq = (list: string[]) => list.filter((x, i, a) => x && a.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i);
  const feats = uniq([...names(pf?.features), ...names(vf?.f.features)]);
  const mat = val(pick('interior_material'));
  if (mat && !feats.some((x) => x.toLowerCase().includes(mat.toLowerCase()))) feats.push(`${mat} seats`);
  put('features', feats.join('\n'));
  const safety = uniq([...names(pf?.safety_features), ...names(vf?.f.safety_features), ...((d as (VinDecode & { safety?: unknown[] }) | null)?.safety || []).filter((x): x is string => typeof x === 'string')]);
  if (safety.length) draft = { ...draft, safetyFeatures: safety };

  const cond = [...(pf?.visible_condition_notes || []), ...(vf?.f.visible_condition_notes || [])].map((x) => x.note).filter(Boolean);
  if (cond.length) notes.push(`Seen on the vehicle: ${uniq(cond).join('; ')}.`);
  if (pf?.vehicle_matches_vin?.status === 'mismatch') notes.push(pf.vehicle_matches_vin.note || 'The photos do not look like the vehicle of this VIN. Please check the VIN.');
  if (d && vf?.f.seen_vehicle && d.fields.make && !vf.f.seen_vehicle.toLowerCase().includes(d.fields.make.toLowerCase())) notes.push(`The video looks like a ${vf.f.seen_vehicle}, but the VIN is a ${d.fields.make} ${d.fields.model}.`);

  // photos for the listing: cover first, then the dealer walk-around order; then good stills from the video
  const angles = new Map<number, Angle>((pf?.photos || []).map((x) => [x.n, x]));
  const cover = pf?.best_cover_photo || 0;
  const ordered = urls
    .map((u, i) => ({ u, n: i + 1, a: angles.get(i + 1) }))
    .filter((x): x is { u: string; n: number; a: Angle | undefined } => !!x.u)
    .sort((x, y) => (x.n === cover ? -1 : y.n === cover ? 1 : rankOf(x.a?.angle) - rankOf(y.a?.angle) || (y.a?.quality || 0) - (x.a?.quality || 0) || x.n - y.n));
  const images = ordered.map((x) => x.u);
  if (vf) {
    const keep = (vf.f.frames || [])
      .filter((x) => x.quality >= 3 && !['vin_label', 'document', 'other'].includes(x.angle) && vf.frames[x.n - 1])
      .sort((x, y) => rankOf(x.angle) - rankOf(y.angle) || y.quality - x.quality)
      .slice(0, Math.max(0, 24 - images.length));
    let i = 0;
    for (const x of keep) {
      step('upload', { st: 'run', text: `Saving video photo ${++i} of ${keep.length}…` });
      try {
        images.push((await uploadPhoto({ uri: vf.frames[x.n - 1].uri, name: `video-${x.n}.jpg`, mimeType: 'image/jpeg' })).url);
      } catch {
        /* skipped */
      }
    }
    if (keep.length) step('upload', { st: 'ok', text: `${images.length} photo${images.length === 1 ? '' : 's'} attached (saved as .jpeg)` });
  }
  if (images.length) {
    draft = { ...draft, images };
    ai.add('images');
  }

  // 4. description: from the facts when the VIN record is known, otherwise what the AI wrote from the photos
  let description = String(pf?.description || '').trim();
  if (d) {
    step('text', { st: 'run', text: 'Writing the description…' });
    const f = d.fields;
    const facts = {
      dealership: input.dealership, Year: f.year, Make: f.make, Model: f.model, Trim: f.trim, 'Body style': f.body, Engine: f.engine, Drivetrain: f.drive, 'Fuel type': f.fuel,
      'Exterior colour': draft.exteriorColor, 'Interior colour': draft.interiorColor, 'Interior material': mat, Transmission: draft.transmission, Mileage: draft.mileage,
      Features: feats, 'Dealer said': vf?.f.spoken_notes || [],
    };
    try {
      description = (await aiPost<{ text: string }>('write-description', { facts })).text.trim() || description;
    } catch {
      /* keeps the first description, if any */
    }
  }
  if (description) {
    put('description', description);
    step('text', { st: 'ok', text: 'Description written' });
  } else step('text', { st: 'skip', text: 'No description — write it in the form' });

  return { draft, aiFields: [...ai], notes };
}

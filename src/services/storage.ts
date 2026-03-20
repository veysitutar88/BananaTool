/**
 * storage.ts — Supabase Storage + DB for generated images and DNA records
 *
 * Storage bucket: "generated"  (create in Supabase dashboard → Storage → New bucket → Public)
 * DB table:       "generations" (create via SQL editor — see schema below)
 *
 * SQL to run once in Supabase SQL Editor:
 * ─────────────────────────────────────────────────────────────────────────────
 * create table if not exists generations (
 *   id           uuid primary key default gen_random_uuid(),
 *   created_at   timestamptz default now(),
 *   preset_name  text,
 *   model        text,
 *   dna_json     jsonb,
 *   built_prompt text,
 *   image_url    text
 * );
 * alter table generations enable row level security;
 * create policy "allow anon insert" on generations for insert with check (true);
 * create policy "allow anon select" on generations for select using (true);
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { supabase } from '../lib/supabase';
import { logger } from '../utils/logger';

const log = logger.scope('Storage');

const BUCKET = 'generated';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GenerationRecord {
  preset_name?: string;
  model?: string;
  dna_json?: unknown;
  built_prompt?: string;
  image_url?: string;
}

export interface StoredGeneration {
  id: string;
  created_at: string;
  preset_name: string | null;
  model: string | null;
  dna_json: unknown;
  built_prompt: string | null;
  image_url: string | null;
}

// ─── Upload image ─────────────────────────────────────────────────────────────

/**
 * Upload a generated image (data URL) to Supabase Storage.
 * Returns the public URL, or null if Supabase is not configured.
 *
 * @param dataUrl   data:image/png;base64,... string
 * @param filename  e.g. "gas-station-fit-001.png"
 */
export async function uploadImage(dataUrl: string, filename: string): Promise<string | null> {
  if (!supabase) {
    log.warn('uploadImage — Supabase not configured, skipping upload');
    return null;
  }

  // Convert data URL → Blob
  const res = await fetch(dataUrl);
  const blob = await res.blob();

  const path = `${Date.now()}-${filename}`;

  return logger.watchdog('Storage', `uploadImage(${filename})`, (async () => {
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      contentType: blob.type || 'image/png',
      upsert: false,
    });

    if (error) {
      log.error(`uploadImage failed — ${error.message}`, error);
      return null;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    log.info(`uploadImage — OK  url=${data.publicUrl}`);
    return data.publicUrl;
  })(), 30_000);
}

// ─── Fetch generation history ─────────────────────────────────────────────────

/**
 * Fetch the most recent generations from the "generations" table.
 * Returns an empty array if Supabase is not configured.
 */
export async function fetchGenerations(limit = 50): Promise<StoredGeneration[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('generations')
    .select('id, created_at, preset_name, model, dna_json, built_prompt, image_url')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    log.error(`fetchGenerations failed — ${error.message}`, error);
    return [];
  }
  return (data ?? []) as StoredGeneration[];
}

// ─── Save generation record ───────────────────────────────────────────────────

/**
 * Insert a generation record into the "generations" table.
 * Silently skips if Supabase is not configured.
 */
export async function saveGeneration(record: GenerationRecord): Promise<void> {
  if (!supabase) {
    log.warn('saveGeneration — Supabase not configured, skipping');
    return;
  }

  return logger.watchdog('Storage', 'saveGeneration', (async () => {
    const { error } = await supabase.from('generations').insert(record);
    if (error) {
      log.error(`saveGeneration failed — ${error.message}`, error);
    } else {
      log.info(`saveGeneration — OK  preset=${record.preset_name ?? '—'}  model=${record.model ?? '—'}`);
    }
  })(), 10_000);
}

// ─── User presets ──────────────────────────────────────────────────────────────

export interface UserPreset {
  id: string;
  created_at: string;
  name: string;
  prompt: string;
}

/**
 * Fetch all user-saved presets ordered newest-first.
 */
export async function fetchUserPresets(): Promise<UserPreset[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('user_presets')
    .select('id, created_at, name, prompt')
    .order('created_at', { ascending: false });

  if (error) {
    log.error(`fetchUserPresets — ${error.message}`, error);
    return [];
  }
  return (data ?? []) as UserPreset[];
}

/**
 * Save a new user preset. Returns the created record or null on failure.
 */
export async function saveUserPreset(name: string, prompt: string): Promise<UserPreset | null> {
  if (!supabase) {
    log.warn('saveUserPreset — Supabase not configured, skipping');
    return null;
  }

  const { data, error } = await supabase
    .from('user_presets')
    .insert({ name, prompt })
    .select()
    .single();

  if (error) {
    log.error(`saveUserPreset — ${error.message}`, error);
    return null;
  }

  log.info(`saveUserPreset — OK  name=${name}`);
  return data as UserPreset;
}

/**
 * Delete a user preset by id.
 */
export async function deleteUserPreset(id: string): Promise<void> {
  if (!supabase) return;

  const { error } = await supabase
    .from('user_presets')
    .delete()
    .eq('id', id);

  if (error) {
    log.error(`deleteUserPreset — ${error.message}`, error);
  } else {
    log.info(`deleteUserPreset — OK  id=${id}`);
  }
}

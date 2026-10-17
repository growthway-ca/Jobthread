import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { errorMessage } from './format';
import { signedPhotoUrls } from './photos';
import type { Change, Client, Job, JobEvent, JobPhoto, Milestone, ScheduleItem } from './types';

export interface JobData {
  job: Job;
  client: Client;
  changes: Change[];
  events: JobEvent[];
  milestones: Milestone[];
  photos: JobPhoto[];
  schedule: ScheduleItem[];
  /** storage_path -> signed URL, valid for an hour. */
  photoUrls: Record<string, string>;
}

/**
 * Loads a job with its client, changes and log. Reloads when the app comes
 * back into view, so an approval made while the contractor was in Messages
 * shows up when they switch back.
 */
export function useJob(jobId: string | undefined) {
  const [data, setData] = useState<JobData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const reload = useCallback(async () => {
    if (!jobId) return;
    const [jobRes, changesRes, eventsRes, milestonesRes, photosRes, scheduleRes] = await Promise.all([
      supabase.from('jobs').select('*, clients(*)').eq('id', jobId).maybeSingle(),
      supabase.from('changes').select('*').eq('job_id', jobId).order('number'),
      supabase.from('job_events').select('*').eq('job_id', jobId).order('created_at', { ascending: false }),
      supabase.from('payment_milestones').select('*').eq('job_id', jobId).order('position'),
      supabase.from('job_photos').select('*').eq('job_id', jobId).order('created_at'),
      supabase.from('job_schedule').select('*').eq('job_id', jobId).order('starts_on').order('created_at'),
    ]);
    const firstError =
      jobRes.error ?? changesRes.error ?? eventsRes.error ?? milestonesRes.error ?? photosRes.error ?? scheduleRes.error;
    if (firstError) {
      setError(errorMessage(firstError));
      return;
    }
    if (!jobRes.data) {
      setNotFound(true);
      return;
    }
    const { clients, ...job } = jobRes.data as Job & { clients: Client };
    const photos = (photosRes.data ?? []) as JobPhoto[];
    const photoUrls = await signedPhotoUrls(photos.map((p) => p.storage_path));
    setError(null);
    setData({
      job: job as Job,
      client: clients,
      changes: (changesRes.data ?? []) as Change[],
      events: (eventsRes.data ?? []) as JobEvent[],
      milestones: (milestonesRes.data ?? []) as Milestone[],
      photos,
      photoUrls,
      schedule: (scheduleRes.data ?? []) as ScheduleItem[],
    });
  }, [jobId]);

  useEffect(() => {
    void reload();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [reload]);

  return { data, error, notFound, reload };
}

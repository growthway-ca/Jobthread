import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { errorMessage } from '../lib/format';
import { preparePhoto, uploadPhotos, type PreparedPhoto } from '../lib/photos';
import { dailyLogMessage, firstName, smsHref } from '../lib/sms';
import { useJob } from '../lib/useJob';
import { ErrorNote, Loading, Page } from '../components/Layout';
import { SendActions } from '../components/SendActions';

const MAX_PHOTOS = 8;

export function NewDailyLog() {
  const { jobId } = useParams();
  const { data, error: loadError } = useJob(jobId);
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<PreparedPhoto[]>([]);
  const [preparing, setPreparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Free the preview images when leaving the screen.
  const photosRef = useRef(photos);
  photosRef.current = photos;
  useEffect(() => () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl)), []);

  if (!data) {
    return (
      <Page nav={false}>
        <ErrorNote message={loadError} />
        {!loadError && <Loading />}
      </Page>
    );
  }
  const { job, client } = data;

  async function addFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPreparing(true);
    setError(null);
    try {
      const room = MAX_PHOTOS - photos.length;
      const prepared = await Promise.all(Array.from(files).slice(0, room).map(preparePhoto));
      setPhotos((current) => [...current, ...prepared]);
      if (files.length > room) setError(`Up to ${MAX_PHOTOS} photos per log.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPreparing(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      URL.revokeObjectURL(current[index].previewUrl);
      return current.filter((_, i) => i !== index);
    });
  }

  async function save(e: FormEvent, text: boolean) {
    e.preventDefault();
    if (!body.trim()) return setError('Say what got done today.');
    setBusy(true);
    setError(null);
    try {
      const { data: row, error } = await supabase
        .from('job_events')
        .insert({ job_id: job.id, kind: 'daily_log', body: body.trim() })
        .select('id')
        .single();
      if (error || !row) throw error;
      await uploadPhotos(job.id, row.id, photos);
      const message = dailyLogMessage({ clientName: client.name, jobTitle: job.title, body, when: new Date() });
      setSaved(message);
      window.scrollTo(0, 0);
      if (text) window.location.href = smsHref(client.phone, message);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (saved) {
    return (
      <Page nav={false}>
        <h1>Daily log saved</h1>
        <p className="muted">
          It’s in the job thread{photos.length > 0 ? ' with your photos' : ''}. To send it to {firstName(client.name)},
          use Messages below.
          {photos.length > 0 ? ' Add the photos from your camera roll if you want them to see those too.' : ''}
        </p>
        <div className="card sms-preview">{saved}</div>
        <SendActions phone={client.phone} message={saved} label={`Text ${firstName(client.name) || 'client'}`} />
        <Link to={`/jobs/${job.id}`} className="btn plain">
          Back to {job.title}
        </Link>
      </Page>
    );
  }

  return (
    <Page nav={false}>
      <Link to={`/jobs/${job.id}`} className="back">
        Back to {job.title}
      </Link>
      <h1>Daily log</h1>
      <form onSubmit={(e) => void save(e, true)} className="stack">
        <label className="field">
          <span>What got done today</span>
          <textarea
            rows={4}
            required
            maxLength={2000}
            placeholder="Electrical rough-in done in the office and rec room."
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>

        <div className="field">
          <span>Photos</span>
          {photos.length > 0 && (
            <div className="photo-grid">
              {photos.map((p, i) => (
                <div key={p.previewUrl} className="photo">
                  <img src={p.previewUrl} alt="" />
                  <button type="button" className="photo-remove" aria-label="Remove photo" onClick={() => removePhoto(i)}>
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {photos.length < MAX_PHOTOS && (
            <label className="photo-add">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => void addFiles(e.target.files)}
              />
              <span>{preparing ? 'Getting photos ready…' : photos.length ? 'Add more photos' : 'Add photos'}</span>
            </label>
          )}
        </div>

        <ErrorNote message={error} />
        <button className="btn primary" disabled={busy || preparing}>
          {busy ? 'Saving…' : `Save and text ${firstName(client.name) || 'client'}`}
        </button>
        <button type="button" className="btn secondary" disabled={busy || preparing} onClick={(e) => void save(e, false)}>
          Save to the thread only
        </button>
      </form>
    </Page>
  );
}

import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../lib/auth';
import { errorMessage, formatWhen, formatWhenSentence } from '../lib/format';
import { copyText, firstName, photoConsentMessage, smsHref } from '../lib/sms';
import { useJob } from '../lib/useJob';
import { ErrorNote, Loading, Page } from '../components/Layout';

const W = 1080;
const H = 1350; // 4:5, fits Instagram and Facebook feeds

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not load a photo.'));
    img.src = url;
  });
}

/** Draws `img` to fill the box, cropping the overflow (like object-fit: cover). */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function drawLabel(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.font = '700 44px Archivo, Helvetica, Arial, sans-serif';
  const padX = 28;
  const width = ctx.measureText(text).width + padX * 2;
  ctx.fillStyle = 'rgba(27, 31, 29, 0.85)';
  ctx.beginPath();
  ctx.roundRect(x, y, width, 76, 38);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + padX, y + 39);
}

async function buildImage(beforeUrl: string, afterUrl: string, business: string): Promise<Blob> {
  const [before, after] = await Promise.all([loadImage(beforeUrl), loadImage(afterUrl)]);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This phone could not build the image.');
  const half = (H - 8) / 2;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);
  drawCover(ctx, before, 0, 0, W, half);
  drawCover(ctx, after, 0, half + 8, W, half);
  drawLabel(ctx, 'Before', 32, 32);
  drawLabel(ctx, 'After', 32, half + 40);
  if (business) {
    ctx.font = '600 34px Archivo, Helvetica, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
    ctx.shadowBlur = 8;
    ctx.fillText(business, W - 36, H - 36);
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not build the image.'))), 'image/jpeg', 0.9),
  );
}

/** Before-and-after post from daily log photos (/jobs/:jobId/post). */
export function BeforeAfter() {
  const { jobId } = useParams();
  const { contractor } = useAuth();
  const { data, error: loadError, reload } = useJob(jobId);
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [image, setImage] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data || beforeId) return;
    const photos = data.photos;
    if (photos.length >= 2) {
      setBeforeId(photos[0].id);
      setAfterId(photos[photos.length - 1].id);
    }
    setCaption(
      `${data.job.title}: before and after. From start to finish by ${contractor?.business_name ?? 'our team'}.`,
    );
  }, [data, beforeId, contractor]);

  // Free the previous image when a new one replaces it, and on leaving.
  useEffect(
    () => () => {
      if (image) URL.revokeObjectURL(image.url);
    },
    [image],
  );

  if (!data) {
    return (
      <Page nav={false}>
        <ErrorNote message={loadError} />
        {!loadError && <Loading />}
      </Page>
    );
  }
  const { job, client, photos, photoUrls } = data;
  const consented = Boolean(job.photo_consent_at);

  async function recordConsent(value: boolean) {
    const { error } = await supabase
      .from('jobs')
      .update({ photo_consent_at: value ? new Date().toISOString() : null })
      .eq('id', job.id);
    if (error) return setError(errorMessage(error));
    await reload();
  }

  async function make() {
    const before = photos.find((p) => p.id === beforeId);
    const after = photos.find((p) => p.id === afterId);
    if (!before || !after) return setError('Pick a before and an after photo.');
    setBusy(true);
    setError(null);
    try {
      const blob = await buildImage(photoUrls[before.storage_path], photoUrls[after.storage_path], contractor?.business_name ?? '');
      setImage({ blob, url: URL.createObjectURL(blob) });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!image) return;
    const file = new File([image.blob], 'before-after.jpg', { type: 'image/jpeg' });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text: caption });
      } catch {
        // Closing the share sheet isn't an error.
      }
    }
  }

  return (
    <Page nav={false}>
      <Link to={`/jobs/${job.id}`} className="back">
        Back to {job.title}
      </Link>
      <h1>Before and after</h1>

      <section className="card pad-card stack-tight">
        <h2>{consented ? `${firstName(client.name) || 'Client'} said yes` : `Ask ${firstName(client.name) || 'the client'} first`}</h2>
        {consented ? (
          <p className="muted small">
            OK to share, noted {formatWhenSentence(job.photo_consent_at)} Keep the address and anything personal out of the photos.
          </p>
        ) : (
          <p className="muted small">Only post photos of someone’s home with their OK. This text asks, and says no address or names.</p>
        )}
        {!consented ? (
          <div className="action-grid">
            <a
              href={smsHref(
                client.phone,
                photoConsentMessage({ clientName: client.name, jobTitle: job.title, businessName: contractor?.business_name ?? '' }),
              )}
              className="btn small outline"
            >
              Ask by text
            </a>
            <button type="button" className="btn small dark" onClick={() => void recordConsent(true)}>
              They said yes
            </button>
          </div>
        ) : (
          <button type="button" className="btn small plain" onClick={() => void recordConsent(false)}>
            Undo
          </button>
        )}
      </section>

      {photos.length < 2 ? (
        <p className="notice">
          You need at least two daily log photos on this job: one from the start and one from the end.
        </p>
      ) : (
        <>
          <PhotoPicker label="Before" photos={photos} urls={photoUrls} value={beforeId} onChange={setBeforeId} />
          <PhotoPicker label="After" photos={photos} urls={photoUrls} value={afterId} onChange={setAfterId} />
          <label className="field">
            <span>Caption</span>
            <textarea rows={3} maxLength={500} value={caption} onChange={(e) => setCaption(e.target.value)} />
            <span className="hint">No street address. A town or area is fine.</span>
          </label>
          <ErrorNote message={error} />
          <button type="button" className="btn primary" disabled={!consented || busy} onClick={() => void make()}>
            {busy ? 'Making the image…' : consented ? 'Make the image' : 'Waiting on the client’s OK'}
          </button>
          {image && (
            <div className="stack">
              <img src={image.url} alt="Before and after" className="post-preview" />
              {typeof navigator.canShare === 'function' && (
                <button type="button" className="btn primary" onClick={() => void share()}>
                  Share
                </button>
              )}
              <a href={image.url} download="before-after.jpg" className="btn secondary">
                Save image
              </a>
              <button
                type="button"
                className="btn plain"
                onClick={async () => {
                  setCopied(await copyText(caption));
                  setTimeout(() => setCopied(false), 2500);
                }}
              >
                {copied ? 'Caption copied' : 'Copy caption'}
              </button>
            </div>
          )}
        </>
      )}
    </Page>
  );
}

function PhotoPicker({
  label,
  photos,
  urls,
  value,
  onChange,
}: {
  label: string;
  photos: { id: string; storage_path: string; created_at: string }[];
  urls: Record<string, string>;
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset className="field chips-field">
      <legend>{label}</legend>
      <div className="photo-strip">
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`strip-photo ${value === p.id ? 'picked' : ''}`}
            aria-pressed={value === p.id}
            aria-label={`${label}: photo from ${formatWhen(p.created_at)}`}
            onClick={() => onChange(p.id)}
          >
            {urls[p.storage_path] ? <img src={urls[p.storage_path]} alt="" loading="lazy" /> : <span>Photo</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

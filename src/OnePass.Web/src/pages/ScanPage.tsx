import { useEffect, useRef, useState, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import QrScanner from 'qr-scanner';
import { api, Activity } from '../api';
import { scanOrQueue, pendingCount, flushQueue } from '../scanQueue';

/**
 * Extracts the participant ID from a scanned QR code payload.
 * Supports raw IDs and URLs containing a `badgeId` query parameter, e.g.:
 *   https://events.techconnect.microsoft.com/badgeScan?badgeId=1764970920345001Tamq&data=...
 */
export function extractBadgeId(raw: string): string {
  const text = raw.trim();
  if (!text) return '';
  // Try parsing as URL first
  try {
    const url = new URL(text);
    const badgeId = url.searchParams.get('badgeId');
    if (badgeId) return badgeId.trim();
  } catch {
    // not a URL, fall through
  }
  // Fallback: regex match for badgeId=... in any string
  const m = text.match(/[?&]badgeId=([^&\s]+)/i);
  if (m) return decodeURIComponent(m[1]);
  return text;
}

export default function ScanPage() {
  const { t } = useTranslation();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityId, setActivityId] = useState('');
  const [participantId, setParticipantId] = useState('');
  const [message, setMessage] = useState<{ type: 'success' | 'info' | 'warning' | 'error'; text: string } | null>(null);
  const [queued, setQueued] = useState(pendingCount());
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);

  useEffect(() => {
    api.listActivities().then(list => {
      setActivities(list);
      if (list[0]) setActivityId(list[0].id);
    });
    const h = () => setQueued(pendingCount());
    const onlineHandler = async () => { await flushQueue(); setQueued(pendingCount()); };
    window.addEventListener('online', onlineHandler);
    window.addEventListener('storage', h);
    return () => {
      window.removeEventListener('online', onlineHandler);
      window.removeEventListener('storage', h);
      scannerRef.current?.stop();
      scannerRef.current?.destroy();
      scannerRef.current = null;
    };
  }, []);

  // Auto-submit a scan once we have an activity + participant ID
  async function submitScan(pid: string) {
    if (!activityId || !pid) return;
    const badgeId = extractBadgeId(pid);
    try {
      const res = await scanOrQueue(activityId, badgeId);
      setMessage({
        type: res === 'sent' ? 'success' : 'info',
        text: res === 'sent' ? t('scan.success') : t('scan.offlineQueued'),
      });
      setParticipantId('');
      setQueued(pendingCount());
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'duplicate') {
        setMessage({ type: 'warning', text: t('scan.duplicate') });
        setParticipantId('');
        return;
      }
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('common.error') });
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await submitScan(participantId);
  }

  async function startCamera() {
    if (!videoRef.current) return;
    try {
      const scanner = new QrScanner(
        videoRef.current,
        async (result) => {
          const badgeId = extractBadgeId(result.data);
          setParticipantId(badgeId);
          await stopCamera();
          await submitScan(badgeId);
        },
        { highlightScanRegion: true, highlightCodeOutline: true, preferredCamera: 'environment' },
      );
      scannerRef.current = scanner;
      await scanner.start();
      setCameraOn(true);
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof Error ? err.message : t('scan.cameraError') });
      setCameraOn(false);
    }
  }

  async function stopCamera() {
    scannerRef.current?.stop();
    scannerRef.current?.destroy();
    scannerRef.current = null;
    setCameraOn(false);
  }

  return (
    <>
      <h1>{t('scan.title')}</h1>
      {message && <div className={`alert ${message.type}`}>{message.text}</div>}
      {queued > 0 && <div className="alert info">{t('scan.queued', { count: queued })}</div>}

      <form className="card" onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="act">{t('scan.chooseActivity')}</label>
          <select id="act" value={activityId} onChange={e => setActivityId(e.target.value)}>
            {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pid">{t('scan.participantId')}</label>
          <input id="pid" value={participantId} onChange={e => setParticipantId(e.target.value)} required autoFocus />
        </div>
        <div className="row" style={{ gap: '0.5rem' }}>
          <button type="submit">{t('scan.submit')}</button>
          {!cameraOn ? (
            <button type="button" onClick={startCamera}>
              {t('scan.openCamera')}
            </button>
          ) : (
            <button type="button" className="danger" onClick={stopCamera}>
              {t('scan.closeCamera')}
            </button>
          )}
        </div>
      </form>

      <div className="card" style={{ display: cameraOn ? 'block' : 'none' }}>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>{t('scan.cameraHint')}</p>
        <video ref={videoRef} style={{ width: '100%', maxWidth: 480, borderRadius: 8 }} muted playsInline />
      </div>
    </>
  );
}

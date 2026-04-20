import { useEffect, useMemo, useRef, useState, useCallback, FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import QrScanner from 'qr-scanner';
import { api, Activity, Participant } from '../api';
import { scanOrQueue, pendingCount, flushQueue } from '../scanQueue';
import { PageHeader } from '../components/PageShell';
import { ParticipantsTable } from '../components/ParticipantsTable';

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
  const [message, setMessage] = useState<{
    type: 'success' | 'info' | 'warning' | 'error';
    text: string;
    details?: { badgeId: string; activityName: string; scannedAt: string };
  } | null>(null);
  const [queued, setQueued] = useState(pendingCount());
  const [cameraOn, setCameraOn] = useState(false);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [scanTimes, setScanTimes] = useState<Record<string, string>>({});
  const [loadingParticipants, setLoadingParticipants] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);

  useEffect(() => {
    (async () => {
      const [list, me] = await Promise.all([api.listActivities(), api.me().catch(() => null)]);
      // If the user has an explicit allowed list, restrict choices to it.
      const allowed = me?.allowedActivityIds && me.allowedActivityIds.length > 0
        ? new Set(me.allowedActivityIds)
        : null;
      const visible = allowed ? list.filter(a => allowed.has(a.id)) : list;
      setActivities(visible);
      // User default takes priority over the admin/global default.
      const userDefault = me?.defaultActivityId && visible.find(a => a.id === me.defaultActivityId);
      const adminDefault = visible.find(a => a.isDefault);
      const initial = userDefault ?? adminDefault ?? visible[0];
      if (initial) setActivityId(initial.id);
    })();
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

  // Load participants + scan times when the selected activity changes
  const loadParticipants = useCallback(async (aid: string) => {
    if (!aid) { setParticipants([]); setScanTimes({}); return; }
    setLoadingParticipants(true);
    try {
      const [p, scans] = await Promise.all([api.listParticipants(aid), api.listScans(aid)]);
      setParticipants(p);
      const times: Record<string, string> = {};
      for (const s of scans) {
        if (!times[s.participantId] || s.scannedAt > times[s.participantId]) {
          times[s.participantId] = s.scannedAt;
        }
      }
      setScanTimes(times);
    } catch {
      setParticipants([]);
      setScanTimes({});
    } finally {
      setLoadingParticipants(false);
    }
  }, []);

  useEffect(() => {
    if (activityId) loadParticipants(activityId);
  }, [activityId, loadParticipants]);

  const activityNames = useMemo(() => {
    const map: Record<string, string> = {};
    for (const a of activities) map[a.id] = a.name;
    return map;
  }, [activities]);

  // Auto-submit a scan once we have an activity + participant ID
  async function submitScan(pid: string) {
    if (!activityId || !pid) return;
    const badgeId = extractBadgeId(pid);
    try {
      const res = await scanOrQueue(activityId, badgeId);
      if (res.status === 'sent') {
        const activityName = activities.find(a => a.id === activityId)?.name ?? activityId;
        setMessage({
          type: 'success',
          text: t('scan.success'),
          details: {
            badgeId,
            activityName,
            scannedAt: res.scan.scannedAt,
          },
        });
      } else {
        setMessage({ type: 'info', text: t('scan.offlineQueued') });
      }
      setParticipantId('');
      setQueued(pendingCount());
      // Refresh participants table to show updated scan times
      loadParticipants(activityId);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'duplicate') {
        const prev = (err as { previousScannedAt?: string }).previousScannedAt;
        const text = prev
          ? t('scan.duplicateAt', { when: new Date(prev).toLocaleString() })
          : t('scan.duplicate');
        setMessage({ type: 'warning', text });
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
      <PageHeader title={t('scan.title')} />
      {message && (
        <div className={`alert ${message.type}`} role={message.type === 'error' || message.type === 'warning' ? 'alert' : 'status'}>
          <div className="alert-row">
            <span className="alert-icon" aria-hidden="true">
              {message.type === 'success' && '✅'}
              {message.type === 'warning' && '⚠️'}
              {message.type === 'error' && '⛔'}
              {message.type === 'info' && 'ℹ️'}
            </span>
            <span>{message.text}</span>
          </div>
          {message.details && (
            <dl className="scan-details">
              <dt>{t('scan.detailsBadgeId')}</dt>
              <dd><code>{message.details.badgeId}</code></dd>
              <dt>{t('scan.detailsActivity')}</dt>
              <dd>{message.details.activityName}</dd>
              <dt>{t('scan.detailsScannedAt')}</dt>
              <dd>{new Date(message.details.scannedAt).toLocaleString()}</dd>
            </dl>
          )}
        </div>
      )}
      {queued > 0 && <div className="alert info">{t('scan.queued', { count: queued })}</div>}

      <form className="card" onSubmit={onSubmit}>
        <div className="scan-actions">
          {!cameraOn ? (
            <button type="button" className="scan-action-btn" onClick={startCamera} title={t('scan.openCamera')} aria-label={t('scan.openCamera')}>
              <span className="scan-action-icon" aria-hidden="true">📷</span>
              <span className="scan-action-label">{t('scan.openCamera')}</span>
            </button>
          ) : (
            <button type="button" className="scan-action-btn danger" onClick={stopCamera} title={t('scan.closeCamera')} aria-label={t('scan.closeCamera')}>
              <span className="scan-action-icon" aria-hidden="true">✖</span>
              <span className="scan-action-label">{t('scan.closeCamera')}</span>
            </button>
          )}
          <button type="submit" className="scan-action-btn" title={t('scan.submit')} aria-label={t('scan.submit')}>
            <span className="scan-action-icon" aria-hidden="true">✓</span>
            <span className="scan-action-label">{t('scan.submit')}</span>
          </button>
        </div>
        <div className="field">
          <label htmlFor="act">{t('scan.chooseActivity')}</label>
          <select id="act" value={activityId} onChange={e => { setActivityId(e.target.value); setMessage(null); }}>
            {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="pid">{t('scan.participantId')}</label>
          <input id="pid" value={participantId} onChange={e => setParticipantId(e.target.value)} required autoFocus />
        </div>
      </form>

      <div className="card" style={{ display: cameraOn ? 'block' : 'none' }}>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>{t('scan.cameraHint')}</p>
        <video ref={videoRef} style={{ width: '100%', maxWidth: 480, borderRadius: 8 }} muted playsInline />
      </div>

      {activityId && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
            <h2 style={{ margin: 0 }}>{t('activity.participants')}</h2>
            <select
              value={activityId}
              onChange={e => { setActivityId(e.target.value); setMessage(null); }}
              aria-label={t('scan.chooseActivity') as string}
            >
              {activities.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          {loadingParticipants ? (
            <p style={{ color: 'var(--muted)' }}>{t('common.loading', 'Loading…')}</p>
          ) : (
            <ParticipantsTable
              participants={participants}
              canDelete={true}
              onDelete={async (p) => {
                await api.deleteParticipant(activityId, p.id);
                setParticipants(prev => prev.filter(x => x.id !== p.id));
              }}
              scanTimes={scanTimes}
              activityNames={activityNames}
            />
          )}
        </div>
      )}
    </>
  );
}

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Participant } from '../api';

/**
 * Re-usable participants table with:
 *  - global search across name / email / id
 *  - per-column text filters in the second header row
 *  - sortable columns (click the header to toggle asc / desc)
 *  - page size selector (20 / 100 / 200) + simple pager
 *  - optional admin-only delete button per row
 *
 * Designed for activities with up to a few thousand participants. Sorting
 * and filtering happen entirely on the client; the API still returns the
 * full list so we can keep using it offline-friendly.
 */

export type SortDir = 'asc' | 'desc';
export type SortKey = 'displayName' | 'email' | 'id' | 'lastScannedAt';

interface ParticipantsTableProps {
  participants: Participant[];
  canDelete: boolean;
  onDelete?: (participant: Participant) => void | Promise<void>;
  /** Optional callback when a participant row is clicked (e.g. to scan). */
  onSelect?: (participant: Participant) => void | Promise<void>;
  /** Map from participant id to their most recent scannedAt ISO string. */
  scanTimes?: Record<string, string>;
  /** When provided, replaces the email column with an activity-name column. */
  activityNames?: Record<string, string>;
  /** Map from participant id to the userId who scanned them most recently. */
  scannedByUsers?: Record<string, string>;
}

const PAGE_SIZES = [20, 100, 200] as const;
type PageSize = typeof PAGE_SIZES[number];

export function ParticipantsTable({ participants, canDelete, onDelete, onSelect, scanTimes, activityNames, scannedByUsers }: ParticipantsTableProps) {
  const { t } = useTranslation();

  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<{ displayName: string; email: string; id: string }>({
    displayName: '',
    email: '',
    id: '',
  });
  const [sortKey, setSortKey] = useState<SortKey>('displayName');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [pageSize, setPageSize] = useState<PageSize>(20);
  const [page, setPage] = useState(1);

  // Reset to first page whenever the underlying filter/sort/page size
  // changes — keeps the user from staring at an empty page after they
  // narrow the result set.
  const resetPage = () => setPage(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const fName = filters.displayName.trim().toLowerCase();
    const fEmail = filters.email.trim().toLowerCase();
    const fId = filters.id.trim().toLowerCase();

    return participants.filter(p => {
      if (q) {
        const haystack = activityNames
          ? `${p.displayName} ${activityNames[p.activityId] ?? ''} ${p.id}`.toLowerCase()
          : `${p.displayName} ${p.email ?? ''} ${p.id}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (fName && !p.displayName.toLowerCase().includes(fName)) return false;
      if (fEmail) {
        if (activityNames) {
          if (!(activityNames[p.activityId] ?? '').toLowerCase().includes(fEmail)) return false;
        } else {
          if (!(p.email ?? '').toLowerCase().includes(fEmail)) return false;
        }
      }
      if (fId && !p.id.toLowerCase().includes(fId)) return false;
      return true;
    });
  }, [participants, search, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    arr.sort((a, b) => {
      const va = sortKey === 'lastScannedAt' ? (scanTimes?.[a.id] ?? '')
        : sortKey === 'email' && activityNames ? (activityNames[a.activityId] ?? '').toLowerCase()
        : (a[sortKey] ?? '').toString().toLowerCase();
      const vb = sortKey === 'lastScannedAt' ? (scanTimes?.[b.id] ?? '')
        : sortKey === 'email' && activityNames ? (activityNames[b.activityId] ?? '').toLowerCase()
        : (b[sortKey] ?? '').toString().toLowerCase();
      if (va < vb) return -1 * dir;
      if (va > vb) return 1 * dir;
      return 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageStart = (safePage - 1) * pageSize;
  const pageRows = sorted.slice(pageStart, pageStart + pageSize);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
    resetPage();
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return <span className="sort-indicator" aria-hidden="true">↕</span>;
    return <span className="sort-indicator active" aria-hidden="true">{sortDir === 'asc' ? '▲' : '▼'}</span>;
  }

  function ariaSort(key: SortKey): 'ascending' | 'descending' | 'none' {
    if (sortKey !== key) return 'none';
    return sortDir === 'asc' ? 'ascending' : 'descending';
  }

  return (
    <div className="participants-table">
      <div className="participants-toolbar">
        <input
          type="search"
          placeholder={t('participants.searchPlaceholder') as string}
          aria-label={t('participants.searchPlaceholder') as string}
          value={search}
          onChange={e => { setSearch(e.target.value); resetPage(); }}
          className="participants-search"
        />
        <label className="participants-pagesize">
          {t('participants.pageSize')}
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value) as PageSize); resetPage(); }}
            aria-label={t('participants.pageSize') as string}
          >
            {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <span className="participants-count">
          {t('participants.countLabel', {
            shown: pageRows.length,
            filtered: sorted.length,
            total: participants.length,
          })}
        </span>
      </div>

      <table>
        <thead>
          <tr>
            <th
              role="columnheader"
              aria-sort={ariaSort('displayName')}
              onClick={() => toggleSort('displayName')}
              className="sortable"
            >
              {t('activity.displayName')} {sortIndicator('displayName')}
            </th>
            <th
              role="columnheader"
              aria-sort={ariaSort('id')}
              onClick={() => toggleSort('id')}
              className="sortable"
            >
              ID {sortIndicator('id')}
            </th>
            <th
              role="columnheader"
              aria-sort={ariaSort('email')}
              onClick={() => toggleSort('email')}
              className="sortable"
            >
              {activityNames ? t('participants.activity', 'Activity') : t('activity.email')} {sortIndicator('email')}
            </th>
            {scanTimes && (
              <th
                role="columnheader"
                aria-sort={ariaSort('lastScannedAt')}
                onClick={() => toggleSort('lastScannedAt')}
                className="sortable"
              >
                {t('participants.lastScanned', 'Last scanned')} {sortIndicator('lastScannedAt')}
              </th>
            )}
            {scannedByUsers && (
              <th role="columnheader">
                {t('participants.scannedBy', 'User')}
              </th>
            )}
            {onSelect && <th />}
            {canDelete && <th aria-label={t('participants.actions') as string} />}
          </tr>
          <tr className="filter-row">
            <th>
              <input
                type="text"
                value={filters.displayName}
                onChange={e => { setFilters(f => ({ ...f, displayName: e.target.value })); resetPage(); }}
                placeholder={t('participants.filterPlaceholder') as string}
                aria-label={`${t('activity.displayName')} ${t('participants.filterPlaceholder')}`}
              />
            </th>
            <th>
              <input
                type="text"
                value={filters.id}
                onChange={e => { setFilters(f => ({ ...f, id: e.target.value })); resetPage(); }}
                placeholder={t('participants.filterPlaceholder') as string}
                aria-label={`ID ${t('participants.filterPlaceholder')}`}
              />
            </th>
            <th>
              <input
                type="text"
                value={filters.email}
                onChange={e => { setFilters(f => ({ ...f, email: e.target.value })); resetPage(); }}
                placeholder={t('participants.filterPlaceholder') as string}
                aria-label={`${activityNames ? t('participants.activity', 'Activity') : t('activity.email')} ${t('participants.filterPlaceholder')}`}
              />
            </th>
            {scanTimes && <th />}
            {scannedByUsers && <th />}
            {onSelect && <th />}
            {canDelete && <th />}
          </tr>
        </thead>
        <tbody>
          {pageRows.map(p => (
            <tr key={p.id}>
              <td>{p.displayName}</td>
              <td><code>{p.id}</code></td>
              <td>{activityNames ? (activityNames[p.activityId] ?? p.activityId) : p.email}</td>
              {scanTimes && (
                <td>{scanTimes[p.id] ? new Date(scanTimes[p.id]).toLocaleString() : '—'}</td>
              )}
              {scannedByUsers && (
                <td>{scannedByUsers[p.id] ?? '—'}</td>
              )}
              {onSelect && (
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => onSelect(p)}
                    title={t('scan.submit') as string}
                  >
                    {t('scan.scanBtn', 'Scan')}
                  </button>
                </td>
              )}
              {canDelete && (
                <td style={{ textAlign: 'right' }}>
                  <button
                    type="button"
                    className="danger"
                    onClick={async () => {
                      if (!onDelete) return;
                      if (!window.confirm(t('participants.deleteConfirm', { name: p.displayName }))) return;
                      await onDelete(p);
                    }}
                    title={t('participants.delete') as string}
                  >
                    {t('participants.delete')}
                  </button>
                </td>
              )}
            </tr>
          ))}
          {pageRows.length === 0 && (
            <tr>
              <td colSpan={(scanTimes ? 4 : 3) + (onSelect ? 1 : 0) + (canDelete ? 1 : 0)} style={{ color: 'var(--muted)' }}>
                {t('participants.noResults')}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {totalPages > 1 && (
        <div className="participants-pager">
          <button type="button" disabled={safePage <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
            ‹ {t('participants.previous')}
          </button>
          <span>
            {t('participants.pageOf', { page: safePage, total: totalPages })}
          </span>
          <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>
            {t('participants.next')} ›
          </button>
        </div>
      )}
    </div>
  );
}

import { ReactElement, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// Inline SVG flags so they render consistently on every OS (Windows hides flag emojis).
function FlagGB({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 0.6);
  return (
    <svg width={size} height={h} viewBox="0 0 60 36" aria-hidden="true">
      <clipPath id="gb-c"><rect width="60" height="36" /></clipPath>
      <g clipPath="url(#gb-c)">
        <rect width="60" height="36" fill="#012169" />
        <path d="M0 0 L60 36 M60 0 L0 36" stroke="#fff" strokeWidth="6" />
        <path d="M0 0 L60 36 M60 0 L0 36" stroke="#C8102E" strokeWidth="3" />
        <path d="M30 0 V36 M0 18 H60" stroke="#fff" strokeWidth="10" />
        <path d="M30 0 V36 M0 18 H60" stroke="#C8102E" strokeWidth="6" />
      </g>
    </svg>
  );
}

function FlagFR({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 0.6);
  return (
    <svg width={size} height={h} viewBox="0 0 3 2" aria-hidden="true">
      <rect width="1" height="2" x="0" fill="#0055A4" />
      <rect width="1" height="2" x="1" fill="#fff" />
      <rect width="1" height="2" x="2" fill="#EF4135" />
    </svg>
  );
}

function FlagES({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 0.6);
  return (
    <svg width={size} height={h} viewBox="0 0 3 2" aria-hidden="true">
      <rect width="3" height="2" fill="#AA151B" />
      <rect width="3" height="1" y="0.5" fill="#F1BF00" />
    </svg>
  );
}

function FlagDE({ size = 20 }: { size?: number }) {
  const h = Math.round(size * 0.6);
  return (
    <svg width={size} height={h} viewBox="0 0 5 3" aria-hidden="true">
      <rect width="5" height="1" y="0" fill="#000" />
      <rect width="5" height="1" y="1" fill="#DD0000" />
      <rect width="5" height="1" y="2" fill="#FFCE00" />
    </svg>
  );
}

const LANGS: { code: string; label: string; Flag: (p: { size?: number }) => ReactElement }[] = [
  { code: 'en', label: 'English', Flag: FlagGB },
  { code: 'fr', label: 'Français', Flag: FlagFR },
  { code: 'es', label: 'Español', Flag: FlagES },
  { code: 'de', label: 'Deutsch', Flag: FlagDE },
];

export function LanguageSelect() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const current = LANGS.find(l => l.code === i18n.resolvedLanguage) ?? LANGS[0];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function pick(code: string) {
    i18n.changeLanguage(code);
    setOpen(false);
  }

  return (
    <div className="lang-select" ref={ref}>
      <button
        type="button"
        className="lang-select-trigger"
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('app.language')}
        title={current.label}
      >
        <current.Flag />
        <span className="lang-select-caret" aria-hidden="true">▾</span>
      </button>
      {open && (
        <ul className="lang-select-menu" role="listbox" aria-label={t('app.language')}>
          {LANGS.map(l => (
            <li key={l.code}>
              <button
                type="button"
                role="option"
                aria-selected={l.code === current.code}
                className={`lang-select-option${l.code === current.code ? ' active' : ''}`}
                onClick={() => pick(l.code)}
              >
                <l.Flag />
                <span>{l.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

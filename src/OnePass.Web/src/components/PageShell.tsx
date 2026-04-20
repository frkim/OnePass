interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div className="page-header-text">
        <h1>{title}</h1>
        {description && <p className="page-header-desc">{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, message }: { icon?: string; message: string }) {
  return (
    <div className="empty-state">
      {icon && <span className="empty-state-icon">{icon}</span>}
      <p>{message}</p>
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" aria-label="Loading" />;
}

interface StatusBadgeProps {
  status: string;
  variant?: 'success' | 'danger' | 'muted' | 'info';
}

export function StatusBadge({ status, variant = 'muted' }: StatusBadgeProps) {
  return <span className={`status-badge status-badge-${variant}`}>{status}</span>;
}

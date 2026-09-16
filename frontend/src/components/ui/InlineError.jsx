import Icon from '@mdi/react';
import { mdiAlertCircleOutline } from '@mdi/js';

const InlineError = ({ children, className = '' }) => {
  if (!children) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`flex items-start gap-1.5 text-left text-sm text-status-danger ${className}`}
    >
      <Icon path={mdiAlertCircleOutline} size={0.7} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </div>
  );
};

export default InlineError;

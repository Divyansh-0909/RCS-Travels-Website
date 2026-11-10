import { LoaderCircle, CircleAlert, Check } from './icons';

export function Feedback({ kind = 'success', children, action }) {
  const Icon = kind === 'loading' ? LoaderCircle : kind === 'error' ? CircleAlert : Check;
  return <div className="review-feedback" data-feedback={kind} role={kind === 'error' ? 'alert' : 'status'} aria-live={kind === 'error' ? 'assertive' : 'polite'}><Icon size={16} className={kind === 'loading' ? 'icon-spin' : ''} /><span>{children}</span>{action}</div>;
}

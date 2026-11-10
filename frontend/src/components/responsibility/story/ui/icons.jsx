import { forwardRef } from 'react';
import {
  mdiArrowLeft, mdiArrowRight, mdiArrowDown, mdiSwapVertical, mdiChevronDown,
  mdiChevronUp, mdiChevronRight, mdiContentCopy, mdiFilterVariant, mdiMagnify,
  mdiClose, mdiWeatherSunny, mdiWeatherNight, mdiOpenInNew, mdiFileDocument,
  mdiAlertOutline, mdiAlertCircleOutline, mdiRefresh, mdiCheck, mdiMinus, mdiDotsHorizontal, mdiHistory, mdiRobotOutline,
  mdiCalendarMonthOutline, mdiMessageTextOutline, mdiCar, mdiAccount,
  mdiAccountGroup, mdiClockOutline, mdiProgressClock, mdiHelpCircleOutline,
  mdiEarth, mdiContentSaveOutline, mdiClipboardCheckOutline, mdiRestore,
  mdiInboxOutline, mdiMagnifyClose, mdiLoading, mdiCircleOutline,
} from '@mdi/js';

// Official Pictogrammers MDI 7.4.47 paths. The compatibility exports also replace
// icons inside the shared shadcn primitives on the Responsibility review page.
/**
 * @param {string} name
 * @param {string} path
 * @returns {import('react').ForwardRefExoticComponent<import('react').SVGProps<SVGSVGElement> & {size?: number | string, absoluteStrokeWidth?: boolean} & import('react').RefAttributes<SVGSVGElement>>}
 */
function icon(name, path) {
  // Consume legacy outline-width props so they never reach a filled MDI SVG.
  // eslint-disable-next-line no-unused-vars
  const Component = forwardRef(function MdiIcon({ size = 24, color = 'currentColor', strokeWidth, absoluteStrokeWidth, className = '', children, ...props }, ref) {
    return <svg ref={ref} xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} fill={color} stroke="none" aria-hidden="true" focusable="false" className={`mdi-icon ${className}`} data-icon-source="mdi" data-mdi={name} {...props}><path d={path} />{children}</svg>;
  });
  Component.displayName = `MDI(${name})`;
  return Component;
}

export const ArrowLeft = icon('arrow-left', mdiArrowLeft);
export const ArrowRight = icon('arrow-right', mdiArrowRight);
export const ArrowDown = icon('arrow-down', mdiArrowDown);
export const ArrowUpDown = icon('swap-vertical', mdiSwapVertical);
export const ChevronDown = icon('chevron-down', mdiChevronDown);
export const ChevronUp = icon('chevron-up', mdiChevronUp);
export const ChevronRight = icon('chevron-right', mdiChevronRight);
export const Copy = icon('content-copy', mdiContentCopy);
export const ListFilter = icon('filter-variant', mdiFilterVariant);
export const Search = icon('magnify', mdiMagnify);
export const X = icon('close', mdiClose);
export const Sun = icon('weather-sunny', mdiWeatherSunny);
export const Moon = icon('weather-night', mdiWeatherNight);
export const ExternalLink = icon('open-in-new', mdiOpenInNew);
export const FileText = icon('file-document', mdiFileDocument);
export const TriangleAlert = icon('alert-outline', mdiAlertOutline);
export const CircleAlert = icon('alert-circle-outline', mdiAlertCircleOutline);
export const Check = icon('check', mdiCheck);
export const Minus = icon('minus', mdiMinus);
export const MoreHorizontal = icon('dots-horizontal', mdiDotsHorizontal);
export const History = icon('history', mdiHistory);
export const Bot = icon('robot-outline', mdiRobotOutline);
export const CalendarDays = icon('calendar-month-outline', mdiCalendarMonthOutline);
export const MessageSquareText = icon('message-text-outline', mdiMessageTextOutline);
export const CarFront = icon('car', mdiCar);
export const UserRound = icon('account', mdiAccount);
export const Users = icon('account-group', mdiAccountGroup);
export const Clock3 = icon('clock-outline', mdiClockOutline);
export const CircleDot = icon('progress-clock', mdiProgressClock);
export const CircleHelp = icon('help-circle-outline', mdiHelpCircleOutline);
export const Globe = icon('earth', mdiEarth);
export const Save = icon('content-save-outline', mdiContentSaveOutline);
export const ClipboardCheck = icon('clipboard-check-outline', mdiClipboardCheckOutline);
export const RotateCcw = icon('restore', mdiRestore);
export const RefreshCw = icon('refresh', mdiRefresh);
export const Inbox = icon('inbox-outline', mdiInboxOutline);
export const SearchX = icon('magnify-close', mdiMagnifyClose);
export const LoaderCircle = icon('loading', mdiLoading);
export const ChevronRightIcon = ChevronRight, ChevronDownIcon = ChevronDown, ChevronUpIcon = ChevronUp;
export const CheckIcon = Check, MinusIcon = Minus, XIcon = X;

export function SourceIcon({ by, monochrome = false, ...props }) {
  const Icon = by === 'Driver' ? CarFront : by === 'Rider' ? UserRound : FileText;
  const tone = monochrome ? 'currentColor' : by === 'Driver' ? 'var(--status-info)' : by === 'Rider' ? 'var(--status-success)' : by === 'Booking record' ? 'var(--status-warning)' : 'var(--ink-muted)';
  return <Icon size={16} {...props} style={{ color: tone, ...props.style }} />;
}
export function CaseStatusIcon({ status, ...props }) {
  const Icon = status === 'In review' ? CircleDot : status === 'Waiting for details' ? CircleHelp : Clock3;
  return <Icon size={14} {...props} />;
}

export const Circle = icon("circle-outline", mdiCircleOutline);

import {Link} from 'react-router-dom';
import { ArrowLeft, Moon, RefreshCw, Sun, LoaderCircle } from './ui/icons';
import { Button } from '@/components/responsibility/ui/button';
import { CaseSearch, CaseFilters } from './CaseBrowser';
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList } from './ui/breadcrumb';

// Keep the compact control sizes from the approved Responsibility review design.
export const ORIGINAL_CASE_INPUT = 'relative h-auto min-h-9 bg-surface py-[7px] pl-[2.125rem] pr-11 text-base leading-5 sm:text-sm';
export const ORIGINAL_REFRESH_ACTION = "relative min-h-9 min-w-11 shrink-0 gap-1.5 px-3 py-[7px] text-sm leading-5 before:absolute before:inset-x-0 before:-inset-y-[5px] before:content-['']";
export const ORIGINAL_SAVE_ACTION = "relative min-h-9 w-fit max-w-full self-end gap-1.5 px-3 py-2 text-sm leading-5 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] sm:shrink-0 sm:self-center";
// Return to the existing protected admin dashboard.
const DASHBOARD_PATH = '/dashboard';

export function ReviewTopBar({ theme, setTheme }) {
  return <header className="review-topbar" data-testid="original-topbar">
    <Breadcrumb aria-label="Breadcrumb">
      <BreadcrumbList>
        <BreadcrumbItem><BreadcrumbLink render={<Link to={DASHBOARD_PATH} />} className="review-dashboard-link" aria-label="Back to admin dashboard"><ArrowLeft aria-hidden="true" />Dashboard</BreadcrumbLink></BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
    <Button type="button" variant="outline" size="icon-sm" className="review-theme-toggle" aria-label="Dark mode" aria-pressed={theme === 'dark'} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}</Button>
  </header>;
}

export function CaseHeader({ input, setInput, cases, onSelect, clearCase, refreshCase, filters, onFilter, caseOpen, refreshing = false, searchLoading = false, searchError = false, onOpenId }) {
  return <div className="space-y-4" data-testid="original-case-header">
    <header><div className="min-w-0 space-y-2"><h1 className="text-3xl font-bold leading-tight sm:text-4xl">Responsibility review</h1><p className="max-w-2xl text-sm leading-6 text-ink-muted sm:text-base">Review the ride records, check the AI suggestion, then save your decision</p></div></header>
    <div className="case-toolbar" data-case-open={caseOpen}>
      <CaseSearch cases={cases} input={input} setInput={setInput} onSelect={onSelect} clearCase={clearCase} inputClassName={ORIGINAL_CASE_INPUT} loading={searchLoading} error={searchError} onOpenId={onOpenId} />
      {!caseOpen && <CaseFilters value={filters} onApply={onFilter} actionClassName={ORIGINAL_REFRESH_ACTION} />}
      <Button type="button" variant="outline" aria-label={refreshing ? 'Refreshing cases' : 'Refresh cases'} disabled={refreshing} aria-busy={refreshing} onClick={refreshCase} className={"case-refresh " + ORIGINAL_REFRESH_ACTION}>{refreshing ? <LoaderCircle className="icon-spin" /> : <RefreshCw />}<span className="hidden sm:inline">{refreshing ? 'Refreshing' : 'Refresh'}</span></Button>
    </div>
  </div>;
}

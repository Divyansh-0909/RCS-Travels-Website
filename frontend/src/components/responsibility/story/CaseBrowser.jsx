import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { cn } from '@/components/responsibility/utils';
import { ChevronRight, Copy, ListFilter, Search, X, RotateCcw, CalendarDays, Users, SourceIcon, CaseStatusIcon, LoaderCircle, Check, CircleAlert, SearchX, Inbox, RefreshCw } from './ui/icons';
import { Feedback } from './ui/feedback';
import { flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { Button, buttonVariants } from '@/components/responsibility/ui/button';
import { Badge } from '@/components/responsibility/ui/badge';
import { Label } from '@/components/responsibility/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/responsibility/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { Popover, PopoverTrigger, PopoverContent, PopoverHeader, PopoverTitle, PopoverDescription } from './ui/popover';
import { Combobox, ComboboxClear, ComboboxInput, ComboboxContent, ComboboxList, ComboboxItem, ComboboxEmpty } from './ui/case-combobox';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from './ui/table';

export const DEFAULT_FILTERS = { status: 'all', reporter: 'all', period: 'all' };
const dateFormat = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' });
const timeFormat = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
function StatusBadge({ status }) {
  return <Badge variant="secondary" className="case-status" data-case-status={status}><CaseStatusIcon status={status} className="size-3" />{status}</Badge>;
}

export function CaseSearch({ cases, input, setInput, onSelect, clearCase, inputClassName, loading = false, error = false, onOpenId }) {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState(null);
  return <Combobox items={cases} value={input ? selected : null} inputValue={input}
    onInputValueChange={setInput} onValueChange={item => { setSelected(item); if (item) { onSelect(item); setOpen(false); } }}
    itemToStringLabel={item => item.id} autoHighlight open={open && !!input.trim()} onOpenChange={setOpen}
    filter={null}>
    <div className="relative min-w-0">
      <Label htmlFor="responsibility-case-id" className="sr-only">Search cases</Label>
      <ComboboxInput id="responsibility-case-id" aria-label="Search cases" placeholder="Search case or booking ID" autoComplete="off" maxLength={200} onKeyDown={event => { if (event.key === "Enter" && !cases.length && !loading && !error && input.trim()) { event.preventDefault(); onOpenId?.(input.trim()); setOpen(false); } }} className={inputClassName} />
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
      {input && <ComboboxClear keepMounted type="button" aria-label="Clear search" onClick={() => { clearCase(); setOpen(false); }} className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'responsibility-input-action absolute right-0 top-1/2 size-11 -translate-y-1/2 opacity-80 hover:bg-transparent hover:text-inherit hover:opacity-100 dark:hover:bg-transparent' })}><X aria-hidden="true" /></ComboboxClear>}
    </div>
    <ComboboxContent><ComboboxEmpty><span className="option-label"><SearchX size={16} />{loading ? "Searching cases..." : error ? "Search is unavailable. Try refreshing." : "No matching open cases. Enter a full case ID to open it."}</span></ComboboxEmpty><ComboboxList>{item => <ComboboxItem key={item.id} value={item}>
      <span className="flex w-full items-center justify-between gap-3"><span className="font-medium">{item.id}</span><ChevronRight aria-hidden="true" size={14} /></span>
      <span className="text-xs text-ink-muted">{item.booking} · {item.status}</span>
    </ComboboxItem>}</ComboboxList></ComboboxContent>
  </Combobox>;
}

export function CaseFilters({ value, onApply, actionClassName }) {
  const [open, setOpen] = useState(false), [draft, setDraft] = useState(value);
  const count = Object.values(value).filter(item => item !== 'all').length;
  const fields = [
    ['status', 'Review status', [['all', 'All open cases'], ['Needs review', 'Needs review'], ['In review', 'In review'], ['Waiting for details', 'Waiting for details']]],
    ['reporter', 'Reported by', [['all', 'Anyone'], ['Driver', 'Driver'], ['Rider', 'Rider'], ['Booking record', 'Booking record']]],
    ['period', 'Opened', [['all', 'Any time'], ['today', 'Today'], ['week', 'Last 7 days'], ['month', 'Last 30 days']]],
  ];
  return <Popover open={open} onOpenChange={next => { if (next) setDraft(value); setOpen(next); }}>
    <PopoverTrigger data-slot="button" data-variant="outline" className={cn(buttonVariants({ variant: 'outline', className: actionClassName }))}><ListFilter aria-hidden="true" />Filter{count > 0 && <Badge variant="secondary">{count}</Badge>}</PopoverTrigger>
    <PopoverContent align="start" className="case-filter-popover gap-0 p-0">
      <div className="case-filter-body flex flex-col gap-4 p-2.5 pb-5">
      <PopoverHeader><PopoverTitle>Filter cases</PopoverTitle><PopoverDescription>Choose which open cases to show.</PopoverDescription></PopoverHeader>
      {fields.map(([key, label, options]) => <div key={key} className="grid gap-2"><Label htmlFor={'case-filter-' + key}>{label}</Label>
        <Select value={draft[key]} onValueChange={next => setDraft(previous => ({ ...previous, [key]: next }))}>
          <SelectTrigger id={'case-filter-' + key} size="sm" className="case-filter-select h-9 data-[size=sm]:min-h-9 px-3 py-2 text-sm *:data-[slot=select-value]:flex-1">{key === 'period' && <CalendarDays size={16} className="text-current" />}<SelectValue /></SelectTrigger>
          <SelectContent position="popper" className="responsibility-layer z-[180]">{options.map(([id, title]) => <SelectItem value={id} key={id}><span className="option-label">{key === 'status' && (id === 'all' ? <ListFilter size={16} className="text-current" /> : <CaseStatusIcon status={id} size={16} className="text-current" />)}{key === 'reporter' && (id === 'all' ? <Users size={16} className="text-current" /> : <SourceIcon by={id} monochrome className="text-current" />)}<span>{title}</span></span></SelectItem>)}</SelectContent>
        </Select>
      </div>)}
      </div>
      <div className="case-filter-footer flex justify-between gap-3 border-t border-border bg-surface-muted p-2.5"><Button variant="outline" className={actionClassName} style={{ backgroundColor: 'transparent' }} onClick={() => { setDraft(DEFAULT_FILTERS); onApply(DEFAULT_FILTERS); setOpen(false); }}><RotateCcw />Reset</Button><Button className={'primary-action ' + actionClassName} onClick={() => { onApply(draft); setOpen(false); }}>Apply filters</Button></div>
    </PopoverContent>
  </Popover>;
}

function CaseIdCopy({ id, onCopy }) {
  const [open, setOpen] = useState(false), tooltipId = useId();
  const [state, setState] = useState('idle'), timer = useRef(null), mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; clearTimeout(timer.current); }; }, []);
  function reportState(next) {
    if (!mounted.current) return;
    clearTimeout(timer.current); setState(next);
    if (next === 'success') timer.current = setTimeout(() => setState('idle'), 2000);
  }
  const Icon = state === 'loading' ? LoaderCircle : state === 'success' ? Check : state === 'error' ? CircleAlert : Copy;
  const tooltip = state === 'loading' ? 'Copying case ID' : state === 'success' ? 'Copied' : state === 'error' ? 'Copy failed. Try again' : 'Copy case ID';
  return <Tooltip open={open} onOpenChange={setOpen}>
    <TooltipTrigger render={props => <button {...props} disabled={state === 'loading'} />} type="button" aria-label={'Copy case ID ' + id} aria-describedby={open ? tooltipId : undefined} disabled={state === 'loading'} aria-busy={state === 'loading'} data-copy-state={state}
      className={cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), "relative before:absolute before:-inset-1.5 before:content-['']")}
      onClick={() => onCopy([id], reportState)}><Icon className={state === 'loading' ? 'icon-spin' : ''} /></TooltipTrigger>
    <TooltipContent id={tooltipId}>{tooltip}</TooltipContent>
  </Tooltip>;
}

export function OpenCasesTable({ cases, total, onSelect, onReset, actionClassName, footerRef, loading = false, error = false, onRetry, direction = "desc", onDirectionChange, pageIndex = 0, pageSize = 5, onPrevious, onNext, hasNext = false, filtered = false }) {
  const [copyNotice, setCopyNotice] = useState(null);
  const sorting = [{id:"opened",desc:direction === "desc"}];
  const sortRef = useRef({direction,onDirectionChange});
  useEffect(()=>{sortRef.current={direction,onDirectionChange};},[direction,onDirectionChange]);
  const lastCopy = useRef({ ids: [], reportState: null });
  // Keep cell component identities stable when the page changes input mode.
  const selectCase = useRef(onSelect);
  useEffect(()=>{selectCase.current=onSelect;},[onSelect]);
  const copyIds = useCallback(async (ids, reportState) => { lastCopy.current = { ids, reportState }; reportState?.('loading'); setCopyNotice({ kind: 'loading', text: 'Copying case IDs…' }); try { await navigator.clipboard.writeText(ids.join('\n')); reportState?.('success'); setCopyNotice({ kind: 'success', text: ids.length === 1 ? 'Case ID copied.' : `${ids.length} case IDs copied.` }); return true; } catch { reportState?.('error'); setCopyNotice({ kind: 'error', text: 'Copy failed. Please try again.' }); return false; } }, []);

  const columns = useMemo(() => [
    { accessorKey: 'id', header: 'Case', cell: ({ row }) => <button className="case-id-link" onClick={() => selectCase.current(row.original)} aria-label={'Review case ' + row.original.id}>{row.original.id}</button> },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { accessorKey: 'booking', header: 'Booking' },
    { accessorKey: 'reporter', header: 'Reported by', cell: ({ row }) => <span className="source-label"><SourceIcon by={row.original.reporter} monochrome />{row.original.reporter}</span> },
    { accessorKey: 'opened', header: () => <Button variant="ghost" className="table-sort-button" onClick={() => sortRef.current.onDirectionChange(sortRef.current.direction === "desc" ? "asc" : "desc")}>Opened</Button>, cell: ({ row }) => <time dateTime={row.original.opened} title={dateFormat.format(new Date(row.original.opened)) + ', ' + timeFormat.format(new Date(row.original.opened)).toUpperCase()}>{dateFormat.format(new Date(row.original.opened))}<span className="case-opened-time">{timeFormat.format(new Date(row.original.opened)).toUpperCase()}</span></time> },
    { id: 'actions', header: () => <span className="sr-only">Copy case ID</span>, cell: ({ row }) => <CaseIdCopy id={row.original.id} onCopy={copyIds} /> },
  ], [copyIds]);
  const tableCases = useMemo(() => loading || error ? [] : cases, [loading, error, cases]);
  // React Compiler is not enabled; this controlled TanStack table uses its normal React API.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({data:tableCases,columns,state:{sorting,pagination:{pageIndex,pageSize}},getRowId:row=>row.id,getCoreRowModel:getCoreRowModel(),manualSorting:true,manualPagination:true,pageCount:Math.max(1,Math.ceil(total/pageSize))});
  return <TooltipProvider><section className="open-cases" aria-label="Open responsibility cases">
    <div className="case-table-frame rounded-xl border border-border">
      <Table><TableCaption className="sr-only">Open responsibility cases. Select a case ID to review it. Dates and times are in India time.</TableCaption>
        <TableHeader>{table.getHeaderGroups().map(group => <TableRow key={group.id}>{group.headers.map(header => <TableHead key={header.id} data-column={header.column.id} aria-sort={header.column.getIsSorted() ? header.column.getIsSorted() === 'desc' ? 'descending' : 'ascending' : undefined}>{flexRender(header.column.columnDef.header, header.getContext())}</TableHead>)}</TableRow>)}</TableHeader>
        <TableBody>{loading || error || !cases.length ? <CaseTableEmpty loading={loading} error={error} total={total} filtered={filtered} actionClassName={actionClassName} onRetry={onRetry} onReset={onReset}/> : table.getRowModel().rows.map(row => <TableRow key={row.id}>{row.getVisibleCells().map(cell => <TableCell data-column={cell.column.id} key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>)}</TableRow>)}</TableBody>
      </Table>
    </div>
    <CasePagination footerRef={footerRef} loading={loading} error={error} cases={cases} total={total} pageIndex={pageIndex} pageSize={pageSize} pageCount={table.getPageCount()} actionClassName={actionClassName} onPrevious={onPrevious} onNext={onNext} hasNext={hasNext}/>
    {copyNotice && <Feedback kind={copyNotice.kind} action={copyNotice.kind === 'error' ? <Button variant="outline" className={actionClassName} onClick={() => copyIds(lastCopy.current.ids, lastCopy.current.reportState)}><RefreshCw />Retry</Button> : null}>{copyNotice.text}</Feedback>}
  </section></TooltipProvider>;
}

function CaseTableEmpty({loading,error,total,filtered,actionClassName,onRetry,onReset}){return (<TableRow><TableCell colSpan={6} className="h-40 text-center"><div className="case-empty-state">
          {loading ? <><LoaderCircle className="icon-spin" size={28} /><p className="font-medium" role="status">Loading cases…</p></> : error ? <><CircleAlert size={28} /><p className="font-medium" role="alert">Couldn’t load cases.</p><Button variant="outline" className={actionClassName} onClick={onRetry}><RefreshCw />Retry</Button></> : total === 0 && !filtered ? <><Inbox size={28} /><p className="font-medium">No open cases</p><p className="text-ink-muted">Cases needing a review will appear here.</p></> : <><SearchX size={28} /><p className="font-medium">No matching cases</p><p className="text-ink-muted">Try another search or reset the filters.</p><Button variant="outline" className={actionClassName} onClick={onReset}><RotateCcw />Clear search and filters</Button></>}
        </div></TableCell></TableRow>);}
function CasePagination({footerRef,loading,error,cases,total,pageIndex,pageSize,pageCount,actionClassName,onPrevious,onNext,hasNext}){return (    <div ref={footerRef} className="case-table-footer" role="group" aria-label="Case list pagination">
      <div className="chapter-actions-frame"><div className="chapter-actions-inner case-table-footer-content">
        <div className="flex flex-wrap items-center gap-3"><p>{loading ? 'Loading cases…' : error ? 'Cases unavailable' : <><span className="hidden sm:inline">{`${cases.length ? pageIndex * pageSize + 1 : 0}-${Math.min(pageIndex * pageSize + cases.length, total)} of `}</span>{total} open cases</>}</p></div>
        <div className="case-pagination-controls flex flex-wrap items-center gap-2"><span>Page {pageIndex + 1} of {Math.max(1, pageCount)}</span><Button variant="outline" className={actionClassName} onClick={onPrevious} disabled={loading || !!error || pageIndex === 0}>Previous</Button><Button className={'primary-action border-0 ' + actionClassName} onClick={onNext} disabled={loading || !!error || !hasNext}>Next</Button></div>
      </div></div>
    </div>);}

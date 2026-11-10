import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApi } from "../../hooks/useApi";
import { useTheme } from "../../context/ThemeContext";
import { useWebsiteCopy } from "../../hooks/useWebsiteCopy";
import { fieldClass } from "./fieldStyles";
import { PLACE_ADDRESS_LIMIT, validPlaceCoordinates } from "../../lib/savedPlaceValidation";

export default function SavedPlaceAddressField({ value, onChange, onResolve, onResolving, onCommit, onCancel, disabled, valid, placeholder, "aria-label": ariaLabel }) {
  const api = useApi(), tr = useWebsiteCopy(), { resolvedTheme } = useTheme();
  const input = useRef(null), popup = useRef(null), request = useRef(0), mounted = useRef(true), chosen = useRef(""), detailsPending = useRef(false);
  const id = useId(), listId = id + "-places";
  const [open, setOpen] = useState(false), [items, setItems] = useState([]), [loading, setLoading] = useState(false), [error, setError] = useState(""), [active, setActive] = useState(-1), [retry, setRetry] = useState(0), [position, setPosition] = useState(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current++; }; }, []);
  useEffect(() => {
    if (!open || disabled || value.trim().length < 3 || chosen.current === value) { setItems([]); if (!detailsPending.current) setLoading(false); return; }
    let current = true;
    setLoading(true); setError(""); setActive(-1);
    const timer = setTimeout(async () => {
      try {
        const response = await api.placesAutoComplete(value.trim());
        if (!current) return;
        if (response.error) throw new Error("lookup");
        setItems((response.suggestions || []).map(item => ({ id: item.placePrediction?.placeId, label: item.placePrediction?.text?.text })).filter(item => typeof item.id === "string" && typeof item.label === "string" && item.label.trim()).slice(0, 5));
      } catch { if (current) { setItems([]); setError(tr("Couldn't load places. Try again.")); } }
      finally { if (current) setLoading(false); }
    }, 300);
    return () => { current = false; clearTimeout(timer); };
  }, [value, open, disabled, retry, api, tr]);
  useLayoutEffect(() => {
    if (!open || disabled) return;
    const place = () => {
      const rect = input.current?.getBoundingClientRect(); if (!rect) return;
      const viewport = window.visualViewport, visibleTop = viewport?.offsetTop || 0, visibleLeft = viewport?.offsetLeft || 0, visibleHeight = viewport?.height || innerHeight, visibleWidth = viewport?.width || innerWidth;
      if (rect.bottom < visibleTop || rect.top > visibleTop + visibleHeight) { setOpen(false); return; }
      const width = Math.min(Math.max(rect.width, 280), visibleWidth - 24), below = visibleTop + visibleHeight - rect.bottom - 16, above = rect.top - visibleTop - 16;
      const upwards = below < 180 && above > below, maxHeight = Math.min(320, Math.max(100, upwards ? above : below));
      setPosition({ left: Math.max(visibleLeft + 12, Math.min(rect.left, visibleLeft + visibleWidth - width - 12)), width, maxHeight, ...(upwards ? { bottom: innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }) });
    };
    const outside = event => { if (!input.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false); };
    place(); window.addEventListener("resize", place); window.addEventListener("scroll", place, true); window.visualViewport?.addEventListener("resize", place); window.visualViewport?.addEventListener("scroll", place); document.addEventListener("pointerdown", outside);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); window.visualViewport?.removeEventListener("resize", place); window.visualViewport?.removeEventListener("scroll", place); document.removeEventListener("pointerdown", outside); };
  }, [open, disabled]);
  const blur = () => requestAnimationFrame(() => { if (document.activeElement !== input.current && !popup.current?.contains(document.activeElement)) setOpen(false); });
  function edit(text) {
    request.current++; chosen.current = ""; detailsPending.current = false; setItems([]); setError(""); setActive(-1); setOpen(true); onResolving(false); onResolve(null); onChange(text);
  }
  async function choose(item) {
    const token = ++request.current; chosen.current = item.label; detailsPending.current = true; onResolve(null); onChange(item.label); onResolving(true); setLoading(true); setError(""); setItems([]); setActive(-1);
    try {
      const details = await api.placeDetails(item.id);
      if (!mounted.current || token !== request.current) return;
      if (details.error || !validPlaceCoordinates(details)) throw new Error("details");
      onResolve({ lat: details.lat, lng: details.lng }); setOpen(false); input.current?.focus();
    } catch { if (mounted.current && token === request.current) { chosen.current = ""; setError(tr("Couldn't confirm that address. Choose another result.")); setOpen(true); } }
    finally { if (mounted.current && token === request.current) { detailsPending.current = false; setLoading(false); onResolving(false); } }
  }
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs leading-4 text-ink-muted">{ariaLabel}</label>
      <input ref={input} id={id} autoFocus required type="text" role="combobox" aria-label={ariaLabel} aria-autocomplete="list" aria-expanded={open && !disabled} aria-controls={open && !disabled ? listId : undefined} aria-activedescendant={open && active >= 0 && items[active] ? listId + "-" + active : undefined} aria-busy={loading} aria-describedby={id + "-hint"} autoComplete="off" maxLength={PLACE_ADDRESS_LIMIT} value={value} disabled={disabled} placeholder={placeholder} className={`${fieldClass} disabled:opacity-60`}
        onChange={event => edit(event.target.value)} onFocus={() => { if (!valid) setOpen(true); }} onClick={() => { if (!valid) setOpen(true); }} onBlur={blur}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setOpen(true); if (items.length) setActive(index => event.key === "ArrowDown" ? (index + 1) % items.length : (index <= 0 ? items.length - 1 : index - 1)); }
          if (event.key === "Enter") { event.preventDefault(); if (open && items.length && active >= 0) choose(items[active]); else if (valid) onCommit(); }
          if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); if (open) setOpen(false); else onCancel(); }
        }} />
      <p id={id + "-hint"} className="mt-1 text-xs leading-4 text-ink-muted">{value.trim().length > PLACE_ADDRESS_LIMIT ? tr("Address must be 200 characters or fewer.") : valid ? tr("Location selected") : tr("Choose an address suggestion.")}</p>
      {open && !disabled && position && createPortal(
        <div ref={popup} onBlur={blur} style={{ position: "fixed", ...position, zIndex: 400 }} className="overflow-y-auto rounded-xl border border-border bg-[var(--input-background)] text-[var(--text)] shadow-lg">
          <div id={listId} role="listbox" aria-label={tr("Address suggestions")} aria-busy={loading}>
            {items.map((item, index) => <button type="button" key={item.id} id={listId + "-" + index} role="option" aria-selected={index === active} tabIndex={-1} onMouseDown={event => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => choose(item)} className={`block min-h-12 w-full cursor-pointer px-4 py-3 text-left text-base leading-6 hover:bg-surface-muted ${index === active ? "bg-surface-muted" : ""}`}>{item.label}</button>)}
          </div>
          {loading && <p role="status" className="px-4 py-3 text-sm">{tr("Finding places…")}</p>}
          {!loading && !items.length && <p role="status" className="px-4 py-3 text-sm">{error || tr(value.trim().length < 3 ? "Type at least 3 characters." : "No matching places.")}</p>}
          {error && <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => { chosen.current = ""; setRetry(count => count + 1); input.current?.focus(); }} className="mx-4 mb-3 min-h-11 rounded-lg px-3 text-sm text-primary underline underline-offset-2">{tr("Try again")}</button>}
          {items.length > 0 && <p translate="no" className="border-t border-border px-4 py-2 font-normal whitespace-nowrap" style={{ color: resolvedTheme === "dark" ? "#fff" : "#5e5e5e", fontFamily: "Arial, sans-serif", fontSize: 12 }}>Google Maps</p>}
        </div>, document.body)}
    </div>
  );
}

"use client"

import * as React from "react"
import Icon from '@mdi/react';
import { mdiClose } from '@mdi/js';

// ─── Utility ─────────────────────────────────────────────────────────────────

function cn(...classes) {
  return classes.filter(Boolean).join(" ")
}

function formatDate(date) {
  if (!date) return null
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function formatTime(time) {
  if (!time) return ""
  const [h, m] = time.split(":")
  const hour = parseInt(h, 10)
  const ampm = hour >= 12 ? "PM" : "AM"
  const h12 = hour % 12 || 12
  return `${h12}:${m} ${ampm}`
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function ChevronLeftIcon({ className, ...props }) {
  return (
    <svg className={cn("size-4", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  )
}

function ChevronRightIcon({ className, ...props }) {
  return (
    <svg className={cn("size-4", className)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="m9 18 6-6-6-6" />
    </svg>
  )
}

// ─── Calendar ─────────────────────────────────────────────────────────────────

const DAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
]

function Calendar({ selected, onSelect }) {
  const today = new Date()
  const [view, setView] = React.useState(() => {
    const d = selected ?? today
    return { year: d.getFullYear(), month: d.getMonth() }
  })

  const { year, month } = view
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()

  const cells = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const prevMonth = () =>
    setView(({ year, month }) =>
      month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
    )
  const nextMonth = () =>
    setView(({ year, month }) =>
      month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
    )

  const isSelected = (d) =>
    selected &&
    selected.getFullYear() === year &&
    selected.getMonth() === month &&
    selected.getDate() === d

  const isToday = (d) =>
    today.getFullYear() === year &&
    today.getMonth() === month &&
    today.getDate() === d

  const isPast = (d) => {
    const cell = new Date(year, month, d)
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    return cell < todayMidnight
  }

  const isTooFar = (d) => {
    const cell = new Date(year, month, d)
    const maxDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7)
    return cell > maxDate
  }

  return (
    <div className="select-none w-full">
      {/* Month nav */}
      <div className="flex items-center justify-between mb-2.5">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); prevMonth() }}
          className="flex items-center justify-center size-7 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ChevronLeftIcon className="size-4" />
        </button>
        <span className="text-sm font-medium text-white tabular-nums">
          {MONTHS[month]} '{String(year).slice(-2)}
        </span>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); nextMonth() }}
          className="flex items-center justify-center size-7 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ChevronRightIcon className="size-4" />
        </button>
      </div>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 gap-x-1 mb-1">
        {DAYS.map((d) => (
          <div key={d} className="flex items-center justify-center h-9 text-xs text-white/40 font-medium">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-y-1 gap-x-1">
        {cells.map((d, i) => {
          if (!d) return <div key={`e-${i}`} className="h-9" />
          const sel = isSelected(d)
          const tod = isToday(d)
          const past = isPast(d)
          const far = isTooFar(d)
          return (
            <button
              type="button"
              key={`${year}-${month}-${d}`}
              onClick={(e) => { if (past || far) return; e.stopPropagation(); onSelect(new Date(year, month, d)) }}
              disabled={past || far}
              className={cn(
                "flex items-center justify-center h-9 w-full rounded-md text-sm transition-colors",
                past || far
                  ? "text-white/20 cursor-not-allowed"
                  : sel
                  ? "bg-white text-black font-semibold"
                  : tod
                  ? "bg-white/20 text-white font-medium hover:bg-white/25"
                  : "text-white/80 hover:bg-white/10"
              )}
            >
              {d}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── DateTimeSelector ─────────────────────────────────────────────────────────
// Content only — no trigger button or outer shell; drop inside the dropdown Button.
// onChange(Date) fires when date or time changes (both set); onConfirm(Date) on Confirm.

export function DateTimeSelector({ onClick, onChange, onConfirm, initial }) {
  const today = new Date()
  const [date, setDate] = React.useState(initial ?? undefined)
  const [time, setTime] = React.useState(
    initial
      ? `${String(initial.getHours()).padStart(2, "0")}:${String(initial.getMinutes()).padStart(2, "0")}`
      : "10:30"
  )

  const ampm = parseInt(time.split(":")[0], 10) >= 12 ? "PM" : "AM"

  function toggleAmPm() {
    const [h, m] = time.split(":").map(Number)
    const newHour = ampm === "AM" ? (h + 12) % 24 : (h - 12 + 24) % 24
    const newTime = `${String(newHour).padStart(2, "0")}:${String(m).padStart(2, "0")}`
    setTime(newTime)
    const combined = getCombined(date, newTime)
    if (combined && onChange) onChange(combined)
  }

  function getCombined(d, t) {
    if (!d || !t) return null
    const [h, m] = t.split(":").map(Number)
    const combined = new Date(d)
    combined.setHours(h, m, 0, 0)
    return combined
  }

  function handleDateSelect(d) {
    setDate(d)
    const combined = getCombined(d, time)
    if (combined && onChange) onChange(combined)
  }

  function handleTimeChange(e) {
    const newTime = e.target.value
    setTime(newTime)
    const combined = getCombined(date, newTime)
    if (combined && onChange) onChange(combined)
  }

  function handleConfirm() {
    const combined = getCombined(date, time)
    if (combined && onConfirm) onConfirm(combined)
  }

  const combined = getCombined(date, time)

  const isTooSoon = (() => {
    if (!combined) return false
    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
    if (date.getTime() !== todayMidnight.getTime()) return false
    const [h, m] = time.split(":").map(Number)
    const nowMins = today.getHours() * 60 + today.getMinutes()
    return (h * 60 + m) < nowMins + 30
  })()

  return (
    <div className="flex flex-col gap-3 pt-6 pb-3 w-full p-2">
      <div onClick={onClick} className="absolute right-3 top-3"><Icon path={mdiClose} size={0.9} /></div>

      {/* ── Time ── */}
      <div className="flex flex-col justify-center items-center gap-1.5">
        <label className="text-sm font-semibold text-white/40 uppercase tracking-wider">
          Time
        </label>
        <div className="flex gap-2 justify-center items-center">
          <input
            type="time"
            step="60"
            value={time}
            onChange={handleTimeChange}
            className={cn(
              "flex-1 h-9 px-3 rounded-lg w-fit text-sm tabular-nums text-white",
              "bg-white/10 border border-white/15",
              "outline-none focus:border-white/40 focus:bg-white/15 transition-colors",
              "appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
            )}
          />
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); toggleAmPm() }}
            className="h-9 px-3 rounded-lg text-sm font-semibold tabular-nums bg-white/10 border border-white/15 text-white hover:bg-white/20 transition-colors"
          >
            {ampm}
          </button>
        </div>
      </div>

      {/* ── Divider ── */}
      <div className="h-px bg-white/10" />

      {/* ── Date / Calendar ── */}
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold text-white/40 uppercase tracking-wider">
          Date
        </label>
        <Calendar selected={date} onSelect={handleDateSelect} />
      </div>

      {/* ── Divider ── */}
      <div className="h-px bg-white/10" />

      {/* ── Summary + Confirm ── */}
      <div className="flex flex-col gap-2">
        <p className="text-sm text-white/60 text-center tabular-nums">
          {combined
            ? isTooSoon
              ? "Min. 30 mins from now"
              : `${formatDate(date)} · ${formatTime(time)}`
            : "Select a date to confirm"}
        </p>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); handleConfirm() }}
          disabled={!combined || isTooSoon}
          className={cn(
            "w-full h-9 rounded-xl text-sm font-semibold transition-all active:scale-[0.98]",
            combined && !isTooSoon
              ? "bg-white text-black hover:bg-white/90 cursor-pointer"
              : "bg-white/10 text-white/30 cursor-not-allowed"
          )}
        >
          Confirm
        </button>
      </div>
    </div>
  )
}
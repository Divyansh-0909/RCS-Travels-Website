"use client"

import * as React from "react"
import Icon from "@mdi/react"
import { mdiClose } from "@mdi/js"
import { useTranslation } from "react-i18next"

function cn(...classes) { return classes.filter(Boolean).join(" ") }

const WHEEL_ROW_HEIGHT = 44

function formatDate(date, locale) {
  if (!date) return null
  return date.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" })
}

function formatTime(time, locale) {
  if (!time) return ""
  const [hour, minute] = time.split(":").map(Number)
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit", hour12: true })
}

function startOfDay(date) { return new Date(date.getFullYear(), date.getMonth(), date.getDate()) }

function isSameDay(first, second) {
  return first && second && first.getFullYear() === second.getFullYear()
    && first.getMonth() === second.getMonth() && first.getDate() === second.getDate()
}

function WheelColumn({ items, selectedIndex, onSelect, ariaLabel, className, cyclic = false }) {
  const ref = React.useRef(null)
  const selectingFromScroll = React.useRef(false)
  const recenterTimer = React.useRef(null)
  const renderedItems = cyclic ? [...items, ...items, ...items] : items
  const selectedRenderedIndex = cyclic ? items.length + selectedIndex : selectedIndex

  React.useLayoutEffect(() => {
    const node = ref.current
    if (!node || selectingFromScroll.current) return
    const target = selectedRenderedIndex * WHEEL_ROW_HEIGHT
    if (Math.abs(node.scrollTop - target) > 1) node.scrollTo({ top: target, behavior: "auto" })
  }, [selectedRenderedIndex])

  React.useEffect(() => () => clearTimeout(recenterTimer.current), [])

  function selectIndex(index, behavior = "smooth") {
    const nextIndex = Math.max(0, Math.min(items.length - 1, index))
    onSelect(nextIndex)
    const renderedIndex = cyclic ? items.length + nextIndex : nextIndex
    ref.current?.scrollTo({ top: renderedIndex * WHEEL_ROW_HEIGHT, behavior })
  }

  function handleScroll(event) {
    const node = event.currentTarget
    const renderedIndex = Math.max(0, Math.min(renderedItems.length - 1, Math.round(node.scrollTop / WHEEL_ROW_HEIGHT)))
    const nextIndex = cyclic ? renderedIndex % items.length : renderedIndex
    if (nextIndex !== selectedIndex) {
      selectingFromScroll.current = true
      onSelect(nextIndex)
      requestAnimationFrame(() => { selectingFromScroll.current = false })
    }

    if (cyclic) {
      clearTimeout(recenterTimer.current)
      recenterTimer.current = setTimeout(() => {
        node.scrollTo({ top: (items.length + nextIndex) * WHEEL_ROW_HEIGHT, behavior: "auto" })
      }, 120)
    }
  }

  function handleKeyDown(event) {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
    event.preventDefault()
    selectIndex(selectedIndex + (event.key === "ArrowDown" ? 1 : -1))
  }

  return (
    <div
      ref={ref}
      role="listbox"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-activedescendant={`${ariaLabel.replace(/\s+/g, "-").toLowerCase()}-${selectedRenderedIndex}`}
      onScroll={handleScroll}
      onKeyDown={handleKeyDown}
      className={cn(
        "relative z-10 h-44 snap-y snap-mandatory overflow-y-auto overscroll-contain py-[66px] text-center outline-none [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--foreground)]",
        className,
      )}
    >
      {renderedItems.map((item, renderedIndex) => {
        const itemIndex = cyclic ? renderedIndex % items.length : renderedIndex
        const distance = Math.abs(renderedIndex - selectedRenderedIndex)
        return (
          <div
            key={`${item}-${renderedIndex}`}
            id={`${ariaLabel.replace(/\s+/g, "-").toLowerCase()}-${renderedIndex}`}
            role="option"
            aria-selected={renderedIndex === selectedRenderedIndex}
            onClick={(event) => { event.stopPropagation(); selectIndex(itemIndex) }}
            className={cn(
              "flex h-11 cursor-pointer snap-center items-center justify-center whitespace-nowrap px-1 text-base tabular-nums transition-[opacity,font-weight] duration-150 sm:text-lg",
              renderedIndex === selectedRenderedIndex ? "font-semibold text-[var(--text)]" : "font-medium text-[var(--text-muted)]",
            )}
            style={{ opacity: distance === 0 ? 1 : distance === 1 ? 0.42 : 0.16 }}
          >
            {item}
          </div>
        )
      })}
    </div>
  )
}

function getDefaultTime(initial) {
  if (initial) {
    return `${String(initial.getHours()).padStart(2, "0")}:${String(initial.getMinutes()).padStart(2, "0")}`
  }

  const earliest = new Date(Date.now() + (30 * 60 * 1000))
  earliest.setSeconds(0, 0)
  const roundedMinutes = Math.ceil(earliest.getMinutes() / 15) * 15
  earliest.setMinutes(roundedMinutes)
  return `${String(earliest.getHours()).padStart(2, "0")}:${String(earliest.getMinutes()).padStart(2, "0")}`
}

function formatWheelDate(day, index, locale, todayLabel) {
  if (index === 0) return todayLabel
  return new Intl.DateTimeFormat(locale, { weekday: "short", day: "numeric", month: "short" }).format(day)
}

function getCombined(day, selectedTime) {
  if (!day || !selectedTime) return null
  const [hour, selectedMinute] = selectedTime.split(":").map(Number)
  const combined = new Date(day)
  combined.setHours(hour, selectedMinute, 0, 0)
  return combined
}

function TimeWheel({ hour12, minute, period, onHourChange, onMinuteChange, onPeriodChange, labels }) {
  return (
    <>
      <WheelColumn
        items={Array.from({ length: 12 }, (_, index) => String(index + 1))}
        selectedIndex={hour12 - 1}
        onSelect={(index) => onHourChange(index + 1)}
        ariaLabel={labels.hour}
        cyclic
      />
      <WheelColumn
        items={Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"))}
        selectedIndex={minute}
        onSelect={onMinuteChange}
        ariaLabel={labels.minute}
        cyclic
      />
      <WheelColumn
        items={["AM", "PM"]}
        selectedIndex={period === "PM" ? 1 : 0}
        onSelect={(index) => onPeriodChange(index === 1 ? "PM" : "AM")}
        ariaLabel={labels.period}
      />
    </>
  )
}

function DateWheel({ days, selected, onSelect, locale, todayLabel, ariaLabel }) {
  const selectedIndex = Math.max(0, days.findIndex((day) => isSameDay(day, selected)))
  return (
    <WheelColumn
      items={days.map((day, index) => formatWheelDate(day, index, locale, todayLabel))}
      selectedIndex={selectedIndex}
      onSelect={(index) => onSelect(days[index])}
      ariaLabel={ariaLabel}
      className="text-left"
    />
  )
}

function SelectionBand() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-11 -translate-y-1/2 rounded-xl bg-[var(--background-muted)] shadow-inner shadow-black/10"
    />
  )
}

function WheelFade() {
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-20 h-10"
        style={{ background: "linear-gradient(to bottom, var(--background-primary), transparent)" }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10"
        style={{ background: "linear-gradient(to top, var(--background-primary), transparent)" }}
      >
      </div>
    </>
  )
}

// Content only: it can live in the compact legacy dropdown or in a full booking
// step. onChange(Date) fires once date and time are both set; the surrounding
// page may own the primary action by hiding this component's Confirm button.
export function DateTimeSelector({ onClick, onChange, onConfirm, initial, page = false, showClose = true, showConfirm = true }) {
  const { t, i18n } = useTranslation("website")
  const locale = i18n.language === "hi" ? "hi-IN" : "en-IN"
  const today = React.useMemo(() => startOfDay(new Date()), [])
  const days = React.useMemo(() => Array.from({ length: 7 }, (_, offset) => {
    const day = new Date(today)
    day.setDate(day.getDate() + offset)
    return day
  }), [today])
  const [date, setDate] = React.useState(() => initial ? startOfDay(initial) : today)
  const [time, setTime] = React.useState(() => getDefaultTime(initial))
  const emittedInitialValue = React.useRef(false)

  const [hour24, minute] = time.split(":").map(Number)
  const period = hour24 >= 12 ? "PM" : "AM"
  const hour12 = hour24 % 12 || 12

  function updateTime(nextHour24, nextMinute = minute) {
    const nextTime = `${String(nextHour24).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`
    setTime(nextTime)
    const combined = getCombined(date, nextTime)
    if (combined && onChange) onChange(combined)
  }

  function handleHourChange(event) { updateTime((Number(event.target.value) % 12) + (period === "PM" ? 12 : 0)) }
  function handleMinuteChange(event) { updateTime(hour24, Number(event.target.value)) }
  function handlePeriodChange(nextPeriod) { updateTime((hour12 % 12) + (nextPeriod === "PM" ? 12 : 0)) }

  function handleDateSelect(day) {
    setDate(day)
    const combined = getCombined(day, time)
    if (combined && onChange) onChange(combined)
  }

  function handleConfirm() {
    const combined = getCombined(date, time)
    if (combined && onConfirm) onConfirm(combined)
  }

  const combined = getCombined(date, time)
  const isTooSoon = combined ? combined.getTime() < Date.now() + (30 * 60 * 1000) : false

  React.useEffect(() => {
    if (initial || emittedInitialValue.current || !combined || isTooSoon || !onChange) return
    emittedInitialValue.current = true
    onChange(combined)
  }, [combined, initial, isTooSoon, onChange])

  return (
    <div className={cn("flex w-full flex-col", page ? "gap-3 pb-1" : "gap-3 p-2 pt-6 pb-3")}>
      {showClose && (
        <button type="button" aria-label={t("dateTime.close")} onClick={onClick} className="absolute right-3 top-3">
          <Icon path={mdiClose} size={0.9} />
        </button>
      )}

      <div className="relative isolate overflow-hidden rounded-2xl bg-[var(--background-primary)]">
        <SelectionBand />
        <div className="grid grid-cols-[1.7fr_0.55fr_0.7fr_0.8fr] items-stretch gap-0.5">
          <DateWheel
            days={days}
            selected={date}
            onSelect={handleDateSelect}
            locale={locale}
            todayLabel={t("dateTime.today")}
            ariaLabel={t("dateTime.availableDays")}
          />
          <TimeWheel
            hour12={hour12}
            minute={minute}
            period={period}
            onHourChange={(nextHour12) => updateTime((nextHour12 % 12) + (period === "PM" ? 12 : 0))}
            onMinuteChange={(nextMinute) => updateTime(hour24, nextMinute)}
            onPeriodChange={(nextPeriod) => updateTime((hour12 % 12) + (nextPeriod === "PM" ? 12 : 0))}
            labels={{
              hour: t("dateTime.hour"),
              minute: t("dateTime.minute"),
              period: t("dateTime.period"),
            }}
          />
        </div>
        <WheelFade />
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-center text-sm tabular-nums text-[var(--text)]">
          {combined ? (isTooSoon ? t("dateTime.minimumLead") : `${formatDate(date, locale)} · ${formatTime(time, locale)}`) : t("dateTime.selectDate")}
        </p>
        {showConfirm && (
          <button
            type="button"
            onClick={(event) => { event.stopPropagation(); handleConfirm() }}
            disabled={!combined || isTooSoon}
            className={cn(
              "mt-1 h-9 w-full rounded-xl text-sm font-semibold transition-colors active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--foreground)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background-panel)]",
              combined && !isTooSoon ? "bg-[var(--foreground)] text-[var(--text-foreground)] hover:opacity-90 cursor-pointer" : "bg-[var(--background-muted)] text-[var(--text-muted)]/50 cursor-not-allowed"
            )}
          >
            {t("dateTime.confirm")}
          </button>
        )}
      </div>
    </div>
  )
}

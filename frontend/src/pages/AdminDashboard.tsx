import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../i18nCopy";
import AccountLayout from "../components/ui/AccountLayout"
import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import Icon from '@mdi/react';
import { mdiMagnify, mdiTuneVertical, mdiSortCalendarDescending, mdiContentCopy, mdiSortCalendarAscending, mdiClose, mdiChevronRight, mdiCarOutline, mdiCalendarRange, mdiWeb, mdiCancel, mdiShieldCheckOutline, mdiAccountGroupOutline, mdiAccessPoint, mdiCardTextOutline, mdiPhoneOutline, mdiGenderMaleFemale } from '@mdi/js';
import { useApi } from "../hooks/useApi";
import { useExitAnim } from "../hooks/useExitAnim";
import AdminDashboardSkeleton from "../components/AdminDashboardSkeleton";
import DriverReview from "../components/DriverReview";
import DriverFinancePanel from "../components/DriverFinancePanel";
import { vehicleLabel, statusChip, splitAddress, displayPhone, formatDateTime, CopyBtn } from "../components/ui/bookingDisplay";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FailureState from "../components/ui/FailureState";
import Chips, { filterLabel, filterField } from "../components/ui/Chips";
import { VerificationStatus, BookingStatus, CancelledBy, BookingSource, VehicleClass, DriverGroup } from "../types/enums";
import { VEHICLE_CLASS_NAMES } from "../constants/vehicles";
import { angledVehicleImageOf } from "../constants/vehicleImages";
import pfpPlaceholder from "../assets/pfp-placeholder.webp";

const driverInitials = (name: string | null | undefined) => {
    const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
    return parts.length ? parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() : "D";
};


// Leaflet, Geoman and the whole rate card are a few hundred KB that the three
// list tabs never touch, so the editor only loads once its tab is opened.
const EditFares = lazy(() => import("./EditFares"))

const items = ['Bookings', 'Drivers', 'Users', 'Edit Fares']
// The last tab is the zone editor, which shares none of the list chrome — no
// search, no filters, no pagination, and no fetch on page change.
const FARES_TAB = 3

const verificationChip = (status: VerificationStatus) => {
    if (status === "approved") return "text-green-700 bg-green-600/10"
    if (status === "rejected") return "text-red-600 bg-red-500/10"
    return "text-amber-600 bg-amber-500/10"
}

// Returns the element rather than a class name — unlike verificationChip above,
// because `partner` gets no chip at all and "" would still render an empty pill.
// It is the default and the majority, so a chip on every card would be a column
// of noise the eye has to filter to find the handful that are not.
const fleetBadge = (group: DriverGroup) => {
    if (group === "partner") return null
    const tone = group === "rcs" ? "text-primary bg-primary/10" : "text-amber-700 bg-amber-500/10"
    return (
        <span className={`${tone} text-xs font-semibold px-2.5 py-1 rounded-full shrink-0`}>
            {group === "rcs" ? dc("RCS fleet") : dc("Owner")}
        </span>
    )
}

// Collapsed admin rows follow the same scan rhythm as the captain app's ride-history
// rows: one compact information row, one quiet separator, then status/context. Keeping
// the shell shared also stops each admin tab from feeling like a different product.
const collapsedCardClass = "w-full min-w-0 overflow-hidden cursor-pointer rounded-2xl bg-surface-muted p-3 text-left transition-transform duration-150 ease-out active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary sm:p-4"
const collapsedBookingCardClass = "w-full min-w-0 cursor-pointer rounded-2xl bg-surface-muted p-4 text-left transition-transform duration-150 ease-out active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
const collapsedListGridClass = "grid w-full min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3"

const listDateParts = (value: string) => {
    const date = new Date(value)
    return {
        time: date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
        day: date.toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
    }
}

const bookingStatuses: BookingStatus[] = ["pending", "confirmed", "assigned", "en_route", "reached", "started", "completed", "cancelled", "no_driver"]

// Shapes returned by the admin API (backend/routes/admin.ts); DateTimes arrive as ISO strings.
type Booking = {
    id: string
    // The readable ride name, "RCS4831902" — what the row displays and what the
    // search box above accepts. `id` is still the uuid every request is keyed on.
    reference: string
    fare: number
    status: BookingStatus
    scheduledAt: string | null
    createdAt: string
    vehicleClass: VehicleClass
    sharing: boolean
    isOutstation: boolean
    source: BookingSource
    customerPhone: string
    pickupAddress: string
    dropAddress: string
    user: { name: string | null } | null
    driver: { name: string; phone: string } | null
    coRiders: { name: string | null; phone: string }[]
}

type Driver = {
    id: string
    name: string
    phone: string
    photoUrl?: string | null
    isOnline: boolean
    verificationStatus: VerificationStatus
    // Separate from verificationStatus on purpose: a suspended captain's
    // paperwork is still in order, so his chip stays "approved" while he is
    // stopped. The two answer different questions and the card shows both.
    suspendedAt: string | null
    suspensionReason: string | null
    // Dispatch order, not eligibility. Moved from the paperwork panel below, and
    // shown here so "who is in the fleet" can be answered by reading the page.
    group: DriverGroup
    vehicleClass: VehicleClass
    vehicleNumber: string
    createdAt: string
}

type User = {
    id: string
    name: string | null
    phone: string
    photoUrl?: string | null
    gender: string | null
    bookingCode: string
    createdAt: string
    deletedAt: string | null
    _count: { bookings: number }
}

type DetailTarget = {
    kind: "booking" | "driver" | "user"
    id: string
}

const DetailModal = ({ title, onClose, children }: {
    title: string
    onClose: () => void
    children: ReactNode
}) => createPortal(
    <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="fixed left-1/2 top-1/2 z-200 flex h-[100dvh] w-screen max-h-none max-w-none -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-none border-0 bg-surface-muted shadow-2xl animate-datetime motion-reduce:animate-none sm:h-auto sm:max-h-[calc(100dvh-24px)] sm:w-[760px] sm:max-w-[calc(100vw-24px)] sm:rounded-2xl sm:border sm:border-border/60"
    >
        <div className="flex shrink-0 items-center justify-between px-4 pt-4 sm:px-5 sm:pt-5">
            <h2 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{title}</h2>
            <button
                type="button"
                aria-label={dc("Close")}
                onClick={onClose}
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-xl bg-surface text-ink-muted transition-[color,transform] duration-150 hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
                <Icon path={mdiClose} size={0.9} />
            </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto bg-surface-muted py-4 pl-4 pr-1 sm:flex-auto sm:px-5 sm:py-5">
            <div className="flex w-full flex-col gap-4">{children}</div>
        </div>
    </section>,
    document.body,
)

const DetailCard = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
    <div className={`w-full rounded-2xl border border-border/50 bg-surface p-4 sm:p-5 ${className}`}>{children}</div>
)

const DetailLabel = ({ children }: { children: ReactNode }) => (
    <p className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">{children}</p>
)

const FactPill = ({ children }: { children: ReactNode }) => (
    <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-ink-muted">{children}</span>
)

// One chip per car.
// constants/vehicles.js is plain JS, so its keys widen to string — the cast puts
// them back on the enum the filter state and the API both expect.
const vehicleOptions = VEHICLE_CLASS_NAMES.map(cls => ({ value: cls as VehicleClass, label: vehicleLabel(cls) }))
const bookingSections = ["Status", "Vehicle type", "Dates", "Source", "Cancelled by"]
// Fleet sits next to Verification because they are the two questions about the
// captain himself; everything after is about his car, his number, or his dates.
const driverSections = ["Vehicle type", "Verification", "Fleet", "Availability", "Vehicle number", "Driver phone", "Joined"]
const userSections = ["Gender", "User phone", "Joined"]
const filterSectionIcons: Record<string, string> = {
    Status: mdiTuneVertical,
    "Vehicle type": mdiCarOutline,
    Dates: mdiCalendarRange,
    Source: mdiWeb,
    "Cancelled by": mdiCancel,
    Verification: mdiShieldCheckOutline,
    Fleet: mdiAccountGroupOutline,
    Availability: mdiAccessPoint,
    "Vehicle number": mdiCardTextOutline,
    "Driver phone": mdiPhoneOutline,
    Gender: mdiGenderMaleFemale,
    "User phone": mdiPhoneOutline,
    Joined: mdiCalendarRange,
}
// Same values ManageAccount writes, so the filter matches what's stored
const genderOptions = ["Male", "Female", "Others", "Rather not say"].map(g => ({ value: g, label: g }))

const AdminDashboard = () => {
    useCopyLanguage();
    const [selected, setSelected] = useState(0)
    const [active, setActive] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [status, setStatus] = useState<BookingStatus | null>(null)
    const [startDate, setStartDate] = useState<string | null>(null)
    const [endDate, setEndDate] = useState<string | null>(null)
    const [customerPhone, setCustomerPhone] = useState<string | null>(null)
    const [driverPhone, setDriverPhone] = useState<string | null>(null)
    const [customerName, setCustomerName] = useState<string | null>(null)
    const [driverName, setDriverName] = useState<string | null>(null)
    const [vehicleClass, setVehicleClass] = useState<VehicleClass | null>(null)
    const [vehicleNumber, setVehicleNumber] = useState<string | null>(null)
    const [verificationStatus, setVerificationStatus] = useState<VerificationStatus | null>(null)
    const [group, setGroup] = useState<DriverGroup | null>(null)
    const [isOnline, setIsOnline] = useState<boolean | null>(null)
    const [gender, setGender] = useState<string | null>(null)
    const [userPhone, setUserPhone] = useState<string | null>(null)
    const [isOutstation, setIsOutstation] = useState<boolean | null>(null)
    const [source, setSource] = useState<BookingSource | null>(null)
    const [cancelledBy, setCancelledBy] = useState<CancelledBy | null>(null)
    const [page, setPage] = useState(1) // (page - 1) * limit. If you send page=0, that's skip: -20,
    const [pageInput, setPageInput] = useState("1")
    const [limit, setLimit] = useState(10)
    const [totalBookings, setTotalBookings] = useState<number | null>(null)
    const [totalDrivers, setTotalDrivers] = useState<number | null>(null)
    const [totalUsers, setTotalUsers] = useState<number | null>(null)
    const [bookings, setBookings] = useState<Booking[]>([])
    const [drivers, setDrivers] = useState<Driver[]>([])
    const [users, setUsers] = useState<User[]>([])
    const [copied, setCopied] = useState(false)
    const [order, setOrder] = useState(true)
    const [expanded, setExpanded] = useState(false)
    const [filterSection, setFilterSection] = useState(0)
    const [search, setSearch] = useState("")
    const searchInit = useRef(true)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
    const reqRef = useRef(0)
    const filterDropdown = useExitAnim(expanded, 300)

    const sections = selected === 0 ? bookingSections : selected === 1 ? driverSections : userSections
    const sectionIndex = Math.min(filterSection, sections.length - 1)

    const api = useApi()

    // One fixed detail panel at a time. Driver paperwork still loads lazily only
    // after its captain is opened, so signed document URLs are not minted for the
    // entire result set.
    const [detail, setDetail] = useState<DetailTarget | null>(null)

    const copyId = (id: string) => {
        if (!id) return
        navigator.clipboard.writeText(id)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const totalBookingsPages : number = Math.ceil((totalBookings ?? 0) / limit)
    const totalDriversPages : number = Math.ceil((totalDrivers ?? 0) / limit)
    const totalUsersPages : number = Math.ceil((totalUsers ?? 0) / limit)
    const totalPages : number = Math.max(1, selected === 0 ? totalBookingsPages : selected === 1 ? totalDriversPages : totalUsersPages)

    useEffect(() => {
        // The fares tab has no list to fetch, and loads its own rate card.
        if (selected === FARES_TAB) return
        selected === 0 ? searchBooking() : selected === 1 ? searchDrivers() : searchUsers()
    }, [page, selected])

    useEffect(() => {
        setPageInput(String(page))
    }, [page])

    function commitPage() {
        const n = parseInt(pageInput, 10)
        if (Number.isNaN(n)) {
            setPageInput(String(page))
            return
        }
        const clamped = Math.min(Math.max(1, n), totalPages)
        setPageInput(String(clamped))
        setPage(clamped)
    }

    // Backend rejects 1-char searches (min 2), so send null below that
    const searchParam = search.trim().length >= 2 ? search.trim() : null

    async function searchBooking(e?: { preventDefault: () => void } | null, overrides: Record<string, unknown> = {}) {
        e?.preventDefault();
        const id = ++reqRef.current
        setError(null)
        setLoading(true)
        try {
            const data = await api.getBookings({ search: searchParam, status, startDate, endDate, customerPhone, customerName, driverName, vehicleClass, source, isOutstation, cancelledBy, sortOrder: order ? "desc" : "asc", page, limit, ...overrides })
            if (id !== reqRef.current) return // a newer request superseded this one
            if (data?.error) {
                setError(data.error)
                return
            }
            setTotalBookings(data.total)
            setBookings(data.bookings)
        } catch (e) {
            if (id === reqRef.current) setError(e instanceof Error ? e.message : "Something went wrong")
        } finally {
            if (id === reqRef.current) setLoading(false)
        }
    }

    async function searchDrivers(e?: { preventDefault: () => void } | null, overrides: Record<string, unknown> = {}) {
        e?.preventDefault();
        const id = ++reqRef.current
        setError(null)
        setLoading(true)
        try {
            const data = await api.getDrivers({ search: searchParam, driverName, driverPhone, vehicleClass, vehicleNumber, verificationStatus, group, isOnline, startDate, endDate, sortOrder: order ? "desc" : "asc", page, limit, ...overrides })
            if (id !== reqRef.current) return
            if (data?.error) {
                setError(data.error)
                return
            }
            setTotalDrivers(data.total)
            setDrivers(data.drivers)
        } catch (e) {
            if (id === reqRef.current) setError(e instanceof Error ? e.message : "Something went wrong")
        } finally {
            if (id === reqRef.current) setLoading(false)
        }
    }

    async function searchUsers(e?: { preventDefault: () => void } | null, overrides: Record<string, unknown> = {}) {
        e?.preventDefault();
        const id = ++reqRef.current
        setError(null)
        setLoading(true)
        try {
            const data = await api.getUsers({ search: searchParam, userName: customerName, userPhone, gender, startDate, endDate, sortOrder: order ? "desc" : "asc", page, limit, ...overrides })
            if (id !== reqRef.current) return
            if (data?.error) {
                setError(data.error)
                return
            }
            setTotalUsers(data.total)
            setUsers(data.users)
        } catch (e) {
            if (id === reqRef.current) setError(e instanceof Error ? e.message : "Something went wrong")
        } finally {
            if (id === reqRef.current) setLoading(false)
        }
    }

    function runSearch() {
        if (page !== 1) {
            setPage(1) // page effect refetches with the current search state
            return
        }
        refetch()
    }

    function toggleSortOrder() {
        const nextOrder = !order
        setOrder(nextOrder)
        setDetail(null)

        if (page !== 1) {
            setPage(1)
            return
        }

        const overrides = { sortOrder: nextOrder ? "desc" : "asc" }
        selected === 0 ? searchBooking(null, overrides) : selected === 1 ? searchDrivers(null, overrides) : searchUsers(null, overrides)
    }

    // Re-runs the active tab's request on the CURRENT page — what the failure
    // state's retry needs, as opposed to runSearch, which resets to page 1.
    function refetch() {
        selected === 0 ? searchBooking() : selected === 1 ? searchDrivers() : searchUsers()
    }

    // Whether the empty result is "there is nothing here" or "nothing matched
    // what you asked for" — the two need different copy and different ways out.
    // Booleans are compared against null: `isOnline === false` (Offline) and
    // `isOutstation === false` are real filters, not absent ones.
    const tabFiltersActive = selected === 0
        ? !!(status || vehicleClass || startDate || endDate || source || cancelledBy) || isOutstation !== null
        : selected === 1
            ? !!(vehicleClass || vehicleNumber || driverPhone || verificationStatus || group || startDate || endDate) || isOnline !== null
            : !!(gender || userPhone || startDate || endDate)
    const filtersActive = !!searchParam || tabFiltersActive

    // Clearing filters is only an escape route when some are set; searching is
    // handled by clearing the box, so that gets its own action below.
    const emptyEscape = tabFiltersActive
        ? { get "label"() { return dc("Clear all filters"); }, onClick: clearFilters }
        : searchParam
            ? { get "label"() { return dc("Clear search"); }, onClick: () => setSearch("") }
            : undefined

    const entity = selected === 0 ? "bookings" : selected === 1 ? "drivers" : "users"

    // Copy follows whichever narrowed the list, so a search-only miss isn't told
    // to "drop a filter" it never set. Defined once — all three tabs share it.
    const emptyCopy = tabFiltersActive
        ? {
            get "title"() { return dc("No {{value0}} match those filters", {value0: (entity)}); },
            get "message"() { return dc("Try widening the date range, or drop a filter and search again."); },
        }
        : {
            get "title"() { return dc("No {{value0}} match your search", {value0: (entity)}); },
            get "message"() { return dc("Check the spelling, or try a phone number or ID instead."); },
        }

    // Debounced search: fire 400ms after typing stops; 1-char input is skipped.
    useEffect(() => {
        if (searchInit.current) {
            searchInit.current = false
            return
        }
        if (search.trim().length === 1) return
        clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(runSearch, 400)
        return () => clearTimeout(debounceRef.current)
    }, [search])

    function applyFilters() {
        setExpanded(false)
        if (page !== 1) {
            setPage(1)
            return
        }
        selected === 0 ? searchBooking() : selected === 1 ? searchDrivers() : searchUsers()
    }

    function clearFilters() {
        setStatus(null); setVehicleClass(null); setStartDate(null); setEndDate(null); setSource(null); setCancelledBy(null)
        setVerificationStatus(null); setIsOnline(null); setVehicleNumber(null); setDriverPhone(null); setGroup(null)
        setGender(null); setUserPhone(null)
        setExpanded(false)
        if (page !== 1) {
            setPage(1)
            return
        }
        const cleared = { status: null, vehicleClass: null, startDate: null, endDate: null, source: null, cancelledBy: null, verificationStatus: null, group: null, isOnline: null, vehicleNumber: null, driverPhone: null, gender: null, userPhone: null }
        selected === 0 ? searchBooking(null, cleared) : selected === 1 ? searchDrivers(null, cleared) : searchUsers(null, cleared)
    }

    // Rendered twice: inside the toolbar on sm+, pinned under the list on phones.
    // Hidden entirely while the current tab fits on one page.
    const currentTotal = selected === 0 ? totalBookings : selected === 1 ? totalDrivers : totalUsers
    const pagination = (currentTotal ?? 0) <= limit ? null : (
        <div className="flex gap-3 sm:gap-4 items-center justify-center">
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="disabled:opacity-[0.8] disabled:cursor-not-allowed disabled:hover:bg-strong/90 py-2 px-3 flex items-center justify-center gap-1 cursor-pointer text-on-strong bg-strong/90 hover:bg-strong transition-colors duration-300 rounded-xl"><h4>{dc("Prev")}</h4></button>
            <span className="text-ink flex w-fit items-center justify-center gap-2">
                <input
                    type="text"
                    inputMode="numeric"
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitPage() } }}
                    onBlur={commitPage}
                    className="flex text-center justify-center items-center border box-border rounded-lg h-10 w-10 p-0 m-0 bg-transparent leading-none outline-none text-sm sm:text-lg"
                />
                <h4>{dc("of")}</h4>
                <h4 className="flex text-center justify-center items-center border box-border rounded-lg h-10 w-10 p-0 m-0 bg-transparent leading-none text-sm sm:text-lg">{totalPages}</h4>
            </span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="disabled:opacity-[0.8] disabled:cursor-not-allowed disabled:hover:bg-strong/90 py-2 px-3 flex items-center justify-center gap-1 cursor-pointer text-on-strong bg-strong/90 hover:bg-strong transition-colors duration-300 rounded-xl"><h4>{dc("Next")}</h4></button>
        </div>
    )

    const activeBooking = detail?.kind === "booking" ? bookings.find((booking) => booking.id === detail.id) ?? null : null
    const activeDriver = detail?.kind === "driver" ? drivers.find((driver) => driver.id === detail.id) ?? null : null
    const activeUser = detail?.kind === "user" ? users.find((user) => user.id === detail.id) ?? null : null

    const headerActions = selected === FARES_TAB ? null : (
        <form
            onSubmit={(e) => { e.preventDefault(); clearTimeout(debounceRef.current); runSearch() }}
            className="flex items-center justify-end gap-2 max-sm:w-full max-sm:flex-wrap"
        >
            <div className={`flex h-11 w-[min(320px,28vw)] items-center gap-2 rounded-full border-2 px-4 text-ink transition-colors duration-200 max-sm:w-full ${active ? "border-border" : "border-border/40"}`}>
                <Icon path={mdiMagnify} size={0.85} className="shrink-0 text-ink/40" />
                <input
                    onFocus={() => setActive(true)}
                    onBlur={() => setActive(false)}
                    type="text"
                    name={`${selected === 0 ? "booking" : selected === 1 ? "driver" : "user"}`}
                    id={`${selected === 0 ? "booking" : selected === 1 ? "driver" : "user"}`}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={selected === 0 ? dc("Name, phone, location, ID") : selected === 1 ? "Name, phone, vehicle no." : "Name, phone, booking code"}
                    className="min-w-0 flex-1 border-none bg-transparent text-ink outline-none"
                />
            </div>
            <button type="button" onClick={toggleSortOrder} aria-label={order ? dc("Sort oldest first") : dc("Sort newest first")} className="flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-strong/90 px-4 text-on-strong transition-[background-color,transform] duration-150 hover:bg-strong active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <Icon path={order ? mdiSortCalendarDescending : mdiSortCalendarAscending} size={1.05} />
                <h4>{dc("Sort")}</h4>
            </button>
            <button type="button" onClick={() => { setDetail(null); setExpanded(!expanded) }} className="flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-strong/90 px-4 text-on-strong transition-[background-color,transform] duration-150 hover:bg-strong active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                <Icon path={mdiTuneVertical} size={0.95} className="rotate-[90deg]" />
                <h4>{dc("Filter")}</h4>
            </button>
        </form>
    )

    return (
        <AccountLayout
            items={items}
            selected={selected}
            onSelect={(i : number) => { setSelected(i); setPage(1); setFilterSection(0); setDetail(null); setExpanded(false) }}
            title={dc("Admin Dashboard")}
            headerActions={headerActions}
            panelOpen={expanded || detail !== null}
            onPanelClose={() => { setExpanded(false); setDetail(null) }}
        >
            {activeBooking && (
                <DetailModal title={dc("Ride details")} onClose={() => setDetail(null)}>
                    <div className="w-full overflow-hidden rounded-2xl border border-border/50 bg-surface">
                        <div className={`${statusChip(activeBooking.status)} w-full py-2 text-center text-xs font-semibold uppercase tracking-[0.12em]`}>
                            {activeBooking.status.replace(/_/g, " ")}
                        </div>
                        <div className="p-4 sm:p-5">
                            <div className="min-w-0">
                                <h3 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{vehicleLabel(activeBooking.vehicleClass)} {dc("Ride")}</h3>
                                <p className="mt-1 text-sm text-ink-muted">{formatDateTime(activeBooking.scheduledAt ?? activeBooking.createdAt)}</p>
                                <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-ink">₹{activeBooking.fare}</p>
                            </div>

                            <div className="my-4 h-px w-full bg-border/50" />

                            <div>
                                <DetailLabel>{dc("Ride ID")}</DetailLabel>
                                <div className="mt-1 flex items-center gap-2 px-1">
                                    <p className="text-sm font-semibold text-ink">{activeBooking.reference}</p>
                                    <CopyBtn value={activeBooking.reference} onCopy={copyId} />
                                </div>
                            </div>

                            <div className="mt-5 flex flex-col gap-4">
                                <div className="flex items-start gap-3">
                                    <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-strong" />
                                    <div className="min-w-0">
                                        <DetailLabel>{dc("Pickup")}</DetailLabel>
                                        <p className="mt-1 break-words px-1 text-base font-medium text-ink">{activeBooking.pickupAddress}</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <span className="relative mt-1.5 h-3 w-3 shrink-0 rounded-full bg-primary"><span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-on-strong" /></span>
                                    <div className="min-w-0">
                                        <DetailLabel>{dc("Drop")}</DetailLabel>
                                        <p className="mt-1 break-words px-1 text-base font-medium text-ink">{activeBooking.dropAddress}</p>
                                    </div>
                                </div>
                            </div>

                            <div className="mt-5 flex flex-wrap gap-2 pl-6">
                                <FactPill>{activeBooking.source.charAt(0).toUpperCase() + activeBooking.source.slice(1)}</FactPill>
                                {activeBooking.isOutstation && <FactPill>{dc("Outstation")}</FactPill>}
                                {activeBooking.sharing && <FactPill>{dc("Sharing")}</FactPill>}
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <DetailLabel>{dc("People")}</DetailLabel>
                        <DetailCard className="flex flex-col gap-4">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                                <div>
                                    <DetailLabel>{dc("Customer")}</DetailLabel>
                                    <p className="mt-1 px-1 font-semibold text-ink">{activeBooking.user?.name ?? "—"}</p>
                                </div>
                                <div className="flex items-center gap-2 px-1 text-sm text-ink-muted">
                                    <span>{displayPhone(activeBooking.customerPhone)}</span>
                                    <CopyBtn value={displayPhone(activeBooking.customerPhone)} onCopy={copyId} />
                                </div>
                            </div>

                            {activeBooking.sharing && activeBooking.coRiders?.map((rider, index) => (
                                <div key={`${rider.phone}-${index}`} className="border-t border-border/50 pt-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
                                    <div>
                                        <DetailLabel>{dc("Co-rider")}</DetailLabel>
                                        <p className="mt-1 px-1 font-medium text-ink">{rider.name ?? "—"}</p>
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 px-1 text-sm text-ink-muted sm:mt-0">
                                        <span>{displayPhone(rider.phone)}</span>
                                        <CopyBtn value={displayPhone(rider.phone)} onCopy={copyId} />
                                    </div>
                                </div>
                            ))}

                            <div className="border-t border-border/50 pt-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
                                <div>
                                    <DetailLabel>{dc("Driver")}</DetailLabel>
                                    <p className="mt-1 px-1 font-semibold text-ink">
                                        {activeBooking.driver?.name ?? (activeBooking.status === "cancelled" ? "—" : new Date(activeBooking.scheduledAt ?? activeBooking.createdAt) > new Date() ? dc("Yet to be assigned") : dc("Couldn't be assigned"))}
                                    </p>
                                </div>
                                {activeBooking.driver && (
                                    <div className="mt-1 flex items-center gap-2 px-1 text-sm text-ink-muted sm:mt-0">
                                        <span>{displayPhone(activeBooking.driver.phone)}</span>
                                        <CopyBtn value={displayPhone(activeBooking.driver.phone)} onCopy={copyId} />
                                    </div>
                                )}
                            </div>
                        </DetailCard>
                    </div>
                </DetailModal>
            )}

            {activeDriver && (
                <DetailModal title={dc("Driver details")} onClose={() => setDetail(null)}>
                    <div className="w-full overflow-hidden rounded-2xl border border-border/50 bg-surface">
                        <div className={`${verificationChip(activeDriver.verificationStatus)} w-full py-2 text-center text-xs font-semibold uppercase tracking-[0.12em]`}>
                            {activeDriver.verificationStatus.replace(/_/g, " ")}
                        </div>
                        <div className="p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <h3 className="truncate text-2xl font-semibold tracking-[-0.02em] text-ink">{activeDriver.name}</h3>
                                        <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${activeDriver.isOnline ? "bg-green-500" : "bg-border"}`} />
                                    </div>
                                    <div className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
                                        <span>{displayPhone(activeDriver.phone)}</span>
                                        <CopyBtn value={displayPhone(activeDriver.phone)} onCopy={copyId} />
                                    </div>
                                </div>
                                {activeDriver.suspendedAt && <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600">{dc("Suspended")}</span>}
                            </div>

                            <div className="my-4 h-px w-full bg-border/50" />

                            <div className="grid gap-4 sm:grid-cols-2">
                                <div>
                                    <DetailLabel>{dc("Vehicle")}</DetailLabel>
                                    <p className="mt-1 px-1 font-semibold text-ink">{vehicleLabel(activeDriver.vehicleClass)}</p>
                                    <p className="px-1 text-sm text-ink-muted">{activeDriver.vehicleNumber}</p>
                                </div>
                                <div>
                                    <DetailLabel>{dc("Fleet")}</DetailLabel>
                                    <p className="mt-1 px-1 font-semibold text-ink">{activeDriver.group === "rcs" ? dc("RCS fleet") : activeDriver.group === "admin" ? dc("Owner") : dc("Partner captain")}</p>
                                    <p className="px-1 text-sm text-ink-muted">{dc("Joined") + " "}{new Date(activeDriver.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                                </div>
                            </div>

                            {activeDriver.suspensionReason && (
                                <p className="mt-4 rounded-xl bg-red-500/5 px-3 py-2 text-sm text-red-700">{activeDriver.suspensionReason}</p>
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-2">
                        <DetailLabel>{dc("Wallet, payouts and reconciliation")}</DetailLabel>
                        <DetailCard>
                            <DriverFinancePanel driverId={activeDriver.id} />
                        </DetailCard>
                    </div>

                    <div className="flex flex-col gap-2">
                        <DetailLabel>{dc("Paperwork and captain review")}</DetailLabel>
                        <DetailCard>
                            <DriverReview
                                driverId={activeDriver.id}
                                onVerificationChange={(status) => setDrivers((current) => current.map((driver) => driver.id === activeDriver.id ? { ...driver, verificationStatus: status } : driver))}
                                onGroupChange={(group) => setDrivers((current) => current.map((driver) => driver.id === activeDriver.id ? { ...driver, group } : driver))}
                            />
                        </DetailCard>
                    </div>
                </DetailModal>
            )}

            {activeUser && (
                <DetailModal title={dc("User details")} onClose={() => setDetail(null)}>
                    <div className="w-full overflow-hidden rounded-2xl border border-border/50 bg-surface">
                        <div className="flex w-full items-center justify-center gap-2 bg-surface-muted py-2 text-center text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">
                            <span>{dc("Booking code")}: {activeUser.bookingCode}</span>
                            <CopyBtn value={activeUser.bookingCode} onCopy={copyId} />
                        </div>
                        <div className="p-4 sm:p-5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <h3 className="truncate text-2xl font-semibold tracking-[-0.02em] text-ink">{activeUser.name ?? "—"}</h3>
                                    <div className="mt-1 flex items-center gap-2 text-sm text-ink-muted">
                                        <span>{displayPhone(activeUser.phone)}</span>
                                        <CopyBtn value={displayPhone(activeUser.phone)} onCopy={copyId} />
                                    </div>
                                </div>
                                {activeUser.deletedAt && <span className="shrink-0 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-semibold text-red-600">{dc("Deleted")}</span>}
                            </div>

                            <div className="my-4 h-px w-full bg-border/50" />

                            <div className="grid gap-4 sm:grid-cols-3">
                                <div>
                                    <DetailLabel>{dc("Gender")}</DetailLabel>
                                    <p className="mt-1 px-1 font-semibold text-ink">{activeUser.gender ?? "—"}</p>
                                </div>
                                <div>
                                    <DetailLabel>{dc("Rides")}</DetailLabel>
                                    <p className="mt-1 px-1 font-semibold text-ink">{activeUser._count.bookings}</p>
                                </div>
                                <div>
                                    <DetailLabel>{dc("Joined")}</DetailLabel>
                                    <p className="mt-1 px-1 font-semibold text-ink">{new Date(activeUser.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </DetailModal>
            )}

            {selected === FARES_TAB ? (
                <Suspense
                    fallback={
                        <div className="w-full flex-1 min-h-0 flex items-center justify-center px-5 max-sm:px-0">
                            <p className="text-sm text-ink-muted">{dc("Map load ho raha hai…")}</p>
                        </div>
                    }
                >
                    <EditFares />
                </Suspense>
            ) : (
            <>
            {filterDropdown.mounted && (
                <section
                    role="dialog"
                    aria-modal="true"
                    aria-label={dc("Filters")}
                    className={`${filterDropdown.closing ? "animate-datetime-out" : "animate-datetime"} z-200 flex overflow-hidden bg-surface-muted text-ink shadow-2xl motion-reduce:animate-none max-sm:fixed max-sm:inset-0 max-sm:h-dvh max-sm:w-screen max-sm:rounded-none sm:absolute sm:left-1/2 sm:top-1/2 sm:max-h-[calc(100dvh-48px)] sm:w-[680px] sm:max-w-[calc(100vw-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border/60`}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex h-full min-h-0 w-full flex-col text-left sm:h-auto">
                        <div className="flex min-h-0 flex-1 items-stretch gap-3 p-3 sm:min-h-[360px] sm:max-h-[70vh] sm:p-4">
                            {/* Settings-style section list: quiet rows, a filled active item, and a single divider. */}
                            <nav className="w-[43%] shrink-0 overflow-y-auto border-r border-border/50 pr-2 sm:w-[210px] sm:pr-3" aria-label={dc("Filter sections")}>
                                <div className="flex flex-col gap-1">
                                    {sections.map((s, i) => (
                                        <button
                                            type="button"
                                            key={s}
                                            onClick={() => setFilterSection(i)}
                                            aria-current={i === sectionIndex ? "page" : undefined}
                                            className={`flex w-full cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${i === sectionIndex
                                                ? "bg-surface font-semibold text-ink"
                                                : "text-ink-muted hover:bg-surface/70 hover:text-ink"}`}
                                        >
                                            <Icon path={filterSectionIcons[s] ?? mdiTuneVertical} size={0.82} className="shrink-0" />
                                            <span className="min-w-0 truncate">{s}</span>
                                        </button>
                                    ))}
                                </div>
                            </nav>
                            {/* Active section's options */}
                            <div className="min-w-0 flex-1 overflow-y-auto rounded-2xl border border-border/50 bg-surface p-4 sm:p-5">
                                <div className="flex min-h-full flex-col gap-3">
                                <h4 className="text-base font-semibold text-ink">{sections[sectionIndex]}</h4>
                                {selected === 0 ? (
                                    <>
                                        {sectionIndex === 0 && <Chips options={bookingStatuses.map(s => ({ value: s, label: s.replace("_", " ") }))} value={status} onChange={setStatus} />}
                                        {sectionIndex === 1 && <Chips options={vehicleOptions} value={vehicleClass} onChange={setVehicleClass} />}
                                        {sectionIndex === 2 && (
                                            <>
                                                <label className={filterLabel}>{dc("Start date")}</label>
                                                <input type="text" value={startDate ?? ""} onChange={(e) => setStartDate(e.target.value || null)} placeholder={dc("YYYY-MM-DD")} className={filterField} />
                                                <label className={filterLabel}>{dc("End date")}</label>
                                                <input type="text" value={endDate ?? ""} onChange={(e) => setEndDate(e.target.value || null)} placeholder={dc("YYYY-MM-DD")} className={filterField} />
                                            </>
                                        )}
                                        {sectionIndex === 3 && <Chips options={[{ value: "website", get "label"() { return dc("Website"); } }, { value: "whatsapp", label: "WhatsApp" }, { value: "admin", get "label"() { return dc("Admin"); } }]} value={source} onChange={setSource} />}
                                        {sectionIndex === 4 && <Chips options={[{ value: "user", get "label"() { return dc("User"); } }, { value: "driver", get "label"() { return dc("Driver"); } }, { value: "admin", get "label"() { return dc("Admin"); } }]} value={cancelledBy} onChange={setCancelledBy} />}
                                    </>
                                ) : selected === 1 ? (
                                    <>
                                        {sectionIndex === 0 && <Chips options={vehicleOptions} value={vehicleClass} onChange={setVehicleClass} />}
                                        {sectionIndex === 1 && <Chips options={[{ value: "pending", get "label"() { return dc("Pending"); } }, { value: "approved", get "label"() { return dc("Approved"); } }, { value: "rejected", get "label"() { return dc("Rejected"); } }]} value={verificationStatus} onChange={setVerificationStatus} />}
                                        {/* "Owner" is one row and is offered anyway:
                                            filtering to it is the quickest way to
                                            check the hold has somebody to hold for. */}
                                        {sectionIndex === 2 && <Chips options={[{ value: "rcs", get "label"() { return dc("RCS fleet"); } }, { value: "partner", get "label"() { return dc("Partner"); } }, { value: "admin", get "label"() { return dc("Owner"); } }]} value={group} onChange={setGroup} />}
                                        {sectionIndex === 3 && <Chips options={[{ value: true, get "label"() { return dc("Online"); } }, { value: false, get "label"() { return dc("Offline"); } }]} value={isOnline} onChange={setIsOnline} />}
                                        {sectionIndex === 4 && <input type="text" value={vehicleNumber ?? ""} onChange={(e) => setVehicleNumber(e.target.value || null)} placeholder={dc("e.g. UP32 AB 1234")} className={filterField} />}
                                        {sectionIndex === 5 && <input type="tel" value={driverPhone ?? ""} onChange={(e) => setDriverPhone(e.target.value || null)} placeholder={dc("XXXXX XXXXX")} className={filterField} />}
                                        {sectionIndex === 6 && (
                                            <>
                                                <label className={filterLabel}>{dc("From")}</label>
                                                <input type="text" value={startDate ?? ""} onChange={(e) => setStartDate(e.target.value || null)} placeholder={dc("YYYY-MM-DD")} className={filterField} />
                                                <label className={filterLabel}>{dc("To")}</label>
                                                <input type="text" value={endDate ?? ""} onChange={(e) => setEndDate(e.target.value || null)} placeholder={dc("YYYY-MM-DD")} className={filterField} />
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {sectionIndex === 0 && <Chips options={genderOptions} value={gender} onChange={setGender} />}
                                        {sectionIndex === 1 && <input type="tel" value={userPhone ?? ""} onChange={(e) => setUserPhone(e.target.value || null)} placeholder={dc("XXXXX XXXXX")} className={filterField} />}
                                        {sectionIndex === 2 && (
                                            <>
                                                <label className={filterLabel}>{dc("From")}</label>
                                                <input type="text" value={startDate ?? ""} onChange={(e) => setStartDate(e.target.value || null)} placeholder={dc("YYYY-MM-DD")} className={filterField} />
                                                <label className={filterLabel}>{dc("To")}</label>
                                                <input type="text" value={endDate ?? ""} onChange={(e) => setEndDate(e.target.value || null)} placeholder={dc("YYYY-MM-DD")} className={filterField} />
                                            </>
                                        )}
                                    </>
                                )}
                                </div>
                            </div>
                        </div>
                        <div className="flex w-full shrink-0 gap-2 border-t border-border/50 px-3 py-3 sm:px-4 sm:py-4">
                            <button type="button" onClick={clearFilters} className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-border/60 bg-surface py-2.5 text-sm font-medium text-ink transition-[background-color,transform] duration-150 ease-out hover:bg-surface/70 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{dc("Clear")}</button>
                            <button type="button" onClick={applyFilters} className="flex flex-1 cursor-pointer items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-semibold text-on-strong transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{dc("Apply")}</button>
                        </div>
                    </div>
                </section>
            )}
            {pagination && <div className="hidden w-full justify-end px-5 sm:flex">{pagination}</div>}

            <div
                className={`${copied ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"} flex justify-center items-center w-[230px] fixed z-100 left-1/2 -translate-x-1/2 bottom-8 sm:bottom-10 bg-primary text-on-strong text-sm font-semibold px-5 py-3 rounded-full shadow-lg flex items-center gap-2 transition-[opacity,transform] duration-300`}
            >
                <Icon path={mdiContentCopy} size={0.7} />{dc("Copied to clipboard")}</div>

            <div className="w-full min-w-0 max-w-full flex-1 min-h-0 overflow-x-hidden overflow-y-auto mt-4 px-5 max-sm:px-0">
                {loading ? (
                    <AdminDashboardSkeleton variant={selected === 0 ? "bookings" : selected === 1 ? "drivers" : "users"} />
                ) : error ? (
                    <FailureState
                        tone="light"
                        title={dc("Couldn't load {{value0}}", {value0: (entity)})}
                        detail={error}
                        onRetry={refetch}
                    />
                ) : selected === 0 ? (
                    bookings.length === 0 ? (
                        filtersActive ? (
                            <EmptyState
                                tone="light"
                                glyph="search"
                                title={emptyCopy.title}
                                message={emptyCopy.message}
                                secondaryAction={emptyEscape}
                            />
                        ) : (
                            <EmptyState
                                tone="light"
                                title={dc("No bookings yet")}
                                message={dc("Rides booked from the website, over WhatsApp, or by an admin all land here.")}
                            />
                        )
                    ) : (
                        <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                        {bookings.map((booking) => {
                            const [pickupMain] = splitAddress(booking.pickupAddress)
                            const [dropMain] = splitAddress(booking.dropAddress)
                            const when = listDateParts(booking.scheduledAt ?? booking.createdAt)
                            const customerName = booking.user?.name ?? displayPhone(booking.customerPhone)
                            return (
                                <button
                                    type="button"
                                    key={booking.id}
                                    onClick={() => { setExpanded(false); setDetail({ kind: "booking", id: booking.id }) }}
                                    className={collapsedBookingCardClass}
                                >
                                    <div className="flex min-h-[7.75rem] flex-col gap-3">
                                        <div className="flex items-center gap-3">
                                            <img
                                                src={angledVehicleImageOf(booking.vehicleClass)}
                                                alt={dc("{{value0}} vehicle", { value0: vehicleLabel(booking.vehicleClass) })}
                                                className="h-16 w-24 shrink-0 object-contain sm:h-20 sm:w-28"
                                            />
                                            <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                                <span className={`${statusChip(booking.status)} rounded-lg px-2 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.06em]`}>{booking.status.replace("_", " ")}</span>
                                                <span className="text-xs text-ink-muted">{when.day} • {when.time}</span>
                                                {booking.sharing && <span className="text-xs text-ink-muted">• {dc("Sharing")}</span>}
                                            </div>
                                            <p className="mt-3 truncate text-lg font-semibold leading-tight text-ink">{dropMain}</p>
                                            <p className="mt-1 truncate text-sm text-ink-muted">{dc("from") + " "}{pickupMain}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="mt-3 flex items-baseline gap-2">
                                                <p className="font-semibold text-ink">₹{booking.fare.toLocaleString("en-IN")}</p>
                                                <p className="text-xs text-ink-muted">{vehicleLabel(booking.vehicleClass)}</p>
                                            </div>
                                            <div className="mt-3 grid min-w-0 grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
                                                <div className="min-w-0">
                                                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-muted">{dc("Customer")}</p>
                                                    <p className="mt-0.5 truncate text-sm font-semibold leading-tight text-ink">{customerName}</p>
                                                    {booking.user?.name && <p className="mt-0.5 truncate text-xs leading-tight text-ink-muted">{displayPhone(booking.customerPhone)}</p>}
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-muted">{dc("Driver")}</p>
                                                    <p className="mt-0.5 truncate text-sm font-semibold leading-tight text-ink">{booking.driver ? booking.driver.name : dc("Unassigned")}</p>
                                                    {booking.driver && <p className="mt-0.5 truncate text-xs leading-tight text-ink-muted">{displayPhone(booking.driver.phone)}</p>}
                                                </div>
                                            </div>


                                        </div>
                                    </div>
                                </button>
                            )
                        })
                        }</div>
                    )
                ) : selected === 1 ? (
                    drivers.length === 0 ? (
                        filtersActive ? (
                            <EmptyState
                                tone="light"
                                glyph="search"
                                title={emptyCopy.title}
                                message={emptyCopy.message}
                                secondaryAction={emptyEscape}
                            />
                        ) : (
                            <EmptyState
                                tone="light"
                                title={dc("No drivers registered yet")}
                                message={dc("Drivers appear here once they sign up and submit their vehicle details for approval.")}
                            />
                        )
                    ) : (
                        <div className={collapsedListGridClass}>
                        {drivers.map((driver) => (
                            <button
                                type="button"
                                key={driver.id}
                                onClick={() => { setExpanded(false); setDetail({ kind: "driver", id: driver.id }) }}
                                data-suspended={Boolean(driver.suspendedAt)}
                                className={collapsedCardClass}
                            >
                                <div className="flex min-w-0 items-center gap-3">
                                    {driver.photoUrl ? (
                                        <img src={driver.photoUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover sm:h-14 sm:w-14" />
                                    ) : (
                                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-on-primary sm:h-14 sm:w-14">
                                            {driverInitials(driver.name)}
                                        </div>
                                    )}
                                    <div className="min-w-0">
                                        <p className="truncate text-base font-semibold leading-5 text-ink">{driver.name}</p>
                                        <p className="mt-0.5 truncate text-sm leading-5 text-ink-muted">{displayPhone(driver.phone)}</p>
                                    </div>
                                    <div className="ml-auto min-w-0 shrink-0 text-right">
                                        <p className="max-w-32 truncate text-sm font-semibold leading-5 text-ink">{driver.vehicleNumber}</p>
                                        <p className="mt-0.5 flex items-center justify-end gap-1.5 text-xs font-medium leading-5 text-ink-muted">
                                            <span aria-hidden="true" className={`h-2 w-2 rounded-full ${driver.isOnline ? "bg-green-500" : "bg-border"}`} />
                                            <span className="text-sm">{driver.isOnline ? dc("Online") : dc("Offline")}</span>
                                        </p>
                                    </div>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-border/50 pt-2.5 text-xs text-ink-muted">
                                    <span className={`${verificationChip(driver.verificationStatus)} shrink-0 rounded-lg px-2.5 py-1 font-semibold uppercase tracking-[0.06em]`}>{driver.verificationStatus}</span>
                                    {driver.suspendedAt && <span className="shrink-0 rounded-lg bg-red-500/10 px-2.5 py-1 font-semibold uppercase tracking-[0.06em] text-red-600">{dc("Suspended")}</span>}
                                    {fleetBadge(driver.group)}
                                    <span>{dc("Joined") + " "}{new Date(driver.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                                    <Icon className="ml-auto shrink-0 text-ink-muted" path={mdiChevronRight} size={0.72} />
                                </div>
                            </button>
                        ))}
                        </div>
                    )
                ) : (
                    users.length === 0 ? (
                        filtersActive ? (
                            <EmptyState
                                tone="light"
                                glyph="search"
                                title={emptyCopy.title}
                                message={emptyCopy.message}
                                secondaryAction={emptyEscape}
                            />
                        ) : (
                            <EmptyState
                                tone="light"
                                title={dc("No users yet")}
                                message={dc("Anyone who signs up on the website or books over WhatsApp appears here.")}
                            />
                        )
                    ) : (
                        <div className={collapsedListGridClass}>
                        {users.map((user) => (
                            <button
                                type="button"
                                key={user.id}
                                onClick={() => { setExpanded(false); setDetail({ kind: "user", id: user.id }) }}
                                className={collapsedCardClass}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-lg font-semibold text-on-primary">{(user.name ?? "U").charAt(0).toUpperCase()}</div>
                                    <div className="min-w-0 flex-1">
                                        <p className="truncate text-lg font-semibold leading-6 tracking-[-0.01em] text-ink">{user.name ?? dc("Unnamed user")}</p>
                                        <p className="mt-0.5 truncate text-sm leading-5 text-ink-muted">{displayPhone(user.phone)}</p>
                                    </div>
                                    <span aria-hidden="true" className="h-10 w-px shrink-0 bg-border/60" />
                                    <div className="min-w-[5.25rem] shrink-0 text-right">
                                        <p className="font-semibold text-ink">{user._count.bookings}</p>
                                        <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-muted">{user._count.bookings === 1 ? dc("Ride") : dc("Rides")}</p>
                                    </div>
                                </div>

                                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border/50 pt-3 text-xs text-ink-muted">
                                    {user.deletedAt && <span className="shrink-0 rounded-lg bg-red-500/10 px-2.5 py-1 font-semibold uppercase tracking-[0.06em] text-red-600">{dc("Deleted")}</span>}
                                    {user.gender && <span>{user.gender}</span>}
                                    <span>{dc("Joined") + " "}{new Date(user.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</span>
                                    <Icon className="ml-auto shrink-0 text-ink-muted" path={mdiChevronRight} size={0.72} />
                                </div>
                            </button>
                        ))}
                        </div>
                    )
                )}
            </div>
            {pagination && <div className="sm:hidden w-full flex justify-center pt-3">{pagination}</div>}
            </>
            )}
        </AccountLayout>
    )
}

export default AdminDashboard


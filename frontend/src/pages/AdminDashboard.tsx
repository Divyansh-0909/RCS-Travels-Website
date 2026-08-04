import AccountLayout from "../components/ui/AccountLayout"
import { act, lazy, Suspense, useEffect, useRef, useState } from "react"
import Icon from '@mdi/react';
import { mdiMagnify, mdiTuneVertical, mdiSortCalendarDescending, mdiContentCopy, mdiSortCalendarAscending } from '@mdi/js';
import { useApi } from "../hooks/useApi";
import { useExitAnim } from "../hooks/useExitAnim";
import AdminDashboardSkeleton from "../components/AdminDashboardSkeleton";
import { vehicleLabel, statusChip, splitAddress, displayPhone, formatDateTime, CopyBtn } from "../components/ui/bookingDisplay";
import Button from "../components/ui/Button";
import EmptyState from "../components/ui/EmptyState";
import FailureState from "../components/ui/FailureState";
import Chips, { filterLabel, filterField } from "../components/ui/Chips";
import { VerificationStatus, BookingStatus, CancelledBy, BookingSource, VehicleClass } from "../types/enums";
import { VEHICLE_CLASS_NAMES } from "../constants/vehicles";


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

const bookingStatuses: BookingStatus[] = ["pending", "confirmed", "assigned", "en_route", "reached", "started", "completed", "cancelled", "no_driver"]

// Shapes returned by the admin API (backend/routes/admin.ts); DateTimes arrive as ISO strings.
type Booking = {
    id: string
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
    isOnline: boolean
    verificationStatus: VerificationStatus
    vehicleClass: VehicleClass
    vehicleNumber: string
    createdAt: string
}

type User = {
    id: string
    name: string | null
    phone: string
    gender: string | null
    bookingCode: string
    createdAt: string
    deletedAt: string | null
    _count: { bookings: number }
}

// One chip per car.
// constants/vehicles.js is plain JS, so its keys widen to string — the cast puts
// them back on the enum the filter state and the API both expect.
const vehicleOptions = VEHICLE_CLASS_NAMES.map(cls => ({ value: cls as VehicleClass, label: vehicleLabel(cls) }))
const bookingSections = ["Status", "Vehicle type", "Dates", "Source", "Cancelled by"]
const driverSections = ["Vehicle type", "Verification", "Availability", "Vehicle number", "Driver phone", "Joined"]
const userSections = ["Gender", "User phone", "Joined"]
// Same values ManageAccount writes, so the filter matches what's stored
const genderOptions = ["Male", "Female", "Others", "Rather not say"].map(g => ({ value: g, label: g }))

const AdminDashboard = () => {
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

    // Whether the results list is scrolled off its top — drives the top fade,
    // which must stay invisible while the first row is still in place.
    const [listScrolled, setListScrolled] = useState(false)
    // Booking card whose people/ride-id details are popped open (one at a time).
    const [expandedBooking, setExpandedBooking] = useState<string | null>(null)

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
            const data = await api.getBookings({ search: searchParam, status, startDate, endDate, customerPhone, customerName, driverName, vehicleClass, source, isOutstation, cancelledBy, page, limit, ...overrides })
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
            const data = await api.getDrivers({ search: searchParam, driverName, driverPhone, vehicleClass, vehicleNumber, verificationStatus, isOnline, startDate, endDate, page, limit, ...overrides })
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
            const data = await api.getUsers({ search: searchParam, userName: customerName, userPhone, gender, startDate, endDate, page, limit, ...overrides })
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
            ? !!(vehicleClass || vehicleNumber || driverPhone || verificationStatus || startDate || endDate) || isOnline !== null
            : !!(gender || userPhone || startDate || endDate)
    const filtersActive = !!searchParam || tabFiltersActive

    // Clearing filters is only an escape route when some are set; searching is
    // handled by clearing the box, so that gets its own action below.
    const emptyEscape = tabFiltersActive
        ? { label: "Clear all filters", onClick: clearFilters }
        : searchParam
            ? { label: "Clear search", onClick: () => setSearch("") }
            : undefined

    const entity = selected === 0 ? "bookings" : selected === 1 ? "drivers" : "users"

    // Copy follows whichever narrowed the list, so a search-only miss isn't told
    // to "drop a filter" it never set. Defined once — all three tabs share it.
    const emptyCopy = tabFiltersActive
        ? {
            title: `No ${entity} match those filters`,
            message: "Try widening the date range, or drop a filter and search again.",
        }
        : {
            title: `No ${entity} match your search`,
            message: "Check the spelling, or try a phone number or ID instead.",
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
        setVerificationStatus(null); setIsOnline(null); setVehicleNumber(null); setDriverPhone(null)
        setGender(null); setUserPhone(null)
        setExpanded(false)
        if (page !== 1) {
            setPage(1)
            return
        }
        const cleared = { status: null, vehicleClass: null, startDate: null, endDate: null, source: null, cancelledBy: null, verificationStatus: null, isOnline: null, vehicleNumber: null, driverPhone: null, gender: null, userPhone: null }
        selected === 0 ? searchBooking(null, cleared) : selected === 1 ? searchDrivers(null, cleared) : searchUsers(null, cleared)
    }

    // Rendered twice: inside the toolbar on sm+, pinned under the list on phones.
    // Hidden entirely while the current tab fits on one page.
    const currentTotal = selected === 0 ? totalBookings : selected === 1 ? totalDrivers : totalUsers
    const pagination = (currentTotal ?? 0) <= limit ? null : (
        <div className="flex gap-3 sm:gap-4 items-center justify-center">
            <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="disabled:opacity-[0.8] disabled:cursor-not-allowed disabled:hover:bg-[var(--background)]/90 py-2 px-3 flex items-center justify-center gap-1 cursor-pointer text-[var(--text)] bg-[var(--background)]/90 hover:bg-[var(--background)] transition-color duration-300 rounded-xl"><h4>Prev</h4></button>
            <span className="text-[var(--text-foreground)] flex w-fit items-center justify-center gap-2">
                <input
                    type="text"
                    inputMode="numeric"
                    value={pageInput}
                    onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitPage() } }}
                    onBlur={commitPage}
                    className="flex text-center justify-center items-center border box-border rounded-lg h-10 w-10 p-0 m-0 bg-transparent leading-none outline-none text-sm sm:text-lg"
                />
                <h4>of</h4>
                <h4 className="flex text-center justify-center items-center border box-border rounded-lg h-10 w-10 p-0 m-0 bg-transparent leading-none text-sm sm:text-lg">{totalPages}</h4>
            </span>
            <button type="button" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="disabled:opacity-[0.8] disabled:cursor-not-allowed disabled:hover:bg-[var(--background)]/90 py-2 px-3 flex items-center justify-center gap-1 cursor-pointer text-[var(--text)] bg-[var(--background)]/90 hover:bg-[var(--background)] transition-color duration-300 rounded-xl"><h4>Next</h4></button>
        </div>
    )

    return (
        <AccountLayout
            items={items}
            selected={selected}
            onSelect={(i : number) => { setSelected(i); setPage(1); setFilterSection(0); setListScrolled(false) }}
            title="Admin Dashboard"
            panelOpen={expanded}
            onPanelClose={() => setExpanded(false)}
        >
            {selected === FARES_TAB ? (
                <Suspense
                    fallback={
                        <div className="w-full flex-1 min-h-0 flex items-center justify-center px-5 max-sm:px-0">
                            <p className="text-sm text-gray-500">Map load ho raha hai…</p>
                        </div>
                    }
                >
                    <EditFares />
                </Suspense>
            ) : (
            <>
            {filterDropdown.mounted && (
                <Button
                    prop={{
                        variant: "dropdown",
                        width: "380px",
                        paddingX: "0px",
                        innerClassName: "justify-start max-sm:w-full! max-sm:h-full!",
                    }}
                    className={`block ${filterDropdown.closing ? "animate-datetime-out" : "animate-datetime"} z-200 max-sm:fixed max-sm:inset-0 max-sm:my-0 max-sm:w-screen! max-sm:h-dvh! max-sm:rounded-none! sm:absolute sm:scale-[1.1] sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 active:opacity-[1] hover:opacity-[1]`}
                >
                    <div
                        className="flex flex-col w-full py-3 text-left max-sm:h-full"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex w-full items-stretch h-[360px] max-h-[70vh] max-sm:h-auto max-sm:max-h-none max-sm:flex-1 max-sm:min-h-0">
                            {/* Section list */}
                            <div className="w-[38%] shrink-0 flex flex-col border-r border-[var(--foreground)]/15 overflow-y-auto">
                                {sections.map((s, i) => (
                                    <div
                                        key={s}
                                        onClick={() => setFilterSection(i)}
                                        className={`py-3 pl-5 pr-3 text-sm cursor-pointer select-none border-b border-[var(--foreground)]/10 border-l-[3px] transition-colors duration-300 ${i === sectionIndex
                                            ? "text-[var(--text)] font-semibold bg-[var(--foreground)]/15 border-l-primary"
                                            : "text-[var(--text-muted)] border-l-transparent hover:bg-[var(--foreground)]/5"}`}
                                    >
                                        {s}
                                    </div>
                                ))}
                            </div>
                            {/* Active section's options */}
                            <div className="flex-1 min-w-0 flex flex-col gap-3 px-4 py-1 overflow-y-auto">
                                <h4 className="font-semibold text-base">{sections[sectionIndex]}</h4>
                                {selected === 0 ? (
                                    <>
                                        {sectionIndex === 0 && <Chips options={bookingStatuses.map(s => ({ value: s, label: s.replace("_", " ") }))} value={status} onChange={setStatus} />}
                                        {sectionIndex === 1 && <Chips options={vehicleOptions} value={vehicleClass} onChange={setVehicleClass} />}
                                        {sectionIndex === 2 && (
                                            <>
                                                <label className={filterLabel}>Start date</label>
                                                <input type="text" value={startDate ?? ""} onChange={(e) => setStartDate(e.target.value || null)} placeholder="YYYY-MM-DD" className={filterField} />
                                                <label className={filterLabel}>End date</label>
                                                <input type="text" value={endDate ?? ""} onChange={(e) => setEndDate(e.target.value || null)} placeholder="YYYY-MM-DD" className={filterField} />
                                            </>
                                        )}
                                        {sectionIndex === 3 && <Chips options={[{ value: "website", label: "Website" }, { value: "whatsapp", label: "WhatsApp" }, { value: "admin", label: "Admin" }]} value={source} onChange={setSource} />}
                                        {sectionIndex === 4 && <Chips options={[{ value: "user", label: "User" }, { value: "driver", label: "Driver" }, { value: "admin", label: "Admin" }]} value={cancelledBy} onChange={setCancelledBy} />}
                                    </>
                                ) : selected === 1 ? (
                                    <>
                                        {sectionIndex === 0 && <Chips options={vehicleOptions} value={vehicleClass} onChange={setVehicleClass} />}
                                        {sectionIndex === 1 && <Chips options={[{ value: "pending", label: "Pending" }, { value: "approved", label: "Approved" }, { value: "rejected", label: "Rejected" }]} value={verificationStatus} onChange={setVerificationStatus} />}
                                        {sectionIndex === 2 && <Chips options={[{ value: true, label: "Online" }, { value: false, label: "Offline" }]} value={isOnline} onChange={setIsOnline} />}
                                        {sectionIndex === 3 && <input type="text" value={vehicleNumber ?? ""} onChange={(e) => setVehicleNumber(e.target.value || null)} placeholder="e.g. UP32 AB 1234" className={filterField} />}
                                        {sectionIndex === 4 && <input type="tel" value={driverPhone ?? ""} onChange={(e) => setDriverPhone(e.target.value || null)} placeholder="XXXXX XXXXX" className={filterField} />}
                                        {sectionIndex === 5 && (
                                            <>
                                                <label className={filterLabel}>From</label>
                                                <input type="text" value={startDate ?? ""} onChange={(e) => setStartDate(e.target.value || null)} placeholder="YYYY-MM-DD" className={filterField} />
                                                <label className={filterLabel}>To</label>
                                                <input type="text" value={endDate ?? ""} onChange={(e) => setEndDate(e.target.value || null)} placeholder="YYYY-MM-DD" className={filterField} />
                                            </>
                                        )}
                                    </>
                                ) : (
                                    <>
                                        {sectionIndex === 0 && <Chips options={genderOptions} value={gender} onChange={setGender} />}
                                        {sectionIndex === 1 && <input type="tel" value={userPhone ?? ""} onChange={(e) => setUserPhone(e.target.value || null)} placeholder="XXXXX XXXXX" className={filterField} />}
                                        {sectionIndex === 2 && (
                                            <>
                                                <label className={filterLabel}>From</label>
                                                <input type="text" value={startDate ?? ""} onChange={(e) => setStartDate(e.target.value || null)} placeholder="YYYY-MM-DD" className={filterField} />
                                                <label className={filterLabel}>To</label>
                                                <input type="text" value={endDate ?? ""} onChange={(e) => setEndDate(e.target.value || null)} placeholder="YYYY-MM-DD" className={filterField} />
                                            </>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                        <div className="w-full flex gap-2 px-3 pt-3 mt-3 border-t border-[var(--foreground)]/10">
                            <div onClick={clearFilters} className="flex-1 flex justify-center items-center py-2 rounded-xl border border-[var(--foreground)]/30 text-sm cursor-pointer hover:bg-[var(--foreground)]/10 transition-colors duration-300">Clear</div>
                            <div onClick={applyFilters} className="flex-1 flex justify-center items-center py-2 rounded-xl bg-primary text-[var(--foreground)] text-sm font-semibold cursor-pointer hover:opacity-[0.9] transition-opacity duration-300">Apply</div>
                        </div>
                    </div>
                </Button>
            )}
            <form onSubmit={(e) => { e.preventDefault(); clearTimeout(debounceRef.current); runSearch() }} className="flex w-full flex-wrap justify-between px-5 max-sm:px-0 gap-2 gap-y-3 items-center">
                <div className="flex w-fit max-sm:w-full max-sm:flex-wrap justify-start gap-2 items-center">
                    <div className={`flex justify-start gap-1 items-center rounded-xl py-5 px-3 w-[20vw] max-sm:w-full ${active ? "border-[var(--background-muted)]" : "border-[var(--background-muted)]/40"} h-[5vh] text-[var(--text-foreground)] transition-all duration-300 border-2`}>
                        <Icon path={mdiMagnify} size={0.9} className="cursor-pointer text-sm sm:text-lg hover:text-[var(--text-foreground)] transition-color duration-300 text-[var(--text-foreground)]/40" />
                        <input
                            onFocus={() => setActive(true)}
                            onBlur={() => setActive(false)}
                            type="text"
                            name={`${selected === 0 ? "booking" : selected === 1 ? "driver" : "user"}`}
                            id={`${selected === 0 ? "booking" : selected === 1 ? "driver" : "user"}`}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder={selected === 0 ? "Name, phone, location, ID" : selected === 1 ? "Name, phone, vehicle no." : "Name, phone, booking code"}
                            className={`w-[95%] h-[5vh] text-[var(--text-foreground)]  outline-none border-none`}
                        />
                    </div>
                    <button onClick={(e) => { e.preventDefault(); setOrder(!order); }} className="py-2 px-3 flex items-center justify-center gap-1 cursor-pointer text-[var(--text)] bg-[var(--background)]/90 hover:bg-[var(--background)] transition-color duration-300 rounded-xl">
                        <Icon path={order ? mdiSortCalendarDescending : mdiSortCalendarAscending} size={1.1} />
                        <h4>Sort</h4>
                    </button>
                    <button onClick={(e) => { e.preventDefault(); setExpanded(!expanded); }} className="py-2 px-3 flex items-center justify-center gap-1 cursor-pointer text-[var(--text)] bg-[var(--background)]/90 hover:bg-[var(--background)] transition-color duration-300 rounded-xl">
                        <Icon path={mdiTuneVertical} size={1} className="rotate-[90deg]" />
                        <h4>Filter</h4>
                    </button>
                </div>
                {pagination && <div className="max-sm:hidden">{pagination}</div>}
            </form>

            <div
                className={`${copied ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"} flex justify-center items-center w-[230px] fixed z-100 left-1/2 -translate-x-1/2 bottom-8 sm:bottom-10 bg-primary text-[var(--foreground)] text-sm font-semibold px-5 py-3 rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.25)] flex items-center gap-2 transition-[opacity,transform] duration-300`}
            >
                <Icon path={mdiContentCopy} size={0.7} />
                Copied to clipboard
            </div>

            <div onScroll={(e) => setListScrolled(e.currentTarget.scrollTop > 4)} className="w-full flex-1 min-h-0 overflow-y-auto mt-4 px-5 max-sm:px-0">
                {/* Top fade — sticky so it hugs the scroll edge; hidden until the list is actually scrolled. */}
                <div aria-hidden="true" className={`${listScrolled ? "opacity-100" : "opacity-0"} pointer-events-none sticky top-0 z-10 h-14 -mb-14 w-full bg-gradient-to-b from-[var(--foreground)] to-transparent transition-opacity duration-300`} />
                {loading ? (
                    <AdminDashboardSkeleton variant={selected === 0 ? "bookings" : selected === 1 ? "drivers" : "users"} />
                ) : error ? (
                    <FailureState
                        tone="light"
                        title={`Couldn't load ${entity}`}
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
                                title="No bookings yet"
                                message="Rides booked from the website, over WhatsApp, or by an admin all land here."
                            />
                        )
                    ) : (
                        (order ? bookings : [...bookings].reverse()).map((booking) => {
                            const [pickupMain, pickupRest] = splitAddress(booking.pickupAddress)
                            const [dropMain, dropRest] = splitAddress(booking.dropAddress)
                            const isOpen = expandedBooking === booking.id
                            return (
                                <div key={booking.id} onClick={() => setExpandedBooking(isOpen ? null : booking.id)} className={`${booking.status === "cancelled" ? "opacity-60" : ""} cursor-pointer bg-[var(--foreground-muted)] py-5 px-5 sm:py-6 sm:px-8 rounded-2xl my-4 sm:my-6 flex flex-col justify-center items-start gap-4`}>
                                    <div className="flex justify-between items-start gap-4 w-full">
                                        {/* Route: pickup → drop */}
                                        <div className="flex flex-col gap-3 min-w-0">
                                            <div className="flex items-center gap-3">
                                                <div className="w-3 h-3 rounded-full bg-[var(--background-primary)] shrink-0"></div>
                                                <div className="min-w-0">
                                                    <h4 className="font-semibold text-[var(--background-primary)] truncate">{pickupMain}</h4>
                                                    {pickupRest && <p className="text-sm text-gray-500 truncate">{pickupRest}</p>}
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="w-3 h-3 rounded-full bg-primary relative shrink-0"><div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--foreground-muted)]" /></div>
                                                <div className="min-w-0">
                                                    <h4 className="font-semibold text-[var(--background-primary)] truncate">{dropMain}</h4>
                                                    {dropRest && <p className="text-sm text-gray-500 truncate">{dropRest}</p>}
                                                </div>
                                            </div>
                                        </div>
                                        {/* Fare + status */}
                                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                                            <h3 className="font-semibold text-[var(--background-primary)]">₹{booking.fare}</h3>
                                            <span className={`${statusChip(booking.status)} text-xs font-semibold px-2.5 py-1 rounded-full capitalize`}>{booking.status.replace("_", " ")}</span>
                                        </div>
                                    </div>

                                    <div className="w-full border-t border-[var(--background-primary)]/10"></div>

                                    {/* Trip meta; details attached so the collapsed grid adds no flex-gap */}
                                    <div className="flex flex-col w-full">
                                        <p className="text-base text-gray-500">
                                            {[
                                                formatDateTime(booking.scheduledAt ?? booking.createdAt),
                                                `${vehicleLabel(booking.vehicleClass)}${booking.sharing ? " • Sharing" : ""}`,
                                                booking.isOutstation ? "Outstation" : null,
                                                booking.source.charAt(0).toUpperCase() + booking.source.slice(1),
                                            ].filter(Boolean).join("  •  ")}
                                        </p>

                                        {/* People + ride id — hidden until the card is clicked open. Clicks
                                            inside don't bubble, so copying a number can't collapse the card. */}
                                        <div className={`grid w-full transition-[grid-template-rows] duration-300 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                                            <div className="overflow-hidden min-h-0 w-full" onClick={(e) => e.stopPropagation()}>
                                                <div className={`${isOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"} transition-[opacity,transform] duration-300 flex flex-col gap-4 w-full pt-4 cursor-default`}>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                                                        <div>
                                                            <p className="text-xs uppercase tracking-wide text-gray-500 mb-0.5">Customer</p>
                                                            <h4 className="text-[var(--background-primary)]">{booking.user?.name ?? "—"} <span className="text-gray-500">• {displayPhone(booking.customerPhone)}</span> <CopyBtn value={displayPhone(booking.customerPhone)} onCopy={copyId} /></h4>
                                                            {booking.sharing && booking.coRiders?.length > 0 && (
                                                                <div className="mt-1">
                                                                    <p className="text-xs uppercase tracking-wide text-gray-500 mb-0.5">Sharing with</p>
                                                                    {booking.coRiders.map((rider, i) => (
                                                                        <h4 key={i} className="text-[var(--background-primary)]">{rider.name ?? "—"} <span className="text-gray-500">• {displayPhone(rider.phone)}</span> <CopyBtn value={displayPhone(rider.phone)} onCopy={copyId} /></h4>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                        <div>
                                                            <p className="text-xs uppercase tracking-wide text-gray-500 mb-0.5">Driver</p>
                                                            {booking.driver
                                                                ? <h4 className="text-[var(--background-primary)]">{booking.driver.name} <span className="text-gray-500">• {displayPhone(booking.driver.phone)}</span> <CopyBtn value={displayPhone(booking.driver.phone)} onCopy={copyId} /></h4>
                                                                : <h4 className="text-gray-500">{booking.status === "cancelled" ? "—" : new Date(booking.scheduledAt ?? booking.createdAt) > new Date() ? "Yet to be assigned" : "Couldn't be assigned"}</h4>}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-row gap-2 h-fit justify-center items-start sm:items-center">
                                                        <p className="text-gray-500 text-sm">Ride ID: {booking.id?.slice(0, 8)}....</p>
                                                        <CopyBtn value={booking?.id} onCopy={copyId} />
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* "hover: hover" picks the wording — no JS device sniffing */}
                                    <p className="w-full text-center text-xs text-gray-400 select-none -mt-1">
                                        <span className="hidden [@media(hover:hover)]:inline">{isOpen ? "Click to collapse" : "Click to expand"}</span>
                                        <span className="[@media(hover:hover)]:hidden">{isOpen ? "Tap to collapse" : "Tap to expand"}</span>
                                    </p>
                                </div>
                            )
                        })
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
                                title="No drivers registered yet"
                                message="Drivers appear here once they sign up and submit their vehicle details for approval."
                            />
                        )
                    ) : (
                        drivers.map((driver) => (
                            <div key={driver.id} className="cursor-default bg-[var(--foreground-muted)] py-5 px-5 sm:py-6 sm:px-8 rounded-2xl my-4 sm:my-6 flex flex-col justify-center items-start gap-4">
                                <div className="flex justify-between items-start gap-4 w-full">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-[var(--background-primary)] truncate">{driver.name}</h3>
                                            <span className={`w-2 h-2 rounded-full shrink-0 ${driver.isOnline ? "bg-green-500" : "bg-gray-400"}`} title={driver.isOnline ? "Online" : "Offline"}></span>
                                            <span className="text-sm text-gray-500">{driver.isOnline ? "Online" : "Offline"}</span>
                                        </div>
                                        <p className="text-gray-500">{displayPhone(driver.phone)} <CopyBtn value={displayPhone(driver.phone)} onCopy={copyId} /></p>
                                    </div>
                                    <span className={`${verificationChip(driver.verificationStatus)} text-xs font-semibold px-2.5 py-1 rounded-full capitalize shrink-0`}>{driver.verificationStatus}</span>
                                </div>

                                <div className="w-full border-t border-[var(--background-primary)]/10"></div>

                                <p className="text-base text-gray-500">
                                    {vehicleLabel(driver.vehicleClass)}  •  {driver.vehicleNumber}  •  Joined {new Date(driver.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                                </p>
                            </div>
                        ))
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
                                title="No users yet"
                                message="Anyone who signs up on the website or books over WhatsApp appears here."
                            />
                        )
                    ) : (
                        users.map((user) => (
                            <div key={user.id} className={`${user.deletedAt ? "opacity-60" : ""} cursor-default bg-[var(--foreground-muted)] py-5 px-5 sm:py-6 sm:px-8 rounded-2xl my-4 sm:my-6 flex flex-col justify-center items-start gap-4`}>
                                <div className="flex justify-between items-start gap-4 w-full">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-semibold text-[var(--background-primary)] truncate">{user.name ?? "—"}</h3>
                                            {user.deletedAt && <span className="text-red-600 bg-red-500/10 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0">Deleted</span>}
                                        </div>
                                        <p className="text-gray-500">{displayPhone(user.phone)} <CopyBtn value={displayPhone(user.phone)} onCopy={copyId} /></p>
                                    </div>
                                    <span className="text-primary bg-primary/10 text-xs font-semibold px-2.5 py-1 rounded-full shrink-0">Code {user.bookingCode}</span>
                                </div>

                                <div className="w-full border-t border-[var(--background-primary)]/10"></div>

                                <p className="text-base text-gray-500">
                                    {[
                                        user.gender,
                                        `${user._count.bookings} ${user._count.bookings === 1 ? "ride" : "rides"}`,
                                        `Joined ${new Date(user.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`,
                                    ].filter(Boolean).join("  •  ")}
                                </p>
                            </div>
                        ))
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
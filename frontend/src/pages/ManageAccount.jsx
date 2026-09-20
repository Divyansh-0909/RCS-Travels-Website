import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../i18nCopy";
import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import Icon from '@mdi/react';
import { mdiPlus, mdiClose, mdiLock, mdiTrayArrowDown, mdiCheck, mdiContentCopy, mdiMagnify, mdiTuneVertical, mdiSortCalendarDescending, mdiSortCalendarAscending, mdiCarOutline, mdiCalendarRange } from '@mdi/js';
import { useViewNavigate } from "../hooks/useViewNavigate";
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import { useExitAnim } from "../hooks/useExitAnim";
import Button from "../components/ui/Button";
import AccountLayout from "../components/ui/AccountLayout";
import SettingRow from "../components/ui/SettingRow";
import CircleIconButton from "../components/ui/CircleIconButton";
import ErrorMark from "../components/illustrations/ErrorMark";
import EmptyState from "../components/ui/EmptyState";
import FailureState from "../components/ui/FailureState";
import RideHistorySkeleton from "../components/RideHistorySkeleton";
import { useRefreshNotice } from "../hooks/useRefreshNotice";
import { vehicleLabel, statusChip, splitAddress, displayPhone, formatDateTime, CopyBtn } from "../components/ui/bookingDisplay";
import { VEHICLE_CLASS_NAMES } from "../constants/vehicles";
import { angledVehicleImageOf } from "../constants/vehicleImages";
import Chips, { filterLabel, filterField } from "../components/ui/Chips";
import { COMPLAINT_OPTIONS } from "../constants/complaints";
import { useWebsiteCopy } from "../hooks/useWebsiteCopy";

const genderOptions = ["Male", "Female", "Others", "Rather not say"]

const RIDE_TAB = "Ride History"
const items = ["Account info", RIDE_TAB, "Privacy & Data"]

const rideStatuses = ["pending", "confirmed", "assigned", "en_route", "reached", "started", "completed", "cancelled"]
const customerCancellableStatuses = new Set(["pending", "payment_pending", "confirmed", "assigned", "en_route", "reached"])
// One filter chip per car.
const vehicleOptions = VEHICLE_CLASS_NAMES.map(cls => ({ value: cls, label: vehicleLabel(cls) }))
const rideFilterSections = ["Status", "Vehicle type", "Dates"]
const rideFilterSectionIcons = { Status: mdiTuneVertical, "Vehicle type": mdiCarOutline, Dates: mdiCalendarRange }

// Match the admin dashboard's booking-detail panel exactly so ride history and
// admin bookings use the same interaction and visual hierarchy.
const DetailModal = ({ title, onClose, children }) => createPortal(
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

const DetailCard = ({ children, className = "" }) => (
    <div className={`w-full rounded-2xl border border-border/50 bg-surface p-4 sm:p-5 ${className}`}>{children}</div>
)

const DetailLabel = ({ children }) => (
    <p className="px-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink-muted">{children}</p>
)

const FactPill = ({ children }) => (
    <span className="rounded-full bg-surface-muted px-2.5 py-1 text-xs font-semibold text-ink-muted">{children}</span>
)

const fieldDescriptions = {
    "Gender": "Helps us tailor your ride experience. Only shared when it's relevant to your safety.",
    "Emergency Contact": "We'll reach this number if something goes wrong during a ride. Add a 10-digit mobile number.",
    "DOB": "Used to verify your identity and keep your account secure. Enter it as DD/MM/YYYY.",
}

const ManageAccount = () => {
    useCopyLanguage();
    const tr = useWebsiteCopy()
    const username = useData(state => state.username)
    const setUsername = useData(state => state.setUsername)
    const phone = useData(state => state.phone)
    const gender = useData(state => state.gender)
    const setGender = useData(state => state.setGender)
    const emergencyContact = useData(state => state.emergencyContact)
    const setEmergencyContact = useData(state => state.setEmergencyContact)
    const dob = useData(state => state.dob)
    const setDOB = useData(state => state.setDOB)
    const location = useLocation();
    // A tab can be requested via router state (NavBar) or sessionStorage (post-cancel reload).
    // Kept in state so it survives the sessionStorage cleanup below — on phones it
    // decides whether the layout opens on the section list or straight on the tab.
    const [requestedTab] = useState(() => sessionStorage.getItem("manageAccountTab") ?? location.state?.tab)
    const [selected, setSelected] = useState(Math.max(0, items.indexOf(requestedTab)))
    const navigate = useViewNavigate();
    const [expanded, setExpanded] = useState(null)
    const [genderSelected, setGenderSelected] = useState("Not Selected")
    const [fieldValue, setFieldValue] = useState("")
    const [confirmText, setConfirmText] = useState("")
    const [dropdownExpand, setDropdownExpand] = useState(false)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const [downloading, setDownloading] = useState(false)
    const [downloadError, setDownloadError] = useState(null)
    const genderDropdown = useExitAnim(dropdownExpand, 220)
    const [bookings, setBookings] = useState(null)
    const [rideError, setRideError] = useState(null)
    const [detailRideId, setDetailRideId] = useState(null)
    const [copied, setCopied] = useState(false)
    const [rideSearch, setRideSearch] = useState("")
    const [rideSearchActive, setRideSearchActive] = useState(false)
    const [rideOrder, setRideOrder] = useState(true) // true = as returned (newest first)
    const [rideStatus, setRideStatus] = useState(null)
    const [rideVehicleClass, setRideVehicleClass] = useState(null)
    const [rideStartDate, setRideStartDate] = useState(null)
    const [rideEndDate, setRideEndDate] = useState(null)
    const [rideFilterExpand, setRideFilterExpand] = useState(false)
    const [rideFilterSection, setRideFilterSection] = useState(0)
    const [rideLoading, setRideLoading] = useState(false)
    const [cancelConfirmation, setCancelConfirmation] = useState(null)
    const [complaintRide, setComplaintRide] = useState(null)
    const [complaintReasons, setComplaintReasons] = useState([])
    const [complaintBusy, setComplaintBusy] = useState(false)
    const [complaintError, setComplaintError] = useState(null)
    // Whether the ride list is scrolled off its top — drives the top fade,
    // which must stay invisible while the first card is still in place.
    const [rideScrolled, setRideScrolled] = useState(false)
    const [ridePage, setRidePage] = useState(1)
    const [ridePageInput, setRidePageInput] = useState("1")
    const [rideTotal, setRideTotal] = useState(null)
    const rideSearchInit = useRef(true)
    const rideDebounceRef = useRef(undefined)
    const rideReqRef = useRef(0)
    const rideFilterDropdown = useExitAnim(rideFilterExpand, 300)
    const notifyRefreshFailed = useRefreshNotice(state => state.notifyRefreshFailed)
    const clearRefreshNotice = useRefreshNotice(state => state.clearRefreshNotice)
    // Guards the profile refresh (and its retry) against landing after unmount.
    const mountedRef = useRef(true)
    const { getMe, updateGender: updateGenderApi, updateEmergencyContact: updateEmergencyContactApi, updateDOB: updateDOBApi, deleteMe, logout, downloadMyData, getMyBookings, cancelBooking, submitRideComplaint } = useApi()

    const openComplaint = (booking) => {
        setComplaintRide(booking.id)
        setComplaintReasons(booking.complaint?.reasons ?? [])
        setComplaintError(null)
    }

    const toggleComplaintReason = (reason) => {
        setComplaintReasons((current) => current.includes(reason)
            ? current.filter((item) => item !== reason)
            : [...current, reason])
    }

    const saveComplaint = async (bookingId) => {
        if (!complaintReasons.length || complaintBusy) return
        setComplaintBusy(true)
        setComplaintError(null)
        const result = await submitRideComplaint(bookingId, complaintReasons)
        setComplaintBusy(false)
        if (result?.error) { setComplaintError(result.error); return }
        setBookings((current) => current?.map((booking) => booking.id === bookingId
            ? { ...booking, complaint: { reasons: complaintReasons } }
            : booking))
        setComplaintRide(null)
    }

    // Clear any tab restore left over from the post-cancel reload.
    useEffect(() => { sessionStorage.removeItem("manageAccountTab") }, [])

    // Refresh the profile from the server. The store already holds a persisted
    // copy, so the fields below stay filled and usable when this fails — which
    // is why it raises the ambient notice rather than a FailureState. Silently
    // swallowing it, as this used to, left the account page showing stale values
    // with no hint that the server was ever unreachable.
    async function hydrateProfile({ isRetry = false } = {}) {
        try {
            const me = await getMe()
            if (!mountedRef.current) return
            if (!me || me.error) throw new Error(me?.error || "Request failed")
            if (me.name) setUsername(me.name)
            if (me.gender) setGender(me.gender)
            if (me.dob) setDOB(me.dob)
            if (me.emergencyContact) setEmergencyContact(me.emergencyContact)
            if (isRetry) clearRefreshNotice()
        } catch {
            if (!mountedRef.current) return
            notifyRefreshFailed(
                dc("Couldn't refresh your profile. Showing your last saved details."),
                () => hydrateProfile({ isRetry: true }),
            )
        }
    }

    useEffect(() => {
        mountedRef.current = true
        hydrateProfile()
        // The notice holds a closure over this page, so it must not outlive it.
        return () => { mountedRef.current = false; clearRefreshNotice() }
    }, [])

    const rideLimit = 10
    const totalRidePages = Math.max(1, Math.ceil((rideTotal ?? 0) / rideLimit))

    // Backend rejects 1-char searches (min 2), so send null below that
    const rideSearchParam = rideSearch.trim().length >= 2 ? rideSearch.trim() : null
    const rideFiltersActive = !!(rideSearchParam || rideStatus || rideVehicleClass || rideStartDate || rideEndDate)

    // Clearing filters is no help when the only thing narrowing the list is the
    // search box, so the escape route matches whichever is actually set.
    const rideEmptyEscape = (rideStatus || rideVehicleClass || rideStartDate || rideEndDate)
        ? { get "label"() { return dc("Clear filters"); }, onClick: clearRideFilters }
        : rideSearchParam
            ? { get "label"() { return dc("Clear search"); }, onClick: () => setRideSearch("") }
            : undefined

    async function searchRides(e, overrides = {}) {
        e?.preventDefault()
        const id = ++rideReqRef.current
        setRideError(null)
        setRideLoading(true)
        try {
            const data = await getMyBookings({ search: rideSearchParam, status: rideStatus, vehicleClass: rideVehicleClass, startDate: rideStartDate, endDate: rideEndDate, sortOrder: rideOrder ? "desc" : "asc", page: ridePage, limit: rideLimit, ...overrides })
            if (id !== rideReqRef.current) return // a newer request superseded this one
            if (data?.error) {
                setRideError(data.error)
                return
            }
            setRideTotal(data.total)
            setBookings(data.bookings)
        } catch (err) {
            if (id === rideReqRef.current) {
                console.error(err)
                setRideError("Something went wrong")
            }
        } finally {
            if (id === rideReqRef.current) setRideLoading(false)
        }
    }

    // Fetch whenever the ride tab is open and the page changes (covers first open too).
    useEffect(() => {
        if (items[selected] !== RIDE_TAB) return
        searchRides()
    }, [ridePage, selected])

    useEffect(() => {
        setRidePageInput(String(ridePage))
    }, [ridePage])

    function commitRidePage() {
        const n = parseInt(ridePageInput, 10)
        if (Number.isNaN(n)) {
            setRidePageInput(String(ridePage))
            return
        }
        const clamped = Math.min(Math.max(1, n), totalRidePages)
        setRidePageInput(String(clamped))
        setRidePage(clamped)
    }

    function runRideSearch() {
        if (ridePage !== 1) {
            setRidePage(1) // page effect refetches with the current search state
            return
        }
        searchRides()
    }

    function toggleRideSortOrder() {
        const nextOrder = !rideOrder
        setRideOrder(nextOrder)
        setDetailRideId(null)

        if (ridePage !== 1) {
            setRidePage(1)
            return
        }

        searchRides(null, { sortOrder: nextOrder ? "desc" : "asc" })
    }

    // Debounced search: fire 400ms after typing stops; 1-char input is skipped.
    useEffect(() => {
        if (rideSearchInit.current) {
            rideSearchInit.current = false
            return
        }
        if (rideSearch.trim().length === 1) return
        clearTimeout(rideDebounceRef.current)
        rideDebounceRef.current = setTimeout(runRideSearch, 400)
        return () => clearTimeout(rideDebounceRef.current)
    }, [rideSearch])

    function applyRideFilters() {
        setRideFilterExpand(false)
        if (ridePage !== 1) {
            setRidePage(1)
            return
        }
        searchRides()
    }

    const copyRideId = (id) => {
        if (!id) return;
        navigator.clipboard.writeText(id);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const quotedCancellationCharge = (booking) => {
        return Number(booking?.cancellationChargeQuote) || 0
    }

    async function handleCancel(booking) {
        const id = booking?.id
        if (!id) return;

        const quotedCharge = quotedCancellationCharge(booking)
        if (cancelConfirmation?.id !== id || cancelConfirmation.charge !== quotedCharge) {
            setCancelConfirmation({ id, charge: quotedCharge })
            setRideError(null)
            return
        }

        try {
            setRideError(null);

            const data = await cancelBooking(id, quotedCharge);

            if (data?.error) {
                if (data.code === "CANCELLATION_AMOUNT_CHANGED") {
                    setCancelConfirmation({ id, charge: data.cancellationCharge ?? 0 })
                    setRideError(data.error)
                    return
                }
                setRideError("Can't cancel ride");
                return;
            }
            if (data.ok) {
                const rideState = useData.getState();
                if (rideState.bookingId === id || rideState.activeBooking?.id === id) {
                    rideState.clearActiveBooking();
                }
                sessionStorage.setItem("rideCancelled", JSON.stringify({
                    cancellationCharge: data.cancellationCharge ?? 0,
                    advanceDisposition: data.advanceDisposition ?? null,
                    refundStatus: data.refund?.status ?? null,
                }));
                // Come back to this tab after the reload the toast relies on.
                sessionStorage.setItem("manageAccountTab", RIDE_TAB);
                window.location.reload();
            }
        } catch (err) {
            console.error(err);
            setRideError("Something went wrong");
        }
    }

    // Sort still flips the current page client-side, same as the admin dashboard.
    const orderedBookings = bookings ?? []

    function clearRideFilters() {
        setRideStatus(null); setRideVehicleClass(null); setRideStartDate(null); setRideEndDate(null)
        setRideFilterExpand(false)
        if (ridePage !== 1) {
            setRidePage(1)
            return
        }
        searchRides(null, { status: null, vehicleClass: null, startDate: null, endDate: null })
    }

    const lockedFields = ["Name", "Phone number"]
    // Locked rows carry [label, value, popup heading, popup description].
    const AccountInfo_items = [
        ["Name", username, "Your name can't be edited", "It's linked to your verified identity, so it stays as it was when you signed up."],
        ["Phone number", phone, "Your phone number can't be changed", "It's how you sign in, and your account and rides are tied to it."],
        ["Gender", gender],
        ["Emergency Contact", emergencyContact],
        ["DOB", dob]
    ]

    // The panel outlives `expanded` by the length of its exit animation — it has
    // to, or it would vanish the instant it started leaving and strand the dim
    // behind it. So what it renders comes from the last row opened, not from the
    // live state.
    const fieldPanel = useExitAnim(!!expanded, 300)
    const lastExpanded = useRef(null)
    if (expanded) lastExpanded.current = expanded
    const panel = expanded ?? lastExpanded.current
    const field = panel && panel[0]
    const isLocked = lockedFields.includes(field)

    // Keyed on `expanded` rather than `field`, since `field` now survives the
    // close: this has to run on every open, so reopening the same row clears
    // what was typed into it last time.
    useEffect(() => {
        if (!expanded) return
        setError(null)
        setConfirmText("")
        if (field === "Gender") setGenderSelected(gender || "Not Selected")
        else if (field === "Emergency Contact") setFieldValue(emergencyContact || "")
        else if (field === "DOB") setFieldValue(dob || "")
    }, [expanded, gender, emergencyContact, dob])

    // The account-deletion panel only unlocks once the person types the exact word.
    const deactivateReady = confirmText.trim().toLowerCase() === "deactivate"

    const isValidDOB = (value) => {
        const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value)
        if (!m) return false
        const day = Number(m[1]), month = Number(m[2]), year = Number(m[3])
        if (month < 1 || month > 12 || year < 1900) return false
        if (day < 1 || day > new Date(year, month, 0).getDate()) return false
        return new Date(year, month - 1, day) <= new Date()
    }

    const handleContactChange = (e) => {
        setFieldValue(e.target.value.replace(/\D/g, "").slice(0, 10))
    }

    const handleDobChange = (e) => {
        const d = e.target.value.replace(/\D/g, "").slice(0, 8)
        const out = d.length > 4 ? `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`
            : d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}`
                : d
        setFieldValue(out)
    }

    const dobValid = isValidDOB(fieldValue)

    let updateDisabled = false
    if (field === "Gender") updateDisabled = genderSelected === "Not Selected" || genderSelected === gender
    else if (field === "Emergency Contact") updateDisabled = fieldValue.length !== 10 || fieldValue === emergencyContact
    else if (field === "DOB") updateDisabled = !dobValid || fieldValue === dob

    const handleUpdate = async () => {
        if (field === "Gender" && genderSelected === "Not Selected") return

        setLoading(true)
        setError(null)
        try {
            let res
            if (field === "Gender") res = await updateGenderApi(genderSelected)
            else if (field === "Emergency Contact") res = await updateEmergencyContactApi(fieldValue)
            else if (field === "DOB") res = await updateDOBApi(fieldValue)

            if (res?.error) {
                setError(res.error)
                return
            }

            if (field === "Gender") setGender(genderSelected)
            else if (field === "Emergency Contact") setEmergencyContact(fieldValue)
            else if (field === "DOB") setDOB(fieldValue)
            setExpanded(null)
        } catch {
            setError(dc("Something went wrong. Please try again."))
        } finally {
            setLoading(false)
        }
    }

    const handleDownload = async () => {
        if (downloading) return
        setDownloading(true)
        setDownloadError(null)
        try {
            const res = await downloadMyData()
            if (res?.error) {
                setDownloadError(res.error)
                return
            }
            const url = URL.createObjectURL(res.blob)
            const a = document.createElement("a")
            a.href = url
            a.download = "Account-Information.pdf"
            document.body.appendChild(a)
            a.click()
            a.remove()
            URL.revokeObjectURL(url)
        } catch (e) {
            console.error(e)
            setDownloadError(dc("Couldn't download your data. Please try again."))
        } finally {
            setDownloading(false)
        }
    }

    const handleDeactivate = async () => {
        if (!deactivateReady) return

        setLoading(true)
        setError(null)
        try {
            const data = await deleteMe()
            if (data?.error) {
                setError(data.error)   
                return
            }
            await logout()                
            navigate('/')
        }
        catch (e) {
            console.error(e)
            setError(dc("Something went wrong. Please try again."))
        }
        finally {
            setLoading(false)
        }
    }

    // Rendered twice: inside the toolbar on sm+, pinned under the list on phones.
    // Hidden entirely while everything fits on one page.
    const ridePagination = (rideTotal ?? 0) <= rideLimit ? null : (
        <div className="flex gap-3 sm:gap-4 items-center justify-center">
            <button type="button" disabled={ridePage <= 1} onClick={() => setRidePage(p => p - 1)} className="disabled:opacity-[0.8] disabled:cursor-not-allowed disabled:hover:bg-[var(--background)]/90 py-2 px-3 flex items-center justify-center gap-1 cursor-pointer text-[var(--text)] bg-[var(--background)]/90 hover:bg-[var(--background)] transition-color duration-300 rounded-xl"><h4>{tr("Prev")}</h4></button>
            <span className="text-[var(--text-foreground)] flex w-fit items-center justify-center gap-2">
                <input
                    type="text"
                    inputMode="numeric"
                    value={ridePageInput}
                    onChange={(e) => setRidePageInput(e.target.value.replace(/\D/g, ""))}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitRidePage() } }}
                    onBlur={commitRidePage}
                    className="flex text-center justify-center items-center border box-border rounded-lg h-10 w-10 p-0 m-0 bg-transparent leading-none outline-none text-sm sm:text-lg"
                />
                <h4>{tr("of")}</h4>
                <h4 className="flex text-center justify-center items-center border box-border rounded-lg h-10 w-10 p-0 m-0 bg-transparent leading-none text-sm sm:text-lg">{totalRidePages}</h4>
            </span>
            <button type="button" disabled={ridePage >= totalRidePages} onClick={() => setRidePage(p => p + 1)} className="disabled:opacity-[0.8] disabled:cursor-not-allowed disabled:hover:bg-[var(--background)]/90 py-2 px-3 flex items-center justify-center gap-1 cursor-pointer text-[var(--text)] bg-[var(--background)]/90 hover:bg-[var(--background)] transition-color duration-300 rounded-xl"><h4>{tr("Next")}</h4></button>
        </div>
    )

    const activeRide = detailRideId
        ? bookings?.find((booking) => booking.id === detailRideId) ?? null
        : null
    const activeRideUpcoming = activeRide ? new Date(activeRide.scheduledAt) > new Date() : false
    const closeRideDetails = () => {
        setDetailRideId(null)
        setCancelConfirmation(null)
        setComplaintRide(null)
        setComplaintError(null)
    }

    return (
        <AccountLayout
            items={items.map(tr)}
            selected={selected}
            onSelect={(i) => { setSelected(i); setRideScrolled(false); closeRideDetails() }}
            title={tr("Manage Account")}
            startOnContent={items.includes(requestedTab)}
            panelOpen={!!expanded || rideFilterExpand || !!activeRide}
            onPanelClose={() => { setExpanded(null); setRideFilterExpand(false); closeRideDetails() }}
        >
                    {activeRide && (
                    <DetailModal title={tr("Ride details")} onClose={closeRideDetails}>
                        <div className="w-full overflow-hidden rounded-2xl border border-border/50 bg-surface">
                            <div className={`${statusChip(activeRide.status)} w-full py-2 text-center text-xs font-semibold uppercase tracking-[0.12em]`}>
                                {activeRide.status.replace(/_/g, " ")}
                            </div>
                            <div className="p-4 sm:p-5">
                                <div className="min-w-0">
                                    <h3 className="text-2xl font-semibold tracking-[-0.02em] text-ink">{vehicleLabel(activeRide.vehicleClass)} {tr("Ride")}</h3>
                                    <p className="mt-1 text-sm text-ink-muted">{formatDateTime(activeRide.scheduledAt ?? activeRide.createdAt)}</p>
                                    <p className="mt-2 text-3xl font-semibold tracking-[-0.03em] text-ink">₹{activeRide.fare}</p>
                                </div>

                                <div className="my-4 h-px w-full bg-border/50" />

                                <div>
                                    <DetailLabel>{tr("Ride ID")}</DetailLabel>
                                    <div className="mt-1 flex items-center gap-2 px-1">
                                        <p className="break-all text-sm font-semibold text-ink">{activeRide.reference}</p>
                                        <CopyBtn value={activeRide.reference} onCopy={copyRideId} />
                                    </div>
                                </div>

                                <div className="mt-5 flex flex-col gap-4">
                                    <div className="flex items-start gap-3">
                                        <span className="mt-1.5 h-3 w-3 shrink-0 rounded-full bg-strong" />
                                        <div className="min-w-0">
                                            <DetailLabel>{tr("Pickup")}</DetailLabel>
                                            <p className="mt-1 break-words px-1 text-base font-medium text-ink">{activeRide.pickupAddress}</p>
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-3">
                                        <span className="relative mt-1.5 h-3 w-3 shrink-0 rounded-full bg-primary"><span className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-on-strong" /></span>
                                        <div className="min-w-0">
                                            <DetailLabel>{tr("Drop")}</DetailLabel>
                                            <p className="mt-1 break-words px-1 text-base font-medium text-ink">{activeRide.dropAddress}</p>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-5 flex flex-wrap gap-2 pl-6">
                                    <FactPill>{vehicleLabel(activeRide.vehicleClass)}</FactPill>
                                    {activeRide.sharing && <FactPill>{tr("Sharing")}</FactPill>}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <DetailLabel>{tr("Trip details")}</DetailLabel>
                            <DetailCard className="flex flex-col gap-4">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <div>
                                        <DetailLabel>{tr("Driver")}</DetailLabel>
                                        {activeRide.driver
                                            ? <div className="mt-1 flex flex-wrap items-center gap-2 px-1">
                                                <p className="font-semibold text-ink">{activeRide.driver.name}</p>
                                                <span className="text-sm text-ink-muted">{displayPhone(activeRide.driver.phone)}</span>
                                                <CopyBtn value={displayPhone(activeRide.driver.phone)} onCopy={copyRideId} />
                                            </div>
                                            : <p className="mt-1 px-1 font-semibold text-ink-muted">{activeRide.status === "cancelled" ? "—" : activeRideUpcoming ? tr("Yet to be assigned") : tr("Couldn't be assigned")}</p>}
                                    </div>
                                    <div>
                                        <DetailLabel>{tr("Trip")}</DetailLabel>
                                        <p className="mt-1 px-1 font-semibold text-ink">
                                            {activeRide.distanceKm ?? "—"}{" " + tr("KM")}
                                            {activeRide.status === "completed" && activeRide.completedAt && activeRide.confirmedAt
                                                ? tr(" • {{value0}} min", { value0: Math.floor((Date.parse(activeRide.completedAt) - Date.parse(activeRide.confirmedAt)) / 60000) })
                                                : ""}
                                        </p>
                                    </div>
                                </div>

                                {activeRide.sharing && activeRide.soloFare != null && (
                                    <div className="border-t border-border/50 pt-4">
                                        <DetailLabel>{tr("Sharing")}</DetailLabel>
                                        {activeRide.shareGroupId
                                            ? <p className="mt-1 px-1 font-semibold text-ink">{tr("Saved ₹")}{Math.round(activeRide.soloFare - activeRide.fare)} <span className="font-normal text-ink-muted">{tr("• someone shared this ride")}</span></p>
                                            : activeRide.status === "completed"
                                                ? <p className="mt-1 px-1 font-semibold text-ink">{tr("Solo fare")} <span className="font-normal text-ink-muted">{tr("• no one shared this ride")}</span></p>
                                                : <p className="mt-1 px-1 text-sm text-ink-muted">₹{activeRide.fare}{" " + tr("if someone shares · ₹")}{activeRide.soloFare}{" " + tr("if not")}</p>}
                                    </div>
                                )}
                            </DetailCard>
                        </div>

                        <DetailCard className="flex flex-col gap-3">
                            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                                {activeRide.status === "completed" && (
                                    <Button
                                        onClick={() => navigate(`/booking/${activeRide.id}`)}
                                        prop={{ width: "240px" }}
                                    >
                                        {tr("View receipt & payment")}
                                    </Button>
                                )}
                                {activeRideUpcoming && customerCancellableStatuses.has(activeRide.status) && (
                                    <Button onClick={() => handleCancel(activeRide)} prop={{ variant: "negative", width: "200px" }}>
                                        {cancelConfirmation?.id === activeRide.id
                                            ? cancelConfirmation.charge > 0
                                                ? dc("Yes, cancel and pay ₹{{amount}}", { amount: cancelConfirmation.charge })
                                                : tr("Yes, cancel this ride")
                                            : tr("Cancel ride")}
                                    </Button>
                                )}
                                {["completed", "cancelled"].includes(activeRide.status) && activeRide.driver && (
                                    <button
                                        type="button"
                                        onClick={() => complaintRide === activeRide.id ? setComplaintRide(null) : openComplaint(activeRide)}
                                        className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                                    >
                                        {activeRide.complaint ? tr("Update complaint") : tr("Report driver")}
                                    </button>
                                )}
                                <p className="text-sm text-ink-muted">{tr("Need help?") + " "}<u className="cursor-pointer text-ink transition-colors duration-300 hover:text-ink-muted">{tr("Talk to us")}</u></p>
                            </div>

                            {complaintRide === activeRide.id && (
                                <div className="rounded-2xl border border-border/50 bg-surface-muted p-4">
                                    <h4 className="font-semibold text-ink">{tr("What happened?")}</h4>
                                    <p className="mt-0.5 text-sm text-ink-muted">{tr("Choose every option that applies. No written feedback is needed.")}</p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                        {COMPLAINT_OPTIONS.map((option) => {
                                            const selectedReason = complaintReasons.includes(option.value)
                                            return (
                                                <button
                                                    type="button"
                                                    key={option.value}
                                                    aria-pressed={selectedReason}
                                                    onClick={() => toggleComplaintReason(option.value)}
                                                    className={`${selectedReason ? "bg-primary text-on-strong border-primary" : "bg-surface text-ink border-border hover:bg-surface-muted"} rounded-full border px-3 py-2 text-sm font-medium transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
                                                >
                                                    {option.label}
                                                </button>
                                            )
                                        })}
                                    </div>
                                    {complaintError && <p className="mt-2 text-sm text-red-600">{complaintError}</p>}
                                    <div className="mt-4 flex gap-2">
                                        <button
                                            type="button"
                                            disabled={!complaintReasons.length || complaintBusy}
                                            onClick={() => saveComplaint(activeRide.id)}
                                            className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-strong transition-opacity duration-300 hover:opacity-[0.9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50"
                                        >
                                            {complaintBusy ? tr("Saving…") : tr("Submit complaint")}
                                        </button>
                                        <button type="button" onClick={() => setComplaintRide(null)} className="rounded-full px-4 py-2 text-sm font-semibold text-ink-muted transition-colors duration-300 hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                                            {tr("Cancel")}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </DetailCard>
                    </DetailModal>
                    )}

                    {fieldPanel.mounted && (
                    <Button
                        className={`block ${fieldPanel.closing ? "animate-datetime-out pointer-events-none" : "animate-datetime"} z-200 py-6 flex flex-col justify-center items-center fixed left-1/2 top-1/2 -translate-x-1/2 mt-10 -translate-y-1/2 hover:opacity-[1]`}
                        prop={{ variant: "dropdown", width: "310px" }}
                    >
                        <Icon onClick={() => setExpanded(null)} className="cursor-pointer text-[var(--foreground)] w-full right-4 top-4 absolute opacity-[0.8] transition-opacity duration-300 hover:opacity-[1]" path={mdiClose} size={1} />

                        {isLocked
                            ? <div className="flex flex-col justify-center px-3 w-full items-center text-center">
                                <ErrorMark className="mb-2" size={140} />
                                <h2 className="text-2xl">{panel[2]}</h2>
                                <p className="mt-1 text-sm text-[var(--foreground-muted)]/70">{panel[3]}</p>
                            </div>
                            : <div className="flex flex-col gap-3 w-full justify-center px-3 pt-3 items-center text-center">
                                <h2 className="text-2xl">{panel === "deactivate" ? dc("Before you deactivate") : panel === "drivers" ? dc("What your driver sees") : dc(field)}</h2>
                                <p className="-mt-2 mb-5 text-sm text-[var(--foreground-muted)]/70">{panel === "deactivate" ? dc("This can't be undone.") : panel === "drivers" ? dc("The details shared with a driver when they accept your ride.") : dc(fieldDescriptions[field])}</p>

                                {panel === "drivers" && (
                                    <div className="w-full flex flex-col gap-4 mb-1 text-left">
                                        <div className="flex flex-col gap-2">
                                            <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]/50">{tr("Shared with your driver")}</p>
                                            <ul className="flex flex-col gap-2 text-sm text-[var(--text)]">
                                                {["Your name", "Your phone number", "Your pickup & drop location", "Ride details needed to complete the trip"].map(item => (
                                                    <li key={item} className="flex items-center gap-2"><Icon path={mdiCheck} size={0.7} /> {tr(item)}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]/50">{tr("Never shared")}</p>
                                            <ul className="flex flex-col gap-2 text-sm text-[var(--foreground-muted)]/70">
                                                {["Gender", "Date of birth", "Emergency contact"].map(item => (
                                                    <li key={item} className="flex items-center gap-2"><Icon path={mdiClose} size={0.7} /> {tr(item)}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                                {panel === "deactivate" && (
                                    <div className="w-full flex flex-col gap-4 mb-1">
                                        <ul className="list-disc pl-5 flex flex-col gap-2 text-left text-sm text-[var(--foreground-muted)]/70 marker:text-[var(--foreground-muted)]/40">
                                            <li>{tr("Your personal details are erased: name, gender, DOB, emergency contact, and saved places.")}</li>
                                            <li>{tr("Your past rides are kept anonymously for our records.")}</li>
                                            <li>{tr("You're signed out on all your devices.")}</li>
                                            <li>{tr("You can sign up again with this number, but your history won't return.")}</li>
                                        </ul>
                                        <input
                                            type="text"
                                            value={confirmText}
                                            onChange={(e) => setConfirmText(e.target.value)}
                                            placeholder={dc("Type \"Deactivate\"", {})}
                                            className="w-full rounded-xl py-2 px-3 text-base text-center text-[var(--text)] bg-transparent outline-none placeholder:text-[var(--foreground-muted)]/50 border border-[var(--foreground)]/30"
                                        />
                                    </div>
                                )}

                                {/* Gender — dropdown selector */}
                                <div onClick={() => setDropdownExpand(!dropdownExpand)} className={`${field === "Gender" ? "block" : "hidden"} relative w-full cursor-pointer flex items-center rounded-xl py-2 justify-between px-3 border border-[var(--foreground)]/30`}>
                                    <h4 className={`${genderSelected === "Not Selected" && "text-[var(--foreground-muted)]/50"} text-lg`}>{dc(genderSelected)}</h4>
                                    <Icon path={mdiChevronDown} style={{
                                        transform: dropdownExpand
                                            ? "rotate(180deg)"
                                            : "rotate(0deg)",
                                    }} size={1} />
                                    {/* gender dropdown */}
                                    {genderDropdown.mounted && (
                                        <Button
                                            prop={{
                                                variant: "dropdown",
                                                width: "220px",
                                            }}
                                            className={` ${genderDropdown.closing ? "animate-dropdown-out" : "animate-dropdown"
                                                } absolute z-10 scale-[1] sm:scale-[1.1] top-12 active:opacity-[1] hover:opacity-[1]`}
                                        >
                                            <div className="flex flex-col items-start">
                                                {genderOptions.map((option) => (
                                                    <div
                                                        key={dc(option)}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setGenderSelected(option);
                                                            setDropdownExpand(false);
                                                        }}
                                                        className="w-full cursor-pointer flex items-center gap-2 py-3 text-on-strong"
                                                    >
                                                        {option}
                                                    </div>
                                                ))}
                                            </div>
                                        </Button>
                                    )}
                                </div>

                                {(field === "Emergency Contact" || field === "DOB") && (
                                    <input
                                        type={field === "DOB" ? "text" : "tel"}
                                        inputMode="numeric"
                                        value={fieldValue}
                                        onChange={field === "DOB" ? handleDobChange : handleContactChange}
                                        placeholder={field === "DOB" ? dc("DD/MM/YYYY") : dc("XXXXX XXXXX")}
                                        className={`w-full rounded-xl py-2 px-3 text-lg text-center text-ink bg-transparent outline-none placeholder:text-ink-muted/60 border ${(field === "DOB" && fieldValue && !dobValid) || (field === "Emergency Contact" && fieldValue && fieldValue.length !== 10) ? "border-negative/50" : "border-border"}`}
                                    />
                                )}

                                {/* DOB format error */}
                                {field === "DOB" && fieldValue && !dobValid && (
                                    <p className="-mt-1 text-sm text-negative">{tr("Enter a valid date as DD/MM/YYYY")}</p>
                                )}

                                {/* Emergency contact format error */}
                                {field === "Emergency Contact" && fieldValue && fieldValue.length !== 10 && (
                                    <p className="-mt-1 text-sm text-negative">{tr("Enter a 10-digit phone number")}</p>
                                )}

                                {/* Save error from the backend */}
                                {error && (
                                    <p className="-mt-1 text-sm text-negative">{error}</p>
                                )}

                                <Button className={`${panel === 'deactivate' || panel === 'drivers' ? "hidden" : "block"}`} onClick={handleUpdate}
                                    prop={{
                                        variant: "",
                                        width: "240px",
                                        disabled: updateDisabled || loading,
                                    }}
                                >
                                    {loading ? dc("Saving…") : dc("Update")}
                                </Button>
                                <Button className={`${panel === 'deactivate' ? "block" : "hidden"}`} onClick={handleDeactivate}
                                    prop={{
                                        variant: "negative",
                                        width: "240px",
                                        disabled: !deactivateReady || loading,
                                    }}
                                >
                                    {loading ? dc("Deactivating…") : dc("Deactivate")}
                                </Button>
                            </div>}
                    </Button>
                    )}
            {/* "Copied to clipboard" pill for the ride history tab */}
            <div
                className={`${copied ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"} flex justify-center items-center w-[230px] fixed z-100 left-1/2 -translate-x-1/2 bottom-8 sm:bottom-10 bg-primary text-on-strong text-sm font-semibold px-5 py-3 rounded-full shadow-lg gap-2 transition-[opacity,transform] duration-300`}
            >
                <Icon path={mdiContentCopy} size={0.7} />{dc("Copied to clipboard")}</div>
            {items[selected] === RIDE_TAB
                ? <>
                    {/* Sectioned filter panel — same shell as the admin dashboard's; Apply refetches page 1 */}
                    {rideFilterDropdown.mounted && (
                        <section
                            role="dialog"
                            aria-modal="true"
                            aria-label={tr("Filters")}
                            className={`${rideFilterDropdown.closing ? "animate-datetime-out" : "animate-datetime"} z-200 flex overflow-hidden bg-surface-muted text-ink shadow-2xl motion-reduce:animate-none max-sm:fixed max-sm:inset-0 max-sm:h-dvh max-sm:w-screen max-sm:rounded-none sm:absolute sm:left-1/2 sm:top-1/2 sm:max-h-[calc(100dvh-48px)] sm:w-[680px] sm:max-w-[calc(100vw-48px)] sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:border sm:border-border/60`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="flex h-full min-h-0 w-full flex-col text-left sm:h-auto">
                                <div className="flex min-h-0 flex-1 items-stretch gap-3 p-3 sm:min-h-[360px] sm:max-h-[70vh] sm:p-4">
                                    {/* Section list */}
                                    <nav className="w-[43%] shrink-0 overflow-y-auto border-r border-border/50 pr-2 sm:w-[210px] sm:pr-3" aria-label={tr("Filter sections")}>
                                        <div className="flex flex-col gap-1">
                                        {rideFilterSections.map((s, i) => (
                                            <button
                                                type="button"
                                                key={s}
                                                onClick={() => setRideFilterSection(i)}
                                                aria-current={i === rideFilterSection ? "page" : undefined}
                                                className={`flex w-full cursor-pointer select-none items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${i === rideFilterSection
                                                    ? "bg-surface font-semibold text-ink"
                                                    : "text-ink-muted hover:bg-surface/70 hover:text-ink"}`}
                                            >
                                                <Icon path={rideFilterSectionIcons[s]} size={0.82} className="shrink-0" />
                                                <span className="min-w-0 truncate">{tr(s)}</span>
                                            </button>
                                        ))}
                                        </div>
                                    </nav>
                                    {/* Active section's options */}
                                    <div className="min-w-0 flex-1 overflow-y-auto rounded-2xl border border-border/50 bg-surface p-4 sm:p-5">
                                        <div className="flex min-h-full flex-col gap-3">
                                        <h4 className="text-base font-semibold text-ink">{tr(rideFilterSections[rideFilterSection])}</h4>
                                        {rideFilterSection === 0 && <Chips options={rideStatuses.map(s => ({ value: s, label: s.replace("_", " ") }))} value={rideStatus} onChange={setRideStatus} />}
                                        {rideFilterSection === 1 && <Chips options={vehicleOptions} value={rideVehicleClass} onChange={setRideVehicleClass} />}
                                        {rideFilterSection === 2 && (
                                            <>
                                                <label className={filterLabel}>{tr("Start date")}</label>
                                                <input type="text" value={rideStartDate ?? ""} onChange={(e) => setRideStartDate(e.target.value || null)} placeholder={dc("YYYY-MM-DD")} className={filterField} />
                                                <label className={filterLabel}>{tr("End date")}</label>
                                                <input type="text" value={rideEndDate ?? ""} onChange={(e) => setRideEndDate(e.target.value || null)} placeholder={dc("YYYY-MM-DD")} className={filterField} />
                                            </>
                                        )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex w-full shrink-0 gap-2 border-t border-border/50 px-3 py-3 sm:px-4 sm:py-4">
                                    <button type="button" onClick={clearRideFilters} className="flex flex-1 cursor-pointer items-center justify-center rounded-xl border border-border/60 bg-surface py-2.5 text-sm font-medium text-ink transition-[background-color,transform] duration-150 ease-out hover:bg-surface/70 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{tr("Clear")}</button>
                                    <button type="button" onClick={applyRideFilters} className="flex flex-1 cursor-pointer items-center justify-center rounded-xl bg-primary py-2.5 text-sm font-semibold text-on-strong transition-[opacity,transform] duration-150 ease-out hover:opacity-90 active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">{tr("Apply")}</button>
                                </div>
                            </div>
                        </section>
                    )}
                    {/* Toolbar: sort order, filter panel toggle, debounced search, pagination */}
                    <form onSubmit={(e) => { e.preventDefault(); clearTimeout(rideDebounceRef.current); runRideSearch() }} className="flex w-full flex-wrap justify-between px-4 max-sm:px-0 gap-2 gap-y-3 items-center">
                        <div className="flex w-fit max-sm:w-full max-sm:flex-wrap justify-start gap-2 items-center">
                        <div className={`flex justify-start gap-1 items-center rounded-xl py-5 px-3 w-[20vw] max-sm:w-full ${rideSearchActive ? "border-[var(--background-muted)]" : "border-[var(--background-muted)]/40"} h-[5vh] text-[var(--text-foreground)] transition-all duration-300 border-2`}>
                            <Icon path={mdiMagnify} size={0.9} className="cursor-pointer text-sm sm:text-lg hover:text-[var(--text-foreground)] transition-color duration-300 text-[var(--text-foreground)]/40" />
                            <input
                                onFocus={() => setRideSearchActive(true)}
                                onBlur={() => setRideSearchActive(false)}
                                type="text"
                                name="ride-search"
                                id="ride-search"
                                value={rideSearch}
                                onChange={(e) => setRideSearch(e.target.value)}
                                placeholder={dc("Location, driver, ID")}
                                className={`w-[95%] h-[5vh] text-[var(--text-foreground)]  outline-none border-none`}
                            />
                        </div>
                        <button type="button" onClick={toggleRideSortOrder} aria-label={rideOrder ? tr("Sort oldest first") : tr("Sort newest first")} className="py-2 px-3 flex items-center justify-center gap-1 cursor-pointer text-[var(--text)] bg-[var(--background)]/90 hover:bg-[var(--background)] transition-color duration-300 rounded-xl">
                            <Icon path={rideOrder ? mdiSortCalendarDescending : mdiSortCalendarAscending} size={1.1} />
                            <h4>{tr("Sort")}</h4>
                        </button>
                        <button type="button" onClick={() => setRideFilterExpand(!rideFilterExpand)} className="py-2 px-3 flex items-center justify-center gap-1 cursor-pointer text-[var(--text)] bg-[var(--background)]/90 hover:bg-[var(--background)] transition-color duration-300 rounded-xl">
                            <Icon path={mdiTuneVertical} size={1} className="rotate-[90deg]" />
                            <h4>{tr("Filter")}</h4>
                        </button>
                        </div>
                        {ridePagination && <div className="max-sm:hidden">{ridePagination}</div>}
                    </form>
                    <div onScroll={(e) => setRideScrolled(e.currentTarget.scrollTop > 4)} className="w-full min-w-0 max-w-full flex-1 min-h-0 overflow-x-hidden overflow-y-auto mt-4 px-4 max-sm:px-0">
                    {/* Top fade — sticky so it hugs the scroll edge; hidden until the list is actually scrolled. */}
                    <div aria-hidden="true" className={`${rideScrolled ? "opacity-100" : "opacity-0"} pointer-events-none sticky top-0 z-10 h-14 -mb-14 w-full bg-gradient-to-b from-[var(--foreground)] to-transparent transition-opacity duration-300`} />
                    {rideError
                        ?
                        <FailureState
                            tone="light"
                            title={tr("Couldn't load your rides")}
                            detail={rideError}
                            onRetry={() => searchRides()}
                        />
                        : rideLoading || bookings === null
                        ?
                        <RideHistorySkeleton />
                        : (bookings?.length ?? 0) === 0
                        ? (rideFiltersActive
                            ?
                            <EmptyState
                                tone="light"
                                glyph="search"
                                title={tr("No rides match your search")}
                                message={tr("Try a wider date range, or clear what's set to see every ride.")}
                                secondaryAction={rideEmptyEscape}
                            />
                            :
                            // No ErrorMark here any more: a red error badge over
                            // "you haven't booked yet" read as a fault the rider
                            // had caused. The action carries this screen instead.
                            <EmptyState
                                tone="light"
                                title={tr("No rides yet")}
                                message={tr("Your trips show up here once you book one, with the driver's details and what you paid.")}
                                action={{ label: tr("Book a ride"), onClick: () => navigate('/') }}
                            />)
                        :
                        <div className="grid w-full min-w-0 max-w-full grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                        {orderedBookings.map((booking) => {
                            const [pickupMain] = splitAddress(booking.pickupAddress)
                            const [dropMain] = splitAddress(booking.dropAddress)
                            const when = new Date(booking.scheduledAt ?? booking.createdAt)
                            const day = when.toLocaleDateString("en-GB", { day: "numeric", month: "short" })
                            const time = when.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
                            return (
                                <button
                                    type="button"
                                    key={booking.id}
                                    onClick={() => { setExpanded(null); setRideFilterExpand(false); setDetailRideId(booking.id) }}
                                    className="w-full min-w-0 cursor-pointer rounded-2xl bg-surface-muted p-4 text-left transition-transform duration-150 ease-out active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
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
                                                    <span className="text-xs text-ink-muted">{day} • {time}</span>
                                                    {booking.sharing && <span className="text-xs text-ink-muted">• {dc("Sharing")}</span>}
                                                </div>
                                                <p className="mt-3 truncate text-lg font-semibold leading-tight text-ink">{dropMain}</p>
                                                <p className="mt-1 truncate text-sm text-ink-muted">{dc("from") + " "}{pickupMain}</p>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="mt-3 flex items-baseline gap-2">
                                                <p className="font-semibold text-ink">{`\u20B9${booking.fare.toLocaleString("en-IN")}`}</p>
                                                <p className="text-xs text-ink-muted">{vehicleLabel(booking.vehicleClass)}</p>
                                            </div>
                                        </div>
                                    </div>
                                </button>
                            )
                        })}
                        </div>
                    }
                    </div>
                    {ridePagination && <div className="sm:hidden w-full flex justify-center pt-3">{ridePagination}</div>}
                </>
                : <ul className="flex flex-col items-start gap-4 justify-center w-full">
                {selected === 0
                    ? AccountInfo_items.map((item, i) => (
                        <SettingRow key={i} tone="bg-surface-muted" trailing={<CircleIconButton icon={mdiPlus} onClick={() => setExpanded(item)} />}>
                            <p className="flex items-center justify-start gap-1 text-base text-ink-muted">{item[0]} <Icon className={`${lockedFields.includes(item[0]) ? "block" : "hidden"} -mt-0.5 opacity-[0.9]`} path={mdiLock} size={0.6} /> </p>
                            <h4 className="text-lg font-medium">{item[1] ? dc("{{value0}}", {value0: (item[1])}) : dc("Not added yet")}</h4>
                        </SettingRow>
                    ))
                    : <>
                        <SettingRow tone="bg-surface-muted" trailing={<CircleIconButton icon={mdiPlus} onClick={() => setExpanded('drivers')} />}>
                            <h4 className="text-lg font-medium">{tr("What drivers see")}</h4>
                            <p className="flex items-center justify-start gap-1 text-base text-ink-muted">{tr("The details a driver can see about you.")}</p>
                        </SettingRow>
                        <SettingRow tone="bg-surface-muted" trailing={<CircleIconButton icon={mdiTrayArrowDown} size={0.85} disabled={downloading} onClick={handleDownload} />}>
                            <h4 className="text-lg font-medium">{tr("Download my data")}</h4>
                            <p className={`flex items-center justify-start gap-1 text-base ${downloadError ? "text-negative" : "text-ink-muted"}`}>{downloadError || (downloading ? dc("Preparing your download…") : dc("Get a copy of your profile and ride history."))}</p>
                        </SettingRow>
                        <SettingRow tone="bg-surface-muted" trailing={<CircleIconButton icon={mdiPlus} onClick={() => setExpanded('deactivate')} />}>
                            <h4 className="text-lg font-medium">{tr("Deactivate your account")}</h4>
                            <p className="flex items-center justify-start gap-1 text-base text-ink-muted">{tr("Find out how to deactivate your account")}</p>
                        </SettingRow>
                    </>
                }
                </ul>
            }
        </AccountLayout>
    )
}

export default ManageAccount

import { useState, useEffect, useRef } from "react"
import { useLocation } from "react-router-dom";
import Icon from '@mdi/react';
import { mdiPlus, mdiClose, mdiLock, mdiChevronDown, mdiTrayArrowDown, mdiCheck, mdiContentCopy, mdiMagnify, mdiTuneVertical, mdiSortCalendarDescending, mdiSortCalendarAscending } from '@mdi/js';
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

const genderOptions = ["Male", "Female", "Others", "Rather not say"]

const RIDE_TAB = "Ride History"
const items = ["Account info", RIDE_TAB, "Privacy & Data"]

const rideStatuses = ["pending", "confirmed", "assigned", "en_route", "reached", "started", "completed", "cancelled"]
const customerCancellableStatuses = new Set(["pending", "payment_pending", "confirmed", "assigned", "en_route", "reached"])
// One filter chip per car.
const vehicleOptions = VEHICLE_CLASS_NAMES.map(cls => ({ value: cls, label: vehicleLabel(cls) }))
const rideFilterSections = ["Status", "Vehicle type", "Dates"]

const fieldDescriptions = {
    "Gender": "Helps us tailor your ride experience. Only shared when it's relevant to your safety.",
    "Emergency Contact": "We'll reach this number if something goes wrong during a ride. Add a 10-digit mobile number.",
    "DOB": "Used to verify your identity and keep your account secure. Enter it as DD/MM/YYYY.",
}

const ManageAccount = () => {
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
    const [expandedRide, setExpandedRide] = useState(null)
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
                "Couldn't refresh your profile. Showing your last saved details.",
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
        ? { label: "Clear filters", onClick: clearRideFilters }
        : rideSearchParam
            ? { label: "Clear search", onClick: () => setRideSearch("") }
            : undefined

    async function searchRides(e, overrides = {}) {
        e?.preventDefault()
        const id = ++rideReqRef.current
        setRideError(null)
        setRideLoading(true)
        try {
            const data = await getMyBookings({ search: rideSearchParam, status: rideStatus, vehicleClass: rideVehicleClass, startDate: rideStartDate, endDate: rideEndDate, page: ridePage, limit: rideLimit, ...overrides })
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
    const orderedBookings = rideOrder ? (bookings ?? []) : [...(bookings ?? [])].reverse()

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
            setError("Something went wrong. Please try again.")
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
            setDownloadError("Couldn't download your data. Please try again.")
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
            setError("Something went wrong. Please try again.")
        }
        finally {
            setLoading(false)
        }
    }

    // Rendered twice: inside the toolbar on sm+, pinned under the list on phones.
    // Hidden entirely while everything fits on one page.
    const ridePagination = (rideTotal ?? 0) <= rideLimit ? null : (
        <div className="flex gap-3 sm:gap-4 items-center justify-center">
            <button type="button" disabled={ridePage <= 1} onClick={() => setRidePage(p => p - 1)} className="disabled:opacity-[0.8] disabled:cursor-not-allowed disabled:hover:bg-[var(--background)]/90 py-2 px-3 flex items-center justify-center gap-1 cursor-pointer text-[var(--text)] bg-[var(--background)]/90 hover:bg-[var(--background)] transition-color duration-300 rounded-xl"><h4>Prev</h4></button>
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
                <h4>of</h4>
                <h4 className="flex text-center justify-center items-center border box-border rounded-lg h-10 w-10 p-0 m-0 bg-transparent leading-none text-sm sm:text-lg">{totalRidePages}</h4>
            </span>
            <button type="button" disabled={ridePage >= totalRidePages} onClick={() => setRidePage(p => p + 1)} className="disabled:opacity-[0.8] disabled:cursor-not-allowed disabled:hover:bg-[var(--background)]/90 py-2 px-3 flex items-center justify-center gap-1 cursor-pointer text-[var(--text)] bg-[var(--background)]/90 hover:bg-[var(--background)] transition-color duration-300 rounded-xl"><h4>Next</h4></button>
        </div>
    )

    return (
        <AccountLayout
            items={items}
            selected={selected}
            onSelect={(i) => { setSelected(i); setRideScrolled(false) }}
            title="Manage Account"
            startOnContent={items.includes(requestedTab)}
            panelOpen={!!expanded || rideFilterExpand}
            onPanelClose={() => { setExpanded(null); setRideFilterExpand(false) }}
        >
                    {fieldPanel.mounted && (
                    <Button
                        className={`block ${fieldPanel.closing ? "animate-datetime-out pointer-events-none" : "animate-datetime"} z-200 py-6 flex flex-col justify-center items-center fixed left-1/2 top-1/2 -translate-x-1/2 mt-10 -translate-y-1/2 hover:opacity-[1]`}
                        prop={{ variant: "dropdown", width: "310px" }}
                    >
                        <Icon onClick={() => setExpanded(null)} className="text-[var(--foreground)] w-full right-4 top-4 absolute opacity-[0.8] transition-opacity duration-300 hover:opacity-[1]" path={mdiClose} size={1} />

                        {isLocked
                            ? <div className="flex flex-col justify-center px-3 w-full items-center text-center">
                                <ErrorMark className="mb-2" size={140} />
                                <h2 className="text-2xl">{panel[2]}</h2>
                                <p className="mt-1 text-sm text-[var(--foreground-muted)]/70">{panel[3]}</p>
                            </div>
                            : <div className="flex flex-col gap-3 w-full justify-center px-3 pt-3 items-center text-center">
                                <h2 className="text-2xl">{panel === "deactivate" ? "Before you deactivate" : panel === "drivers" ? "What your driver sees" : `${field}`}</h2>
                                <p className="-mt-2 mb-5 text-sm text-[var(--foreground-muted)]/70">{panel === "deactivate" ? "This can't be undone." : panel === "drivers" ? "The details shared with a driver when they accept your ride." : `${fieldDescriptions[field]}`}</p>

                                {/* PLACEHOLDER — reconcile with the real driver route once it exists (see ROADMAP IMP) */}
                                {panel === "drivers" && (
                                    <div className="w-full flex flex-col gap-4 mb-1 text-left">
                                        <div className="flex flex-col gap-2">
                                            <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]/50">Shared with your driver</p>
                                            <ul className="flex flex-col gap-2 text-sm text-[var(--text)]">
                                                {["Your phone number", "Your pickup & drop location"].map(t => (
                                                    <li key={t} className="flex items-center gap-2"><Icon path={mdiCheck} size={0.7} /> {t}</li>
                                                ))}
                                            </ul>
                                        </div>
                                        <div className="flex flex-col gap-2">
                                            <p className="text-xs uppercase tracking-wide text-[var(--foreground-muted)]/50">Never shared</p>
                                            <ul className="flex flex-col gap-2 text-sm text-[var(--foreground-muted)]/70">
                                                {["Your name", "Gender", "Date of birth", "Emergency contact"].map(t => (
                                                    <li key={t} className="flex items-center gap-2"><Icon path={mdiClose} size={0.7} /> {t}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                                {panel === "deactivate" && (
                                    <div className="w-full flex flex-col gap-4 mb-1">
                                        <ul className="list-disc pl-5 flex flex-col gap-2 text-left text-sm text-[var(--foreground-muted)]/70 marker:text-[var(--foreground-muted)]/40">
                                            <li>Your personal details are erased: name, gender, DOB, emergency contact, and saved places.</li>
                                            <li>Your past rides are kept anonymously for our records.</li>
                                            <li>You're signed out on all your devices.</li>
                                            <li>You can sign up again with this number, but your history won't return.</li>
                                        </ul>
                                        <input
                                            type="text"
                                            value={confirmText}
                                            onChange={(e) => setConfirmText(e.target.value)}
                                            placeholder={`Type "Deactivate"`}
                                            className="w-full rounded-xl py-2 px-3 text-base text-center text-[var(--text)] bg-transparent outline-none placeholder:text-[var(--foreground-muted)]/50 border border-[var(--foreground)]/30"
                                        />
                                    </div>
                                )}

                                {/* Gender — dropdown selector */}
                                <div onClick={() => setDropdownExpand(!dropdownExpand)} className={`${field === "Gender" ? "block" : "hidden"} relative w-full flex items-center rounded-xl py-2 justify-between px-3 border border-[var(--foreground)]/30`}>
                                    <h4 className={`${genderSelected === "Not Selected" && "text-[var(--foreground-muted)]/50"} text-lg`}>{genderSelected}</h4>
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
                                                        key={option}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setGenderSelected(option);
                                                            setDropdownExpand(false);
                                                        }}
                                                        className="w-full flex items-center gap-2 py-3 text-white"
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
                                        placeholder={field === "DOB" ? "DD/MM/YYYY" : "XXXXX XXXXX"}
                                        className={`w-full rounded-xl py-2 px-3 text-lg text-center text-[var(--text)] bg-transparent outline-none placeholder:text-[var(--foreground-muted)]/50 border ${(field === "DOB" && fieldValue && !dobValid) || (field === "Emergency Contact" && fieldValue && fieldValue.length !== 10) ? "border-[rgba(239,68,68,0.5)]" : "border-[var(--foreground)]/30"}`}
                                    />
                                )}

                                {/* DOB format error */}
                                {field === "DOB" && fieldValue && !dobValid && (
                                    <p className="-mt-1 text-sm text-[rgba(239,68,68,0.9)]">Enter a valid date as DD/MM/YYYY</p>
                                )}

                                {/* Emergency contact format error */}
                                {field === "Emergency Contact" && fieldValue && fieldValue.length !== 10 && (
                                    <p className="-mt-1 text-sm text-[rgba(239,68,68,0.9)]">Enter a 10-digit phone number</p>
                                )}

                                {/* Save error from the backend */}
                                {error && (
                                    <p className="-mt-1 text-sm text-[rgba(239,68,68,0.9)]">{error}</p>
                                )}

                                <Button className={`${panel === 'deactivate' || panel === 'drivers' ? "hidden" : "block"}`} onClick={handleUpdate}
                                    prop={{
                                        variant: "",
                                        width: "240px",
                                        disabled: updateDisabled || loading,
                                    }}
                                >
                                    {loading ? "Saving…" : "Update"}
                                </Button>
                                <Button className={`${panel === 'deactivate' ? "block" : "hidden"}`} onClick={handleDeactivate}
                                    prop={{
                                        variant: "negative",
                                        width: "240px",
                                        disabled: !deactivateReady || loading,
                                    }}
                                >
                                    {loading ? "Deactivating…" : "Deactivate"}
                                </Button>
                            </div>}
                    </Button>
                    )}
            {/* "Copied to clipboard" pill for the ride history tab */}
            <div
                className={`${copied ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"} flex justify-center items-center w-[230px] fixed z-100 left-1/2 -translate-x-1/2 bottom-8 sm:bottom-10 bg-primary text-[var(--foreground)] text-sm font-semibold px-5 py-3 rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.25)] gap-2 transition-[opacity,transform] duration-300`}
            >
                <Icon path={mdiContentCopy} size={0.7} />
                Copied to clipboard
            </div>
            {items[selected] === RIDE_TAB
                ? <>
                    {/* Sectioned filter panel — same shell as the admin dashboard's; Apply refetches page 1 */}
                    {rideFilterDropdown.mounted && (
                        <Button
                            prop={{
                                variant: "dropdown",
                                width: "380px",
                                paddingX: "0px",
                                innerClassName: "justify-start max-sm:w-full! max-sm:h-full!",
                            }}
                            className={`block ${rideFilterDropdown.closing ? "animate-datetime-out" : "animate-datetime"} z-200 max-sm:fixed max-sm:inset-0 max-sm:my-0 max-sm:w-screen! max-sm:h-dvh! max-sm:rounded-none! sm:absolute sm:scale-[1.1] sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 active:opacity-[1] hover:opacity-[1]`}
                        >
                            <div
                                className="flex flex-col w-full py-3 text-left max-sm:h-full"
                                onClick={(e) => e.stopPropagation()}
                            >
                                <div className="flex w-full items-stretch h-[360px] max-h-[70vh] max-sm:h-auto max-sm:max-h-none max-sm:flex-1 max-sm:min-h-0">
                                    {/* Section list */}
                                    <div className="w-[38%] shrink-0 flex flex-col border-r border-[var(--foreground)]/15 overflow-y-auto">
                                        {rideFilterSections.map((s, i) => (
                                            <div
                                                key={s}
                                                onClick={() => setRideFilterSection(i)}
                                                className={`py-3 pl-5 pr-3 text-sm cursor-pointer select-none border-b border-[var(--foreground)]/10 border-l-[3px] transition-colors duration-300 ${i === rideFilterSection
                                                    ? "text-[var(--text)] font-semibold bg-[var(--foreground)]/15 border-l-primary"
                                                    : "text-[var(--text-muted)] border-l-transparent hover:bg-[var(--foreground)]/5"}`}
                                            >
                                                {s}
                                            </div>
                                        ))}
                                    </div>
                                    {/* Active section's options */}
                                    <div className="flex-1 min-w-0 flex flex-col gap-3 px-4 py-1 overflow-y-auto">
                                        <h4 className="font-semibold text-base">{rideFilterSections[rideFilterSection]}</h4>
                                        {rideFilterSection === 0 && <Chips options={rideStatuses.map(s => ({ value: s, label: s.replace("_", " ") }))} value={rideStatus} onChange={setRideStatus} />}
                                        {rideFilterSection === 1 && <Chips options={vehicleOptions} value={rideVehicleClass} onChange={setRideVehicleClass} />}
                                        {rideFilterSection === 2 && (
                                            <>
                                                <label className={filterLabel}>Start date</label>
                                                <input type="text" value={rideStartDate ?? ""} onChange={(e) => setRideStartDate(e.target.value || null)} placeholder="YYYY-MM-DD" className={filterField} />
                                                <label className={filterLabel}>End date</label>
                                                <input type="text" value={rideEndDate ?? ""} onChange={(e) => setRideEndDate(e.target.value || null)} placeholder="YYYY-MM-DD" className={filterField} />
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="w-full flex gap-2 px-3 pt-3 mt-3 border-t border-[var(--foreground)]/10">
                                    <div onClick={clearRideFilters} className="flex-1 flex justify-center items-center py-2 rounded-xl border border-[var(--foreground)]/30 text-sm cursor-pointer hover:bg-[var(--foreground)]/10 transition-colors duration-300">Clear</div>
                                    <div onClick={applyRideFilters} className="flex-1 flex justify-center items-center py-2 rounded-xl bg-primary text-[var(--foreground)] text-sm font-semibold cursor-pointer hover:opacity-[0.9] transition-opacity duration-300">Apply</div>
                                </div>
                            </div>
                        </Button>
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
                                placeholder="Location, driver, ID"
                                className={`w-[95%] h-[5vh] text-[var(--text-foreground)]  outline-none border-none`}
                            />
                        </div>
                        <button type="button" onClick={() => setRideOrder(!rideOrder)} className="py-2 px-3 flex items-center justify-center gap-1 cursor-pointer text-[var(--text)] bg-[var(--background)]/90 hover:bg-[var(--background)] transition-color duration-300 rounded-xl">
                            <Icon path={rideOrder ? mdiSortCalendarDescending : mdiSortCalendarAscending} size={1.1} />
                            <h4>Sort</h4>
                        </button>
                        <button type="button" onClick={() => setRideFilterExpand(!rideFilterExpand)} className="py-2 px-3 flex items-center justify-center gap-1 cursor-pointer text-[var(--text)] bg-[var(--background)]/90 hover:bg-[var(--background)] transition-color duration-300 rounded-xl">
                            <Icon path={mdiTuneVertical} size={1} className="rotate-[90deg]" />
                            <h4>Filter</h4>
                        </button>
                        </div>
                        {ridePagination && <div className="max-sm:hidden">{ridePagination}</div>}
                    </form>
                    <div onScroll={(e) => setRideScrolled(e.currentTarget.scrollTop > 4)} className="w-full flex-1 min-h-0 overflow-y-auto mt-4 px-4 max-sm:px-0">
                    {/* Top fade — sticky so it hugs the scroll edge; hidden until the list is actually scrolled. */}
                    <div aria-hidden="true" className={`${rideScrolled ? "opacity-100" : "opacity-0"} pointer-events-none sticky top-0 z-10 h-14 -mb-14 w-full bg-gradient-to-b from-[var(--foreground)] to-transparent transition-opacity duration-300`} />
                    {rideError
                        ?
                        <FailureState
                            tone="light"
                            title="Couldn't load your rides"
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
                                title="No rides match your search"
                                message="Try a wider date range, or clear what's set to see every ride."
                                secondaryAction={rideEmptyEscape}
                            />
                            :
                            // No ErrorMark here any more: a red error badge over
                            // "you haven't booked yet" read as a fault the rider
                            // had caused. The action carries this screen instead.
                            <EmptyState
                                tone="light"
                                title="No rides yet"
                                message="Your trips show up here once you book one, with the driver's details and what you paid."
                                action={{ label: "Book a ride", onClick: () => navigate('/') }}
                            />)
                        :
                        orderedBookings.map((booking) => {
                            const [pickupMain, pickupRest] = splitAddress(booking.pickupAddress)
                            const [dropMain, dropRest] = splitAddress(booking.dropAddress)
                            const isOpen = expandedRide === booking.id
                            const upcoming = new Date(booking.scheduledAt) > new Date()
                            return (
                                <div key={booking.id} className={`${booking.status === "cancelled" ? "opacity-60" : ""} my-2 flex cursor-default flex-col items-start justify-center gap-3 rounded-3xl bg-pastel-primary px-5 py-5 sm:px-6`}>
                                    <div className="flex justify-between items-start gap-4 w-full">
                                        {/* Route: pickup → drop, with the car on its left on sm+ */}
                                        <div className="flex items-center gap-4 min-w-0">
                                            <img
                                                src={angledVehicleImageOf(booking.vehicleClass)}
                                                className={`hidden h-28 w-44 -ml-4 shrink-0 object-contain sm:block ${booking.status === "cancelled" ? "grayscale" : ""}`}
                                                alt={`${vehicleLabel(booking.vehicleClass)} vehicle`}
                                            />
                                            <div className="flex flex-col gap-3 min-w-0">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3 h-3 rounded-full bg-[var(--background-primary)] shrink-0"></div>
                                                    <div className="min-w-0">
                                                        <h4 className="font-semibold text-[var(--background-primary)] truncate">{pickupMain}</h4>
                                                        {pickupRest && <p className="text-sm text-gray-500 truncate">{pickupRest}</p>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <div className="w-3 h-3 rounded-full bg-primary relative shrink-0"><div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[var(--foreground)]" /></div>
                                                    <div className="min-w-0">
                                                        <h4 className="font-semibold text-[var(--background-primary)] truncate">{dropMain}</h4>
                                                        {dropRest && <p className="text-sm text-gray-500 truncate">{dropRest}</p>}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                        {/* Fare + status + expand toggle */}
                                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                                            <h3 className="font-semibold text-[var(--background-primary)]">₹{booking.fare}</h3>
                                            <span className={`${statusChip(booking.status)} text-xs font-semibold px-2.5 py-1 rounded-full capitalize`}>{booking.status.replace("_", " ")}</span>
                                        </div>
                                    </div>

                                    <div className="w-full border-t border-[var(--background-primary)]/10"></div>

                                    {/* Trip meta + toggle; details attached so the collapsed grid adds no flex-gap */}
                                    <div className="flex flex-col w-full">
                                        <div className="flex justify-between items-center w-full gap-4">
                                            <p className="text-base text-gray-500">
                                                {formatDateTime(booking.scheduledAt ?? booking.createdAt)}  •  {vehicleLabel(booking.vehicleClass)}{booking.sharing ? " • Sharing" : ""}
                                            </p>
                                            <div onClick={() => setExpandedRide(isOpen ? null : booking.id)} className="cursor-pointer text-[var(--foreground-muted)] bg-[var(--background-primary)]/80 transition-color duration-300 hover:bg-[var(--background-primary)] p-1 rounded-full shrink-0">
                                                <Icon path={mdiChevronDown} size={1} className={`transition-transform duration-300 ${isOpen ? "rotate-180" : ""}`} />
                                            </div>
                                        </div>

                                        {/* Extra details — hidden until the toggle pops them down */}
                                        <div className={`grid w-full transition-[grid-template-rows] duration-300 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                                            <div className="overflow-hidden min-h-0 w-full">
                                                <div className={`${isOpen ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"} mt-4 flex w-full flex-col gap-4 rounded-2xl bg-white/70 p-4 transition-[opacity,transform] duration-300`}>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                                                    <div>
                                                        <p className="text-xs uppercase tracking-wide text-gray-500 mb-0.5">Driver</p>
                                                        {booking.driver
                                                            ? <h4 className="text-[var(--background-primary)]">{booking.driver.name} <span className="text-gray-500">• {displayPhone(booking.driver.phone)}</span> <CopyBtn value={displayPhone(booking.driver.phone)} onCopy={copyRideId} /></h4>
                                                            : <h4 className="text-gray-500">{booking.status === "cancelled" ? "—" : upcoming ? "Yet to be assigned" : "Couldn't be assigned"}</h4>}
                                                    </div>
                                                    <div>
                                                        <p className="text-xs uppercase tracking-wide text-gray-500 mb-0.5">Trip</p>
                                                        <h4 className="text-[var(--background-primary)]">
                                                            {booking.distanceKm ?? "—"} KM
                                                            {booking.status === "completed" && booking.completedAt && booking.confirmedAt
                                                                ? ` • ${Math.floor((Date.parse(booking.completedAt) - Date.parse(booking.confirmedAt)) / 60000)} min`
                                                                : ""}
                                                        </h4>
                                                    </div>
                                                    {/* WHAT SHARING ACTUALLY DID TO THIS FARE — the other half of the
                                                        two prices the booking screen showed. Without it a rider who
                                                        chose sharing and was never matched sees only the higher number
                                                        and nothing saying why, which is the one outcome guaranteed to
                                                        generate a support call.

                                                        `shareGroupId` is the whole test, exactly as on the server: it
                                                        is written only by a successful join. Same labelled-block shape
                                                        as Driver and Trip above rather than a callout — this is one
                                                        more fact about the ride, not an alert. */}
                                                    {booking.sharing && booking.soloFare != null && (
                                                        <div>
                                                            <p className="text-xs uppercase tracking-wide text-gray-500 mb-0.5">Sharing</p>
                                                            {booking.shareGroupId
                                                                ? <h4 className="text-[var(--background-primary)]">Saved ₹{Math.round(booking.soloFare - booking.fare)} <span className="text-gray-500">• someone shared this ride</span></h4>
                                                                : booking.status === "completed"
                                                                    ? <h4 className="text-[var(--background-primary)]">Solo fare <span className="text-gray-500">• no one shared this ride</span></h4>
                                                                    : <h4 className="text-gray-500">₹{booking.fare} if someone shares · ₹{booking.soloFare} if not</h4>}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex flex-row gap-2 h-fit justify-start items-start sm:items-center">
                                                    {/* The reference, whole — this is the value support asks for,
                                                        and a truncated uuid could not be read back over a phone
                                                        or pasted into the search box above. */}
                                                    <p className="text-gray-500 text-sm">Ride ID: {booking.reference}</p>
                                                    <CopyBtn value={booking?.reference} onCopy={copyRideId} />
                                                </div>

                                                <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                                                    {upcoming && customerCancellableStatuses.has(booking.status) &&
                                                        <Button onClick={() => handleCancel(booking)} prop={{ variant: "negative", width: "200px" }}>
                                                            {cancelConfirmation?.id === booking.id
                                                                ? cancelConfirmation.charge > 0
                                                                    ? `Yes, cancel and pay ₹${cancelConfirmation.charge}`
                                                                    : "Yes, cancel this ride"
                                                                : "Cancel ride"}
                                                        </Button>}
                                                    {["completed", "cancelled"].includes(booking.status) && booking.driver && (
                                                        <button
                                                            type="button"
                                                            onClick={() => complaintRide === booking.id ? setComplaintRide(null) : openComplaint(booking)}
                                                            className="rounded-full border border-[var(--background-primary)]/25 px-4 py-2 text-sm font-semibold text-[var(--background-primary)] hover:bg-[var(--background-primary)]/5 transition-colors"
                                                        >
                                                            {booking.complaint ? "Update complaint" : "Report driver"}
                                                        </button>
                                                    )}
                                                    <p>Need help? <u className="text-[var(--background-primary)] cursor-pointer transition-color duration-300 hover:text-[var(--background-primary)]/80">Talk to us</u></p>
                                                </div>
                                                {complaintRide === booking.id && (
                                                    <div className="rounded-2xl border border-[var(--background-primary)]/10 bg-[var(--foreground)]/60 p-4">
                                                        <h4 className="font-semibold text-[var(--background-primary)]">What happened?</h4>
                                                        <p className="mt-0.5 text-sm text-gray-500">Choose every option that applies. No written feedback is needed.</p>
                                                        <div className="mt-3 flex flex-wrap gap-2">
                                                            {COMPLAINT_OPTIONS.map((option) => {
                                                                const selected = complaintReasons.includes(option.value)
                                                                return (
                                                                    <button
                                                                        type="button"
                                                                        key={option.value}
                                                                        aria-pressed={selected}
                                                                        onClick={() => toggleComplaintReason(option.value)}
                                                                        className={`${selected ? "bg-primary text-[var(--foreground)] border-primary" : "bg-[var(--foreground)] text-[var(--background-primary)] border-[var(--background-primary)]/20 hover:bg-[var(--background-primary)]/5"} rounded-full border px-3 py-2 text-sm font-medium transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary`}
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
                                                                onClick={() => saveComplaint(booking.id)}
                                                                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-[var(--foreground)] transition-opacity duration-300 hover:opacity-[0.9] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-40"
                                                            >
                                                                {complaintBusy ? "Saving…" : "Submit complaint"}
                                                            </button>
                                                            <button type="button" onClick={() => setComplaintRide(null)} className="rounded-full px-4 py-2 text-sm font-semibold text-[var(--background-primary)]/60 transition-colors duration-300 hover:bg-[var(--background-primary)]/5 hover:text-[var(--background-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
                                                                Cancel
                                                            </button>
                                                        </div>
                                                    </div>
                                                )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })
                    }
                    </div>
                    {ridePagination && <div className="sm:hidden w-full flex justify-center pt-3">{ridePagination}</div>}
                </>
                : <ul className="flex flex-col items-start gap-4 justify-center w-full">
                {selected === 0
                    ? AccountInfo_items.map((item, i) => (
                        <SettingRow key={i} tone="bg-pastel-primary" trailing={<CircleIconButton icon={mdiPlus} onClick={() => setExpanded(item)} />}>
                            <p className="flex items-center justify-start gap-1 text-base text-[var(--background-primary)]/50">{item[0]} <Icon className={`${lockedFields.includes(item[0]) ? "block" : "hidden"} -mt-0.5 opacity-[0.9]`} path={mdiLock} size={0.6} /> </p>
                            <h4 className="text-lg font-medium">{item[1] ? `${item[1]}` : "Not added yet"}</h4>
                        </SettingRow>
                    ))
                    : <>
                        <SettingRow tone="bg-pastel-sand" trailing={<CircleIconButton icon={mdiPlus} onClick={() => setExpanded('drivers')} />}>
                            <h4 className="text-lg font-medium">What drivers see</h4>
                            <p className="flex items-center justify-start gap-1 text-base text-[var(--background-primary)]/50">The details a driver can see about you.</p>
                        </SettingRow>
                        <SettingRow tone="bg-pastel-sand" trailing={<CircleIconButton icon={mdiTrayArrowDown} size={0.85} disabled={downloading} onClick={handleDownload} />}>
                            <h4 className="text-lg font-medium">Download my data</h4>
                            <p className={`flex items-center justify-start gap-1 text-base ${downloadError ? "text-[rgba(239,68,68,0.9)]" : "text-[var(--background-primary)]/50"}`}>{downloadError || (downloading ? "Preparing your download…" : "Get a copy of your profile and ride history.")}</p>
                        </SettingRow>
                        <SettingRow tone="bg-pastel-sand" trailing={<CircleIconButton icon={mdiPlus} onClick={() => setExpanded('deactivate')} />}>
                            <h4 className="text-lg font-medium">Deactivate your account</h4>
                            <p className="flex items-center justify-start gap-1 text-base text-[var(--background-primary)]/50">Find out how to deactivate your account</p>
                        </SettingRow>
                    </>
                }
                </ul>
            }
        </AccountLayout>
    )
}

export default ManageAccount

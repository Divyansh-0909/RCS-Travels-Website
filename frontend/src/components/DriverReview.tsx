import { useEffect, useState } from "react"
import Icon from "@mdi/react"
import { mdiOpenInNew, mdiAlertCircleOutline, mdiCheck, mdiClose } from "@mdi/js"
import { useAuth } from "@clerk/clerk-react"
import { getDriverDocuments, reviewDocument, setDriverSuspension, setDriverGroup } from "../api/api"
import { labelOf } from "../constants/vehicles"
import { DriverGroup, VerificationStatus } from "../types/enums"

// Reviewing one captain's paperwork, stopping him driving, and moving him between
// the fleet and the partner pool.
//
// THE ONE RULE THIS SCREEN EXISTS TO ENFORCE: nobody approves a document he has
// not opened. The server already refuses to review anything the file check has
// not cleared — signedDocumentUrl returns null for it, so there is no link — and
// this screen makes that visible rather than letting an admin click Approve and
// discover a 409. A row with no link shows why instead, and its buttons are gone.
//
// Two verdicts live on every document and they are NOT the same thing:
//   scanStatus  the FILE — pending, scanning, clean, failed. Automatic.
//   status      the ADMIN — pending, approved, rejected. A person.
// Clean means the bytes are what they claim to be, not that the licence is valid.
// They are rendered as two separate chips for that reason; collapsing them into
// one "state" is how somebody eventually reads a scan pass as an approval.

type Document = {
    id: string
    type: string
    label: string
    required: boolean
    vehicleId: string | null
    isReplacement: boolean
    number: string | null
    expiresAt: string | null
    status: "pending" | "approved" | "rejected"
    rejectionReason: string | null
    reviewedAt: string | null
    uploadedAt: string
    scanStatus: "pending" | "scanning" | "clean" | "failed"
    scanReason: string | null
    /** Null for anything not `clean`. The server fails closed; so does this screen. */
    url: string | null
    reviewable: boolean
}

type Vehicle = {
    id: string
    class: string
    number: string
    model: string | null
    verificationStatus: VerificationStatus
    isActive: boolean
    missing: string[]
}

type Payload = {
    driver: {
        id: string
        name: string
        verificationStatus: VerificationStatus
        suspendedAt: string | null
        suspensionReason: string | null
        group: DriverGroup
    }
    vehicles: Vehicle[]
    documents: Document[]
    missing: string[]
    conduct: {
        cancellationCount30Days: number
        benefitRestrictedUntil: string | null
        complaints: Array<{
            id: string
            labels: string[]
            createdAt: string
            booking: { reference: string }
        }>
    }
}

const scanChip = (scan: Document["scanStatus"]) =>
    scan === "clean" ? "text-green-700 bg-green-600/10"
        : scan === "failed" ? "text-red-600 bg-red-500/10"
            : "text-blue-600 bg-blue-500/10"

const statusChipFor = (status: Document["status"]) =>
    status === "approved" ? "text-green-700 bg-green-600/10"
        : status === "rejected" ? "text-red-600 bg-red-500/10"
            : "text-amber-600 bg-amber-500/10"

// The group's own words. Never the raw key: "partner" on its own reads as a
// demotion, and "rcs" reads as nothing at all.
const GROUP_LABELS: Record<DriverGroup, string> = {
    admin: "Owner",
    rcs: "RCS fleet",
    partner: "Partner captain",
}

const groupChipFor = (group: DriverGroup) =>
    group === "rcs" ? "text-primary bg-primary/10"
        : group === "admin" ? "text-amber-700 bg-amber-500/10"
            : "text-gray-600 bg-gray-500/10"

const plainChip = "text-xs font-semibold px-2.5 py-1 rounded-full shrink-0"
// Every other chip on this screen prints an enum key straight from the wire, so
// it needs the capitalize. The group chip does not — its words are written above,
// and "RCS fleet" would come out of that rule as "RCS Fleet".
const chip = `${plainChip} capitalize`

const shortDate = (value: string) =>
    new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })

// An expiry is a date on a piece of paper, so it is compared by date and not by
// instant — a certificate valid "until 30 Aug" is valid all day on the 30th.
const hasLapsed = (expiresAt: string | null) =>
    Boolean(expiresAt) && new Date(`${expiresAt!.slice(0, 10)}T23:59:59.999Z`) < new Date()

const DriverReview = ({ driverId, onVerificationChange, onGroupChange }: {
    driverId: string
    /** Lets the list card update its chip without refetching the whole page. */
    onVerificationChange?: (status: VerificationStatus) => void
    /** Same job for the fleet chip, which the list card also shows. */
    onGroupChange?: (group: DriverGroup) => void
}) => {
    const { getToken } = useAuth()
    const [data, setData] = useState<Payload | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    // Which row is mid-action, so only its own buttons go quiet. A single global
    // "busy" would freeze eleven rows because one is saving.
    const [busyId, setBusyId] = useState<string | null>(null)
    // The row whose reject box is open, and what has been typed into it.
    const [rejecting, setRejecting] = useState<string | null>(null)
    const [reason, setReason] = useState("")

    const [suspendOpen, setSuspendOpen] = useState(false)
    const [suspendReason, setSuspendReason] = useState("")
    const [suspendBusy, setSuspendBusy] = useState(false)

    const [groupBusy, setGroupBusy] = useState(false)

    const load = async () => {
        setLoading(true)
        const result = await getDriverDocuments(driverId, getToken)
        if (result?.error) setError(result.error)
        else { setData(result); setError(null) }
        setLoading(false)
    }

    useEffect(() => { load() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [driverId])

    const review = async (document: Document, status: "approved" | "rejected") => {
        if (status === "rejected" && reason.trim().length < 3) return
        setBusyId(document.id)

        const result = await reviewDocument(
            document.id,
            status === "rejected" ? { status, rejectionReason: reason.trim() } : { status },
            getToken,
        )
        setBusyId(null)

        if (result?.error) { setError(result.error); return }

        setRejecting(null)
        setReason("")
        // Refetched rather than patched in place: approving one document can
        // promote a replacement, clear another row, and change the captain's own
        // verdict, and guessing all of that on the client is how a screen starts
        // disagreeing with the database.
        await load()
        if (result?.driverVerificationStatus) onVerificationChange?.(result.driverVerificationStatus)
    }

    const toggleSuspension = async (suspended: boolean) => {
        if (suspended && suspendReason.trim().length < 3) return
        setSuspendBusy(true)
        const result = await setDriverSuspension(
            driverId,
            suspended ? { suspended: true, reason: suspendReason.trim() } : { suspended: false },
            getToken,
        )
        setSuspendBusy(false)
        if (result?.error) { setError(result.error); return }
        setSuspendOpen(false)
        setSuspendReason("")
        await load()
    }

    // Patched in place rather than refetched, which is the opposite of what a
    // document review does — and for a reason. An approval can promote a
    // replacement, clear a second row and change the captain's own verdict, none
    // of which the client can work out. A group move changes one column and
    // nothing downstream of it, so re-minting eleven signed document URLs to
    // repaint one chip would be a round trip for no new information.
    const moveGroup = async (group: DriverGroup) => {
        setGroupBusy(true)
        const result = await setDriverGroup(driverId, { group }, getToken)
        setGroupBusy(false)
        if (result?.error) { setError(result.error); return }
        setData((current) => current && { ...current, driver: { ...current.driver, group: result.group } })
        onGroupChange?.(result.group)
    }

    if (loading) return <p className="text-sm text-gray-500 py-4">Loading paperwork…</p>

    if (error && !data) return (
        <div className="w-full py-4">
            <p className="text-sm text-red-600">{error}</p>
            <button onClick={load} className="mt-2 text-sm underline text-[var(--background-primary)]">Try again</button>
        </div>
    )

    if (!data) return null

    const driverOwned = data.documents.filter((d) => d.vehicleId === null)
    const forVehicle = (id: string) => data.documents.filter((d) => d.vehicleId === id)

    const row = (document: Document) => {
        const lapsed = hasLapsed(document.expiresAt)
        const isBusy = busyId === document.id

        return (
            <div key={document.id} className="w-full py-3 border-b border-[var(--background-primary)]/10 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium text-[var(--background-primary)]">{document.label}</h4>
                    {document.isReplacement && (
                        <span className={`${chip} text-blue-600 bg-blue-500/10`}>Renewal</span>
                    )}
                    <span className={`${chip} ${statusChipFor(document.status)}`}>{document.status}</span>
                    <span className={`${chip} ${scanChip(document.scanStatus)}`}>
                        {document.scanStatus === "clean" ? "file ok" : `scan ${document.scanStatus}`}
                    </span>
                    {lapsed && <span className={`${chip} text-red-600 bg-red-500/10`}>Expired</span>}
                </div>

                <p className="text-sm text-gray-500 mt-1">
                    {document.number ? `${document.number} • ` : ""}
                    {document.expiresAt ? `Expires ${shortDate(document.expiresAt)} • ` : ""}
                    Uploaded {shortDate(document.uploadedAt)}
                </p>

                {document.status === "rejected" && document.rejectionReason && (
                    <p className="text-sm text-red-600 mt-1">Rejected: {document.rejectionReason}</p>
                )}

                {/* The file check failed or has not finished. No link exists, so no
                    review is offered — the server would refuse it anyway, and the
                    technical reason is here because this is the audience it was
                    written for. */}
                {!document.reviewable && (
                    <p className="text-sm text-amber-700 mt-2 flex items-start gap-1.5">
                        <Icon path={mdiAlertCircleOutline} size={0.7} className="mt-0.5 shrink-0" />
                        <span>
                            {document.scanStatus === "failed"
                                ? `This file did not pass the check, so it cannot be opened or reviewed${document.scanReason ? ` — ${document.scanReason}` : ""}. The captain has been asked to upload it again.`
                                : "Still being checked. Review opens once the file passes."}
                        </span>
                    </p>
                )}

                {document.reviewable && (
                    <div className="flex flex-wrap items-center gap-2 mt-3">
                        <a
                            href={document.url ?? undefined}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border border-[var(--background-primary)]/30 text-[var(--background-primary)] hover:bg-[var(--background-primary)]/5 focus-visible:outline-2 focus-visible:outline-offset-2 transition-colors duration-300"
                        >
                            <Icon path={mdiOpenInNew} size={0.7} />
                            Open document
                        </a>

                        {document.status !== "approved" && (
                            <button
                                disabled={isBusy}
                                onClick={() => review(document, "approved")}
                                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl bg-primary text-[var(--foreground)] font-semibold hover:opacity-90 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 transition-opacity duration-300"
                            >
                                <Icon path={mdiCheck} size={0.7} />
                                {isBusy ? "Saving…" : "Approve"}
                            </button>
                        )}

                        {document.status !== "rejected" && (
                            <button
                                disabled={isBusy}
                                onClick={() => { setRejecting(rejecting === document.id ? null : document.id); setReason("") }}
                                className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-xl border border-red-500/40 text-red-600 hover:bg-red-500/5 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 transition-colors duration-300"
                            >
                                <Icon path={mdiClose} size={0.7} />
                                Reject
                            </button>
                        )}
                    </div>
                )}

                {/* The reason is collected BEFORE the request, not after a failure:
                    the server requires one, and the captain is shown it verbatim.
                    "Photo is blurry" tells him what to do; a rejection with no
                    reason gets the same file uploaded again. */}
                {rejecting === document.id && (
                    <div className="mt-3 w-full">
                        <label htmlFor={`reason-${document.id}`} className="text-sm text-gray-500">
                            Why are you rejecting this? The captain sees this message.
                        </label>
                        <textarea
                            id={`reason-${document.id}`}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={2}
                            maxLength={500}
                            placeholder="e.g. The photo is too blurry to read the licence number"
                            className="w-full mt-1 p-2 text-sm rounded-xl border-2 border-[var(--background-muted)]/40 focus:border-[var(--background-muted)] outline-none text-[var(--background-primary)] transition-colors duration-300"
                        />
                        <div className="flex gap-2 mt-2">
                            <button
                                disabled={reason.trim().length < 3 || isBusy}
                                onClick={() => review(document, "rejected")}
                                className="text-sm px-3 py-1.5 rounded-xl bg-red-600 text-white font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity duration-300"
                            >
                                {isBusy ? "Saving…" : "Send rejection"}
                            </button>
                            <button
                                onClick={() => { setRejecting(null); setReason("") }}
                                className="text-sm px-3 py-1.5 rounded-xl border border-[var(--background-primary)]/30 text-[var(--background-primary)] hover:bg-[var(--background-primary)]/5 transition-colors duration-300"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // Already labels when they arrive — the admin endpoint maps them, because a
    // list nothing branches on has no reason to cross the wire as type slugs.
    const missingNote = (missing: string[]) => missing.length > 0 && (
        <p className="text-sm text-amber-700 mt-2">Still to upload: {missing.join(", ")}</p>
    )

    return (
        <div className="w-full">
            {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

            <section className="w-full">
                <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-1">The captain</h4>
                {driverOwned.length === 0
                    ? <p className="text-sm text-gray-500 py-2">Nothing uploaded yet.</p>
                    : driverOwned.map(row)}
                {missingNote(data.missing)}
            </section>

            {/* One section per car, because the same document type is simultaneously
                present on one and absent on another. `isActive` is called out
                because approving paperwork on a car he is not driving changes
                nothing about whether he can work today. */}
            {data.vehicles.map((vehicle) => (
                <section key={vehicle.id} className="w-full mt-5">
                    <h4 className="text-xs uppercase tracking-wide text-gray-500 mb-1">
                        {/* labelOf, not the raw class. Cars added before the model
                            was required have none, and the fallback was printing
                            the wire value — "suv_premium" — into a heading. */}
                        {vehicle.number} · {vehicle.model || labelOf(vehicle.class)}
                        {vehicle.isActive && <span className="ml-2 normal-case text-green-700">driving this one</span>}
                    </h4>
                    {forVehicle(vehicle.id).length === 0
                        ? <p className="text-sm text-gray-500 py-2">Nothing uploaded for this car yet.</p>
                        : forVehicle(vehicle.id).map(row)}
                    {missingNote(vehicle.missing)}
                </section>
            ))}

            <section className="w-full mt-6 pt-4 border-t border-[var(--background-primary)]/10">
                <h4 className="font-medium text-[var(--background-primary)]">Conduct</h4>
                <div className="mt-2 flex flex-wrap gap-2">
                    <span className={`${plainChip} ${data.conduct.cancellationCount30Days >= 5 ? "bg-red-500/10 text-red-700" : data.conduct.cancellationCount30Days >= 3 ? "bg-amber-500/10 text-amber-700" : "bg-gray-500/10 text-gray-600"}`}>
                        {data.conduct.cancellationCount30Days} cancellations · 30 days
                    </span>
                    {data.conduct.benefitRestrictedUntil && new Date(data.conduct.benefitRestrictedUntil) > new Date() && (
                        <span className={`${plainChip} bg-amber-500/10 text-amber-700`}>
                            Benefits restricted until {shortDate(data.conduct.benefitRestrictedUntil)}
                        </span>
                    )}
                </div>

                <h5 className="mt-4 text-xs uppercase tracking-wide text-gray-500">Customer complaints</h5>
                {data.conduct.complaints.length === 0 ? (
                    <p className="mt-1 text-sm text-gray-500">No complaints recorded.</p>
                ) : (
                    <div className="mt-2 flex flex-col gap-3">
                        {data.conduct.complaints.map((complaint) => (
                            <div key={complaint.id} className="rounded-xl bg-[var(--background-primary)]/5 p-3">
                                <p className="text-xs text-gray-500">{complaint.booking.reference} · {shortDate(complaint.createdAt)}</p>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                    {complaint.labels.map((label) => (
                                        <span key={label} className={`${plainChip} bg-red-500/10 text-red-700`}>{label}</span>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Which side of the fleet he drives on. Above suspension so the
                destructive action stays last on the screen, and separated from the
                paperwork because it is not a fact about his papers: a partner
                captain is not a captain with something missing. */}
            <section className="w-full mt-6 pt-4 border-t border-[var(--background-primary)]/10">
                <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium text-[var(--background-primary)]">Fleet</h4>
                    <span className={`${plainChip} ${groupChipFor(data.driver.group)}`}>
                        {GROUP_LABELS[data.driver.group]}
                    </span>
                </div>

                {/* The owner's own row. The server refuses to move it, so the button
                    is not offered — an admin should not find that out from a 409. */}
                {data.driver.group === "admin" ? (
                    <p className="text-sm text-gray-500 mt-1">
                        Every scheduled ride is held for him before it reaches the fleet, so this row can't be moved from here.
                    </p>
                ) : (
                    <>
                        <p className="text-sm text-gray-500 mt-1">
                            {data.driver.group === "rcs"
                                ? "Offered scheduled rides before partner captains, and ranked ahead of them on ride-now."
                                : "Offered scheduled rides only once the RCS fleet has passed on them."}
                        </p>
                        {/* One click each way, and no confirmation: the move is
                            reversible by the button that replaces this one, and it
                            changes queue order rather than whether he can work. */}
                        <button
                            disabled={groupBusy}
                            onClick={() => moveGroup(data.driver.group === "rcs" ? "partner" : "rcs")}
                            className="mt-3 text-sm px-3 py-1.5 rounded-xl border border-[var(--background-primary)]/30 text-[var(--background-primary)] hover:bg-[var(--background-primary)]/5 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 transition-colors duration-300"
                        >
                            {groupBusy
                                ? "Saving…"
                                : data.driver.group === "rcs"
                                    ? "Move to partner captains"
                                    : "Move to RCS fleet"}
                        </button>
                    </>
                )}
            </section>

            {/* Suspension sits apart from the documents on purpose. It is a
                judgement about conduct, not about paperwork, and a captain can be
                fully approved and suspended at the same time. */}
            <section className="w-full mt-6 pt-4 border-t border-[var(--background-primary)]/10">
                {data.driver.suspendedAt ? (
                    <>
                        <h4 className="font-medium text-red-600">Suspended {shortDate(data.driver.suspendedAt)}</h4>
                        {data.driver.suspensionReason && (
                            <p className="text-sm text-gray-500 mt-0.5">{data.driver.suspensionReason}</p>
                        )}
                        <button
                            disabled={suspendBusy}
                            onClick={() => toggleSuspension(false)}
                            className="mt-3 text-sm px-3 py-1.5 rounded-xl bg-primary text-[var(--foreground)] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity duration-300"
                        >
                            {suspendBusy ? "Saving…" : "Lift suspension"}
                        </button>
                    </>
                ) : suspendOpen ? (
                    <>
                        <label htmlFor={`suspend-${driverId}`} className="text-sm text-gray-500">
                            Why is {data.driver.name} being suspended? He is shown this, and it is the only record of why.
                        </label>
                        <textarea
                            id={`suspend-${driverId}`}
                            value={suspendReason}
                            onChange={(e) => setSuspendReason(e.target.value)}
                            rows={2}
                            maxLength={500}
                            placeholder="e.g. Asked a rider for cash on top of the fare, 12 Aug"
                            className="w-full mt-1 p-2 text-sm rounded-xl border-2 border-[var(--background-muted)]/40 focus:border-[var(--background-muted)] outline-none text-[var(--background-primary)] transition-colors duration-300"
                        />
                        <div className="flex gap-2 mt-2">
                            <button
                                disabled={suspendReason.trim().length < 3 || suspendBusy}
                                onClick={() => toggleSuspension(true)}
                                className="text-sm px-3 py-1.5 rounded-xl bg-red-600 text-white font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity duration-300"
                            >
                                {suspendBusy ? "Saving…" : "Suspend captain"}
                            </button>
                            <button
                                onClick={() => { setSuspendOpen(false); setSuspendReason("") }}
                                className="text-sm px-3 py-1.5 rounded-xl border border-[var(--background-primary)]/30 text-[var(--background-primary)] hover:bg-[var(--background-primary)]/5 transition-colors duration-300"
                            >
                                Cancel
                            </button>
                        </div>
                    </>
                ) : (
                    <button
                        onClick={() => setSuspendOpen(true)}
                        className="text-sm px-3 py-1.5 rounded-xl border border-red-500/40 text-red-600 hover:bg-red-500/5 transition-colors duration-300"
                    >
                        Suspend captain
                    </button>
                )}
            </section>
        </div>
    )
}

export default DriverReview

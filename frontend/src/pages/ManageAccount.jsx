import { useState, useEffect } from "react"
import Icon from '@mdi/react';
import { mdiPlus, mdiClose, mdiLock, mdiChevronDown, mdiTrayArrowDown, mdiCheck } from '@mdi/js';
import { useViewNavigate } from "../hooks/useViewNavigate";
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import Button from "../components/ui/Button";
import AccountLayout from "../components/ui/AccountLayout";
import SettingRow from "../components/ui/SettingRow";
import CircleIconButton from "../components/ui/CircleIconButton";
import ErrorMark from "../components/illustrations/ErrorMark";

// Keeps a dropdown mounted through its closing animation, then unmounts it.
function useExitAnim(open, duration) {
    const [mounted, setMounted] = useState(open);
    const [closing, setClosing] = useState(false);

    useEffect(() => {
        if (open) {
            setMounted(true);
            setClosing(false);
            return;
        }
        if (!mounted) return;
        setClosing(true);
        const t = setTimeout(() => {
            setMounted(false);
            setClosing(false);
        }, duration);
        return () => clearTimeout(t);
    }, [open, mounted, duration]);

    return { mounted, closing };
}

const genderOptions = ["Male", "Female", "Others", "Rather not say"]

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
    const [selected, setSelected] = useState(0)
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
    const { getMe, updateGender: updateGenderApi, updateEmergencyContact: updateEmergencyContactApi, updateDOB: updateDOBApi, deleteMe, logout, downloadMyData } = useApi()


    useEffect(() => {
        let active = true
        getMe().then(me => {
            if (!active || !me || me.error) return
            if (me.name) setUsername(me.name)
            if (me.gender) setGender(me.gender)
            if (me.dob) setDOB(me.dob)
            if (me.emergencyContact) setEmergencyContact(me.emergencyContact)
        }).catch(() => { })
        return () => { active = false }
    }, [])

    const items = ["Account information", "Privacy & Data"]

    const lockedFields = ["Name", "Phone number"]
    const AccountInfo_items = [
        ["Name", username, "Your name is linked to your verified identity and can't be edited."],
        ["Phone number", phone, "Your phone number is tied to your account and can't be changed."],
        ["Gender", gender],
        ["Emergency Contact", emergencyContact],
        ["DOB", dob]
    ]

    const field = expanded && expanded[0]
    const isLocked = lockedFields.includes(field)

    useEffect(() => {
        setError(null)
        setConfirmText("")
        if (field === "Gender") setGenderSelected(gender || "Not Selected")
        else if (field === "Emergency Contact") setFieldValue(emergencyContact || "")
        else if (field === "DOB") setFieldValue(dob || "")
    }, [field, gender, emergencyContact, dob])

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

    return (
        <AccountLayout items={items} selected={selected} onSelect={setSelected} title="Manage Account">
                    <Button
                        className={`${expanded ? "block animate-datetime" : "hidden animate-datetime-out"} z-200 py-6 flex flex-col justify-center items-center fixed left-1/2 top-1/2 -translate-x-1/2 mt-10 -translate-y-1/2 hover:opacity-[1]`}
                        prop={{ variant: "dropdown", width: "310px" }}
                    >
                        <Icon onClick={() => setExpanded(null)} className="text-[var(--foreground)] w-full right-4 top-4 absolute opacity-[0.8] transition-opacity duration-300 hover:opacity-[1]" path={mdiClose} size={1} />

                        {isLocked
                            ? <div className="flex flex-col justify-center px-3 w-full items-center text-center">
                                <ErrorMark className="mb-2" size={140} />
                                <h2 className="text-2xl">{expanded[2]}</h2>
                            </div>
                            : <div className="flex flex-col gap-3 w-full justify-center px-3 pt-3 items-center text-center">
                                <h2 className="text-2xl">{expanded === "deactivate" ? "Before you deactivate" : expanded === "drivers" ? "What your driver sees" : `${field}`}</h2>
                                <p className="-mt-2 mb-5 text-sm text-[var(--foreground-muted)]/70">{expanded === "deactivate" ? "This can't be undone." : expanded === "drivers" ? "The details shared with a driver when they accept your ride." : `${fieldDescriptions[field]}`}</p>

                                {/* PLACEHOLDER — reconcile with the real driver route once it exists (see ROADMAP IMP) */}
                                {expanded === "drivers" && (
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
                                {expanded === "deactivate" && (
                                    <div className="w-full flex flex-col gap-4 mb-1">
                                        <ul className="list-disc pl-5 flex flex-col gap-2 text-left text-sm text-[var(--foreground-muted)]/70 marker:text-[var(--foreground-muted)]/40">
                                            <li>Your personal details are erased — name, gender, DOB, and emergency contact.</li>
                                            <li>Your past rides are kept anonymously for our records.</li>
                                            <li>You're signed out on all your devices.</li>
                                            <li>You can sign up again with this number, but your history won't return.</li>
                                        </ul>
                                        <input
                                            type="text"
                                            value={confirmText}
                                            onChange={(e) => setConfirmText(e.target.value)}
                                            placeholder={`Type "Deactivate"`}
                                            className="w-full rounded-full py-2 px-3 text-base text-center text-[var(--text)] bg-transparent outline-none placeholder:text-[var(--foreground-muted)]/50 border border-[var(--foreground)]/30"
                                        />
                                    </div>
                                )}

                                {/* Gender — dropdown selector */}
                                <div onClick={() => setDropdownExpand(!dropdownExpand)} className={`${field === "Gender" ? "block" : "hidden"} relative w-full flex items-center rounded-full py-2 justify-between px-3 border border-[var(--foreground)]/30`}>
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
                                        className={`w-full rounded-full py-2 px-3 text-lg text-center text-[var(--text)] bg-transparent outline-none placeholder:text-[var(--foreground-muted)]/50 border ${(field === "DOB" && fieldValue && !dobValid) || (field === "Emergency Contact" && fieldValue && fieldValue.length !== 10) ? "border-[rgba(239,68,68,0.5)]" : "border-[var(--foreground)]/30"}`}
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

                                <Button className={`${expanded === 'deactivate' || expanded === 'drivers' ? "hidden" : "block"}`} onClick={handleUpdate}
                                    prop={{
                                        variant: "",
                                        width: "240px",
                                        disabled: updateDisabled || loading,
                                    }}
                                >
                                    {loading ? "Saving…" : "Update"}
                                </Button>
                                <Button className={`${expanded === 'deactivate' ? "block" : "hidden"}`} onClick={handleDeactivate}
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
            <ul className="flex flex-col items-start gap-4 justify-center w-full">
                {selected === 0
                    ? AccountInfo_items.map((item, i) => (
                        <SettingRow key={i} trailing={<CircleIconButton icon={mdiPlus} onClick={() => setExpanded(item)} />}>
                            <p className="flex items-center justify-start gap-1 text-base text-[var(--background-primary)]/50">{item[0]} <Icon className={`${lockedFields.includes(item[0]) ? "block" : "hidden"} -mt-0.5 opacity-[0.9]`} path={mdiLock} size={0.6} /> </p>
                            <h4 className="text-lg font-medium">{item[1] ? `${item[1]}` : "Not added yet"}</h4>
                        </SettingRow>
                    ))
                    : <>
                        <SettingRow trailing={<CircleIconButton icon={mdiPlus} onClick={() => setExpanded('drivers')} />}>
                            <h4 className="text-lg font-medium">What drivers see</h4>
                            <p className="flex items-center justify-start gap-1 text-base text-[var(--background-primary)]/50">The details a driver can see about you.</p>
                        </SettingRow>
                        <SettingRow trailing={<CircleIconButton icon={mdiTrayArrowDown} size={0.85} disabled={downloading} onClick={handleDownload} />}>
                            <h4 className="text-lg font-medium">Download my data</h4>
                            <p className={`flex items-center justify-start gap-1 text-base ${downloadError ? "text-[rgba(239,68,68,0.9)]" : "text-[var(--background-primary)]/50"}`}>{downloadError || (downloading ? "Preparing your download…" : "Get a copy of your profile and ride history.")}</p>
                        </SettingRow>
                        <SettingRow trailing={<CircleIconButton icon={mdiPlus} onClick={() => setExpanded('deactivate')} />}>
                            <h4 className="text-lg font-medium">Deactivate your account</h4>
                            <p className="flex items-center justify-start gap-1 text-base text-[var(--background-primary)]/50">Find out how to deactivate your account</p>
                        </SettingRow>
                    </>
                }
            </ul>
        </AccountLayout>
    )
}

export default ManageAccount

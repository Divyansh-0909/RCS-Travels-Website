import { useState, useEffect } from "react"
import Icon from '@mdi/react';
import { mdiKeyboardBackspace, mdiPlus, mdiClose, mdiLock, mdiChevronDown } from '@mdi/js';
import { useViewNavigate } from "../hooks/useViewNavigate";
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import Button from "../components/ui/Button";
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

const ManageAccount = () => {
    const username = useData(state => state.username)
    const setUsername = useData(state => state.setUsername)
    const phone = useData(state => state.phone)
    const gender = useData(state => state.gender)
    const setGender = useData(state=>state.setGender)
    const emergencyContact = useData(state => state.emergencyContact)
    const setEmergencyContact = useData(state => state.setEmergencyContact)
    const dob = useData(state => state.dob)
    const setDOB = useData(state => state.setDOB)
    const [selected, setSelected] = useState(0)
    const navigate = useViewNavigate();
    const [expanded, setExpanded] = useState(null)
    const [genderSelected, setGenderSelected] = useState("Not Selected")
    const [fieldValue, setFieldValue] = useState("")
    const [dropdownExpand, setDropdownExpand] = useState(false)
    const [saving, setSaving] = useState(false)
    const [apiError, setApiError] = useState(null)
    const genderDropdown = useExitAnim(dropdownExpand, 220)
    const { getMe, updateGender: updateGenderApi, updateEmergencyContact: updateEmergencyContactApi, updateDOB: updateDOBApi } = useApi()


    useEffect(() => {
        let active = true
        getMe().then(me => {
            if (!active || !me || me.error) return
            if (me.name) setUsername(me.name)
            if (me.gender) setGender(me.gender)
            if (me.dob) setDOB(me.dob)
            if (me.emergencyContact) setEmergencyContact(me.emergencyContact)
        }).catch(() => {})
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
        setApiError(null)
        if (field === "Gender") setGenderSelected(gender || "Not Selected")
        else if (field === "Emergency Contact") setFieldValue(emergencyContact || "")
        else if (field === "DOB") setFieldValue(dob || "")
    }, [field, gender, emergencyContact, dob])

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

        setSaving(true)
        setApiError(null)
        try {
            let res
            if (field === "Gender") res = await updateGenderApi(genderSelected)
            else if (field === "Emergency Contact") res = await updateEmergencyContactApi(fieldValue)
            else if (field === "DOB") res = await updateDOBApi(fieldValue)

            if (res?.error) {
                setApiError(res.error)
                return
            }

            if (field === "Gender") setGender(genderSelected)
            else if (field === "Emergency Contact") setEmergencyContact(fieldValue)
            else if (field === "DOB") setDOB(fieldValue)
            setExpanded(null)
        } catch {
            setApiError("Something went wrong. Please try again.")
        } finally {
            setSaving(false)
        }
    }

    return (
        <div className="w-[100vw] h-[100vh] flex flex-col justify-center items-center px-5 pb-10 sm:px-10">
            <div className="flex w-full justify-start items-center py-8 [&>*]:cursor-pointer [&>*]:opacity-[0.85] [&>*]:transition-opacity [&>*]:duration-300 [&>*]:hover:opacity-[1]">
                <h3 onClick={() => navigate('/')} className={`sm:block hidden text-[var(--background-primary)] text-2xl  pl-1 opacity-[0.85] transition-opacity duration-300 hover:opacity-[1]`}><span className='font-semibold'>RCS</span> travels</h3>
                <Icon onClick={() => navigate('/')} className="sm:hidden block text-[var(--background-primary)]" path={mdiKeyboardBackspace} size={1.2} />
            </div>
            <div className="w-full h-full flex gap-5 justify-center items-center">
                <div className="w-[20%] flex justify-center items-start h-full">
                    <ul className="flex flex-col items-start justify-center w-full">
                        {items.map((item, i) => {
                            return (
                                <li key={i} onClick={() => setSelected(i)} className={`font-normal text-3xl w-full cursor-pointer select-none py-3 px-4 rounded-2xl flex justify-start gap-2 transition-color duration-300 items-center ${selected === i ? "bg-[var(--background-primary)] hover:bg-[var(--background-primary)] text-[var(--text)]" : "hover:bg-[var(--background-primary)]/5 text-[var(--text-foreground)]"} `}>
                                    <h4 >{item}</h4>
                                </li>
                            )
                        })}
                    </ul>
                </div>
                <div className="w-[80%] flex flex-col rounded-3xl justify-start items-start h-full">
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
                                <h2 className="text-2xl">{field}</h2>

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
                                {apiError && (
                                    <p className="-mt-1 text-sm text-[rgba(239,68,68,0.9)]">{apiError}</p>
                                )}

                                <Button onClick={handleUpdate}
                                    prop={{
                                        variant: "",
                                        width: "240px",
                                        disabled: updateDisabled || saving,
                                    }}
                                >
                                    {saving ? "Saving…" : "Update"}
                                </Button>
                            </div>}
                    </Button>
                    <h3 className="text-4xl text-[var(--text-foreground)] font-semibold pb-4 sm:pb-6 px-4">{selected === 0 ? "Account information" : "Privacy & Data"}</h3>
                    <ul className="flex flex-col items-start gap-4 justify-center w-full">
                        {selected === 0
                            ? AccountInfo_items.map((item, i) => {
                                return (
                                    <li key={i} className={`font-normal text-3xl w-full cursor-pointer select-none py-4 px-6 rounded-2xl flex justify-between items-center gap-1 items-center bg-[var(--background-primary)]/5 text-[var(--text-foreground)]`}>
                                        <div>
                                            <p className="flex items-center justify-start gap-1 text-base text-[var(--background-primary)]/50">{item[0]} <Icon className={`${lockedFields.includes(item[0]) ? "block" : "hidden"} -mt-0.5 opacity-[0.9]`} path={mdiLock} size={0.6} /> </p>
                                            <h4 className="text-lg font-medium">{item[1] ? `${item[1]}` : "Not added yet"}</h4>
                                        </div>

                                        <div onClick={() => setExpanded(item)} className="cursor-pointer bg-[var(--background-primary)]/80 text-[var(--foreground)] transition-color duration-300 hover:bg-[var(--background-primary)] p-1 rounded-full">
                                            <Icon path={mdiPlus} size={1} />
                                        </div>
                                    </li>
                                )
                            })
                            : <></>
                        }
                    </ul>
                </div>
            </div>
        </div>
    )
}

export default ManageAccount

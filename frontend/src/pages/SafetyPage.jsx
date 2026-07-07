import { useState, useEffect } from "react"
import Icon from '@mdi/react';
import { mdiCheck, mdiClose, mdiPencil, mdiPlus, mdiPhone } from '@mdi/js';
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import AccountLayout from "../components/ui/AccountLayout";
import SettingRow from "../components/ui/SettingRow";
import CircleIconButton from "../components/ui/CircleIconButton";
import Toggle from "../components/ui/Toggle";

const items = ["Emergency contact", "Live location", "Helpline"]

// tel: numbers reachable from the Helpline section. Support is a placeholder.
const helplines = [
    ["RCS Support", "Questions or issues with your ride.", "+911800000000"],
    ["Police", "National emergency number.", "112"],
    ["Ambulance", "Medical emergencies.", "108"],
]

const SafetyPage = () => {
    const emergencyContact = useData(state => state.emergencyContact)
    const setEmergencyContact = useData(state => state.setEmergencyContact)
    const [selected, setSelected] = useState(0)
    const { getMe, updateEmergencyContact: updateEmergencyContactApi } = useApi()

    // The contact lives server-side; hydrate it so this page shows the real value.
    useEffect(() => {
        let active = true
        getMe().then(me => {
            if (!active || !me || me.error) return
            if (me.emergencyContact) setEmergencyContact(me.emergencyContact)
        }).catch(() => { })
        return () => { active = false }
    }, [])

    const [editingContact, setEditingContact] = useState(false)
    const [contactInput, setContactInput] = useState("")
    const [contactError, setContactError] = useState(null)
    const [savingContact, setSavingContact] = useState(false)

    const startEdit = () => { setEditingContact(true); setContactError(null); setContactInput(emergencyContact || "") }
    const cancelEdit = () => { setEditingContact(false); setContactError(null) }
    const saveContact = async () => {
        if (!/^\d{10}$/.test(contactInput)) { setContactError("Enter a 10-digit number"); return }
        setSavingContact(true)
        setContactError(null)
        try {
            const res = await updateEmergencyContactApi(contactInput)
            if (res?.error) { setContactError(res.error); return }
            setEmergencyContact(contactInput)
            setEditingContact(false)
        } catch {
            setContactError("Something went wrong. Please try again.")
        } finally {
            setSavingContact(false)
        }
    }

    // Live-location sharing has no backend yet — local UI state for now.
    const [autoShare, setAutoShare] = useState(true)

    return (
        <AccountLayout items={items} selected={selected} onSelect={setSelected}>
            <ul className="flex flex-col items-start gap-4 justify-center w-full">
                {selected === 0 && (
                    editingContact ? (
                        <li className="w-full flex flex-col gap-2 select-none py-4 px-6 rounded-2xl bg-[var(--background-primary)]/5">
                            <div className="w-full flex items-center gap-2">
                                <input
                                    autoFocus
                                    type="tel"
                                    inputMode="numeric"
                                    value={contactInput}
                                    onChange={(e) => setContactInput(e.target.value.replace(/\D/g, "").slice(0, 10))}
                                    onKeyDown={(e) => { if (e.key === "Enter") saveContact(); if (e.key === "Escape") cancelEdit() }}
                                    placeholder="XXXXX XXXXX"
                                    className={`w-full rounded-full py-2 px-3 text-base text-[var(--text-foreground)] bg-transparent outline-none placeholder:text-[var(--background-primary)]/40 border ${contactError ? "border-[rgba(239,68,68,0.5)]" : "border-[var(--background-primary)]/30"}`}
                                />
                                <CircleIconButton icon={mdiCheck} size={0.9} disabled={savingContact} onClick={saveContact} />
                                <div onClick={cancelEdit} className="cursor-pointer p-1 rounded-full text-[var(--background-primary)]/60 transition-color duration-300 hover:text-[var(--background-primary)]">
                                    <Icon path={mdiClose} size={0.9} />
                                </div>
                            </div>
                            {contactError && <p className="text-sm text-[rgba(239,68,68,0.9)] px-2">{contactError}</p>}
                        </li>
                    ) : (
                        <SettingRow trailing={<CircleIconButton icon={emergencyContact ? mdiPencil : mdiPlus} size={emergencyContact ? 0.8 : 1} onClick={startEdit} />}>
                            <p className="text-base text-[var(--background-primary)]/50">Emergency contact</p>
                            <h4 className="text-lg font-medium">{emergencyContact || "Not added yet"}</h4>
                        </SettingRow>
                    )
                )}
                {selected === 0 && (
                    <p className="text-sm text-[var(--background-primary)]/50 px-2">We'll reach this person if something goes wrong during a ride.</p>
                )}

                {selected === 1 && (
                    <SettingRow trailing={<Toggle on={autoShare} onClick={() => setAutoShare(v => !v)} />}>
                        <h4 className="text-lg font-medium">Share my live location</h4>
                        <p className="text-base text-[var(--background-primary)]/50">Let your emergency contact follow your ride in real time when a trip starts.</p>
                    </SettingRow>
                )}

                {selected === 2 && helplines.map(([title, desc, number]) => (
                    <SettingRow
                        key={title}
                        trailing={<CircleIconButton icon={mdiPhone} size={0.85} onClick={() => { window.location.href = `tel:${number}` }} />}
                    >
                        <h4 className="text-lg font-medium">{title}</h4>
                        <p className="text-base text-[var(--background-primary)]/50">{desc}</p>
                    </SettingRow>
                ))}
            </ul>
        </AccountLayout>
    )
}

export default SafetyPage

import { useState } from "react"
import Icon from '@mdi/react';
import { mdiCheck, mdiPlus, mdiPencil, mdiClose } from '@mdi/js';
import { useData } from "../hooks/useData";
import AccountLayout from "../components/ui/AccountLayout";
import SettingRow from "../components/ui/SettingRow";
import CircleIconButton from "../components/ui/CircleIconButton";
import Toggle from "../components/ui/Toggle";

const items = ["Language", "Notifications", "Saved places"]

const languages = [
    { code: "English", label: "English", sub: "Default" },
    { code: "Hindi", label: "हिन्दी", sub: "Hindi" },
    { code: "Hinglish", label: "Hinglish", sub: "Hindi in Roman script" },
]

const notifRows = [
    ["Ride updates", "Booking confirmations and ride status on WhatsApp.", "whatsapp"],
    ["Push", "Real-time alerts on this device.", "push"],
    ["Promotions", "Occasional offers and news. Off by default.", "promotions"],
]

const SettingsPage = () => {
    const language = useData(state => state.language)
    const setLanguage = useData(state => state.setLanguage)
    const [selected, setSelected] = useState(0)

    // Notifications + saved places have no backend yet — local UI state for now.
    const [notifs, setNotifs] = useState({ whatsapp: true, push: true, promotions: false })
    const toggleNotif = (key) => setNotifs(n => ({ ...n, [key]: !n[key] }))

    const [places, setPlaces] = useState([
        { label: "Home", address: "" },
        { label: "Work", address: "" },
    ])
    const [editingPlace, setEditingPlace] = useState(null)
    const [placeInput, setPlaceInput] = useState("")

    const startEdit = (i) => { setEditingPlace(i); setPlaceInput(places[i].address) }
    const cancelEdit = () => { setEditingPlace(null); setPlaceInput("") }
    const savePlace = () => {
        setPlaces(ps => ps.map((p, i) => i === editingPlace ? { ...p, address: placeInput.trim() } : p))
        cancelEdit()
    }
    const addPlace = () => {
        setPlaces(ps => [...ps, { label: "Saved place", address: "" }])
        setEditingPlace(places.length)
        setPlaceInput("")
    }

    return (
        <AccountLayout items={items} selected={selected} onSelect={setSelected}>
            <ul className="flex flex-col items-start gap-4 justify-center w-full">
                {selected === 0 && languages.map(({ code, label, sub }) => (
                    <SettingRow
                        key={code}
                        onClick={() => setLanguage(code)}
                        trailing={
                            <div className={`p-1 rounded-full ${language === code ? "bg-[var(--background-primary)] text-[var(--foreground)]" : "border border-[var(--background-primary)]/25 text-transparent"}`}>
                                <Icon path={mdiCheck} size={0.85} />
                            </div>
                        }
                    >
                        <h4 className="text-lg font-medium">{label}</h4>
                        <p className="text-base text-[var(--background-primary)]/50">{sub}</p>
                    </SettingRow>
                ))}

                {selected === 1 && notifRows.map(([title, desc, key]) => (
                    <SettingRow key={key} trailing={<Toggle on={notifs[key]} onClick={() => toggleNotif(key)} />}>
                        <h4 className="text-lg font-medium">{title}</h4>
                        <p className="text-base text-[var(--background-primary)]/50">{desc}</p>
                    </SettingRow>
                ))}

                {selected === 2 && (
                    <>
                        {places.map((p, i) => (
                            editingPlace === i ? (
                                <li key={i} className="w-full select-none py-4 px-6 rounded-2xl flex items-center gap-2 bg-[var(--background-primary)]/5">
                                    <input
                                        autoFocus
                                        value={placeInput}
                                        onChange={(e) => setPlaceInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") savePlace(); if (e.key === "Escape") cancelEdit() }}
                                        placeholder={`${p.label} address`}
                                        className="w-full rounded-full py-2 px-3 text-base text-[var(--text-foreground)] bg-transparent outline-none placeholder:text-[var(--background-primary)]/40 border border-[var(--background-primary)]/30"
                                    />
                                    <CircleIconButton icon={mdiCheck} size={0.9} onClick={savePlace} />
                                    <div onClick={cancelEdit} className="cursor-pointer p-1 rounded-full text-[var(--background-primary)]/60 transition-color duration-300 hover:text-[var(--background-primary)]">
                                        <Icon path={mdiClose} size={0.9} />
                                    </div>
                                </li>
                            ) : (
                                <SettingRow
                                    key={i}
                                    trailing={<CircleIconButton icon={p.address ? mdiPencil : mdiPlus} size={p.address ? 0.8 : 1} onClick={() => startEdit(i)} />}
                                >
                                    <p className="text-base text-[var(--background-primary)]/50">{p.label}</p>
                                    <h4 className="text-lg font-medium">{p.address || "Not added yet"}</h4>
                                </SettingRow>
                            )
                        ))}
                        <li onClick={addPlace} className="font-medium text-lg w-full cursor-pointer select-none py-4 px-6 rounded-2xl flex justify-center items-center gap-2 bg-[var(--background-primary)]/5 text-[var(--background-primary)] transition-color duration-300 hover:bg-[var(--background-primary)]/10">
                            <Icon path={mdiPlus} size={0.9} /> Add a place
                        </li>
                    </>
                )}
            </ul>
        </AccountLayout>
    )
}

export default SettingsPage

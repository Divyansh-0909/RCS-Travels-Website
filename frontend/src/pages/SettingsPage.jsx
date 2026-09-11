import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../i18nCopy";
import { useState, useEffect } from "react"
import Icon from '@mdi/react';
import { mdiCheck, mdiPlus, mdiPencil, mdiClose, mdiTrashCanOutline } from '@mdi/js';
import { useData } from "../hooks/useData";
import { useApi } from "../hooks/useApi";
import AccountLayout from "../components/ui/AccountLayout";
import SettingRow from "../components/ui/SettingRow";
import CircleIconButton from "../components/ui/CircleIconButton";
import Toggle from "../components/ui/Toggle";
import LanguageSelector from "../components/LanguageSelector";
import ThemeToggle from "../components/ThemeToggle";
import { useTranslation } from "react-i18next";
import { useWebsiteCopy } from "../hooks/useWebsiteCopy";

const panelTones = {
    theme: "bg-tone-primary",
    language: "bg-tone-primary",
    notifications: "bg-tone-teal",
    savedPlaces: "bg-tone-violet",
}

const settingsListClass = "flex flex-col items-start gap-4 justify-center w-full"

const notifRows = [
    ["Ride updates", "Booking confirmations and ride status on WhatsApp.", "whatsapp"],
    ["Push", "Real-time alerts on this device.", "push"],
    ["Promotions", "Occasional offers and news. Off by default.", "promotions"],
]

const SettingsPage = () => {
    useCopyLanguage();
    const { t } = useTranslation("website")
    const tr = useWebsiteCopy()
    const [selected, setSelected] = useState(0)

    // Notifications have no backend yet — local UI state for now.
    const [notifs, setNotifs] = useState({ whatsapp: true, push: true, promotions: false })
    const toggleNotif = (key) => setNotifs(n => ({ ...n, [key]: !n[key] }))

    // Saved places live on the account. The store holds the last fetched copy
    // (persisted, so the booking form can suggest them before any refresh);
    // every edit here goes through the API and lands back in the store.
    const savedPlaces = useData(state => state.savedPlaces)
    const setSavedPlaces = useData(state => state.setSavedPlaces)
    const { getSavedPlaces, saveSavedPlace, deleteSavedPlace } = useApi()

    // Refresh silently, same as the booking form's recents: the persisted copy
    // still renders, and each edit surfaces its own error when it fails.
    useEffect(() => {
        let mounted = true
        getSavedPlaces().then(data => {
            if (mounted && data?.places) setSavedPlaces(data.places)
        }).catch(() => {})
        return () => { mounted = false }
    }, [])

    const [editingPlace, setEditingPlace] = useState(null)
    const [placeInput, setPlaceInput] = useState("")
    const [placeError, setPlaceError] = useState(null)
    const [savingPlace, setSavingPlace] = useState(false)
    // At most one unsaved custom row being typed; it only exists client-side
    // until its first save.
    const [draft, setDraft] = useState(false)

    // Home and Work are fixed slots shown even before they exist server-side;
    // custom rows follow, then the draft.
    const byLabel = new Map(savedPlaces.map(p => [p.label, p]))
    const places = [
        ...["Home", "Work"].map(label => byLabel.get(label) ?? { label, address: "" }),
        ...savedPlaces.filter(p => p.label !== "Home" && p.label !== "Work"),
        ...(draft ? [{ label: "Saved place", address: "" }] : []),
    ]

    const startEdit = (i) => { setEditingPlace(i); setPlaceError(null); setPlaceInput(places[i].address) }
    const cancelEdit = () => { setEditingPlace(null); setPlaceError(null); setPlaceInput(""); setDraft(false) }
    const savePlace = async () => {
        const p = places[editingPlace]
        if (!p || savingPlace) return
        const address = placeInput.trim()
        if (!address) { setPlaceError(t("settings.enterAddress")); return }
        setSavingPlace(true)
        setPlaceError(null)
        try {
            const res = await saveSavedPlace({ id: p.id, label: p.label, address })
            if (res?.error) { setPlaceError(res.error); return }
            setSavedPlaces(p.id
                ? savedPlaces.map(sp => sp.id === res.place.id ? res.place : sp)
                : [...savedPlaces, res.place])
            setDraft(false)
            setEditingPlace(null)
            setPlaceInput("")
        } catch {
            setPlaceError(t("errors.tryAgain"))
        } finally {
            setSavingPlace(false)
        }
    }
    const addPlace = () => {
        setPlaceError(null)
        setPlaceInput("")
        // A second tap on Add just returns to the draft that's already there.
        setEditingPlace(draft ? places.length - 1 : places.length)
        setDraft(true)
    }
    const removePlace = async (i) => {
        const p = places[i]
        if (!p) return
        if (!p.id) { // unsaved draft — nothing server-side to delete
            if (editingPlace === i) setEditingPlace(null)
            setDraft(false)
            return
        }
        setPlaceError(null)
        try {
            const res = await deleteSavedPlace(p.id)
            if (res?.error) { setPlaceError(res.error); return }
            setSavedPlaces(savedPlaces.filter(sp => sp.id !== p.id))
            // Keep the edit state pointing at the same place once indexes shift.
            if (editingPlace === i) cancelEdit()
            else if (editingPlace !== null && editingPlace > i) setEditingPlace(editingPlace - 1)
        } catch {
            setPlaceError(t("settings.deletePlaceError"))
        }
    }

    return (
        <AccountLayout
            items={[t("settings.theme"), t("settings.language"), t("settings.notifications"), t("settings.savedPlaces")]}
            selected={selected}
            onSelect={setSelected}
            title={t("settings.title")}
        >
            {selected === 0 && <ThemeToggle tone={panelTones.theme} />}

            {selected === 1 && <LanguageSelector tone={panelTones.language} />}

            {selected === 2 && (
                <ul className={settingsListClass}>
                {notifRows.map(([title, desc, key]) => (
                    <SettingRow key={key} tone={panelTones.notifications} trailing={<Toggle on={notifs[key]} onClick={() => toggleNotif(key)} />}>
                        <h4 className="break-words text-lg font-medium">{tr(title)}</h4>
                        <p className="break-words text-base text-ink-muted">{tr(desc)}</p>
                    </SettingRow>
                ))}
                </ul>
            )}

            {selected === 3 && (
                <ul className={settingsListClass}>
                        {places.map((p, i) => (
                            editingPlace === i ? (
                                <li key={i} className="w-full select-none py-5 px-6 rounded-3xl flex items-center justify-between gap-3 bg-tone-violet">
                                    <input
                                        autoFocus
                                        value={placeInput}
                                        onChange={(e) => setPlaceInput(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") savePlace(); if (e.key === "Escape") cancelEdit() }}
                                        placeholder={t("settings.addressPlaceholder", { place: p.label })}
                                        className="flex-1 min-w-0 rounded-xl py-2 px-3 text-base text-ink bg-transparent outline-none placeholder:text-ink-muted/60 border border-border"
                                    />
                                    <div className="flex items-center gap-2 shrink-0">
                                        <CircleIconButton icon={mdiCheck} size={0.9} disabled={savingPlace} onClick={savePlace} />
                                        <div onClick={cancelEdit} className="cursor-pointer p-1 rounded-full text-ink-muted transition-colors duration-300 hover:text-ink">
                                            <Icon path={mdiClose} size={0.9} />
                                        </div>
                                    </div>
                                </li>
                            ) : (
                                <SettingRow
                                    key={i}
                                    tone={panelTones.savedPlaces}
                                    trailing={
                                        <div className="flex items-center gap-2 shrink-0">
                                            {/* Home and Work are fixed slots — only extra places can be removed. */}
                                            {!["Home", "Work"].includes(p.label) && (
                                                <div onClick={() => removePlace(i)} className="cursor-pointer p-1 rounded-full text-[var(--color-negative)]/70 transition-color duration-300 hover:text-[var(--color-negative)]">
                                                    <Icon path={mdiTrashCanOutline} size={0.9} />
                                                </div>
                                            )}
                                            <CircleIconButton icon={p.address ? mdiPencil : mdiPlus} size={p.address ? 0.8 : 1} onClick={() => startEdit(i)} />
                                        </div>
                                    }
                                >
                                    <p className="text-base text-ink-muted">{tr(p.label)}</p>
                                    <h4 className="break-words text-lg font-medium">{p.address || t("settings.notAdded")}</h4>
                                </SettingRow>
                            )
                        ))}
                        {placeError && <li className="text-sm text-negative px-2">{placeError}</li>}
                        <li onClick={addPlace} className="font-medium text-lg w-full cursor-pointer select-none py-5 px-6 rounded-3xl flex justify-center items-center gap-2 bg-tone-violet text-ink transition-opacity duration-200 hover:opacity-80">
                            <Icon path={mdiPlus} size={0.9} /> {t("settings.addPlace")}
                        </li>
                </ul>
            )}
        </AccountLayout>
    )
}

export default SettingsPage

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
import IconButton from "../components/ui/IconButton";
import SavedPlaceAddressField from "../components/ui/SavedPlaceAddressField";
import { fieldClass } from "../components/ui/fieldStyles";
import { PLACE_NAME_LIMIT, savedPlaceValidity } from "../lib/savedPlaceValidation";
import Toggle from "../components/ui/Toggle";
import LanguageSelector from "../components/LanguageSelector";
import ThemeToggle from "../components/ThemeToggle";
import { useTranslation } from "react-i18next";
import { useWebsiteCopy } from "../hooks/useWebsiteCopy";

const panelTones = {
    theme: "bg-surface-muted",
    language: "bg-surface-muted",
    notifications: "bg-surface-muted",
    savedPlaces: "bg-surface-muted",
}

const settingsListClass = "flex min-h-0 w-full flex-1 flex-col items-start justify-start gap-4 overflow-y-auto"

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

    const [notifs, setNotifs] = useState({ whatsapp: true, push: true, promotions: false })
    const [notifsLoading, setNotifsLoading] = useState(true)
    const [savingNotif, setSavingNotif] = useState(null)
    const [notifsError, setNotifsError] = useState(null)

    // Saved places live on the account. The store holds the last fetched copy
    // (persisted, so the booking form can suggest them before any refresh);
    // every edit here goes through the API and lands back in the store.
    const savedPlaces = useData(state => state.savedPlaces)
    const setSavedPlaces = useData(state => state.setSavedPlaces)
    const { getSavedPlaces, saveSavedPlace, deleteSavedPlace, getPreferences, updatePreferences } = useApi()

    useEffect(() => {
        let mounted = true
        getPreferences().then(data => {
            if (!mounted) return
            if (data?.error || !data?.notifications) throw new Error(data?.error || "Request failed")
            setNotifs(data.notifications)
            setNotifsError(null)
        }).catch(() => {
            if (mounted) setNotifsError(tr("Couldn't load notification preferences."))
        }).finally(() => {
            if (mounted) setNotifsLoading(false)
        })
        return () => { mounted = false }
    }, [])

    const toggleNotif = async (key) => {
        if (notifsLoading || savingNotif) return
        const nextValue = !notifs[key]
        setNotifs(n => ({ ...n, [key]: nextValue }))
        setSavingNotif(key)
        setNotifsError(null)
        try {
            const res = await updatePreferences({ notifications: { [key]: nextValue } })
            if (res?.error) throw new Error(res.error)
        } catch {
            setNotifs(n => ({ ...n, [key]: !nextValue }))
            setNotifsError(tr("Couldn't save this preference. Please try again."))
        } finally {
            setSavingNotif(null)
        }
    }

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
    const [placeLabel, setPlaceLabel] = useState("")
    const [placeError, setPlaceError] = useState(null)
    const [savingPlace, setSavingPlace] = useState(false)
    const [placeCoords, setPlaceCoords] = useState(null)
    const [resolvingPlace, setResolvingPlace] = useState(false)
    // At most one unsaved custom row being typed; it only exists client-side
    // until its first save.
    const [draft, setDraft] = useState(false)

    // Home and Work are initial suggestions. A renamed place fills the vacated
    // position rather than creating an extra empty card above the edited row.
    const home = savedPlaces.find(p => p.label === "Home")
    const work = savedPlaces.find(p => p.label === "Work")
    const otherPlaces = savedPlaces.filter(p => p !== home && p !== work)
    const places = [
        home ?? otherPlaces.shift() ?? { label: "Home", address: "" },
        work ?? otherPlaces.shift() ?? { label: "Work", address: "" },
        ...otherPlaces,
        ...(draft ? [{ label: "Saved place", address: "" }] : []),
    ]

    const validity = savedPlaceValidity({ name: placeLabel, address: placeInput, original: places[editingPlace], coordinates: placeCoords, resolving: resolvingPlace })
    const startEdit = (i) => { if (savingPlace) return; setEditingPlace(i); setPlaceError(null); setPlaceInput(places[i].address); setPlaceLabel(places[i].label); setPlaceCoords(null); setResolvingPlace(false) }
    const cancelEdit = () => { if (savingPlace) return; setEditingPlace(null); setPlaceError(null); setPlaceInput(""); setPlaceLabel(""); setDraft(false); setPlaceCoords(null); setResolvingPlace(false) }
    const savePlace = async () => {
        const p = places[editingPlace]
        if (!p || savingPlace || !validity.valid) return
        const address = placeInput.trim()
        const label = placeLabel.trim()
        if (!label) { setPlaceError(tr("Enter a place name")); return }
        if (!address) { setPlaceError(t("settings.enterAddress")); return }
        setSavingPlace(true)
        setPlaceError(null)
        try {
            const coords = placeCoords ?? (address === p.address?.trim() ? { lat: p.lat, lng: p.lng } : {})
            const res = await saveSavedPlace({ id: p.id, label, address, ...coords })
            if (res?.error) { setPlaceError(res.error); return }
            setSavedPlaces(p.id
                ? savedPlaces.map(sp => sp.id === res.place.id ? res.place : sp)
                : [...savedPlaces, res.place])
            setDraft(false)
            setEditingPlace(null)
            setPlaceInput("")
            setPlaceLabel("")
        } catch {
            setPlaceError(t("errors.tryAgain"))
        } finally {
            setSavingPlace(false)
        }
    }
    const addPlace = () => {
        if (savingPlace) return
        if (draft) { setEditingPlace(places.length - 1); return }
        setPlaceError(null)
        setPlaceInput("")
        setPlaceLabel("")
        setPlaceCoords(null)
        setResolvingPlace(false)
        // A second tap on Add just returns to the draft that's already there.
        setEditingPlace(draft ? places.length - 1 : places.length)
        setDraft(true)
    }
    const removePlace = async (i) => {
        if (savingPlace) return
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
                    <SettingRow key={key} tone={panelTones.notifications} trailing={<Toggle aria-label={tr(title)} on={notifs[key]} disabled={notifsLoading || savingNotif !== null} onClick={() => toggleNotif(key)} />}>
                        <h4 className="break-words text-lg font-medium">{tr(title)}</h4>
                        <p className="break-words text-base text-ink-muted">{tr(desc)}</p>
                    </SettingRow>
                ))}
                {notifsError && <li className="px-2 text-sm text-negative">{notifsError}</li>}
                </ul>
            )}

            {selected === 3 && (
                <ul className={settingsListClass}>
                        {places.map((p, i) => (
                            editingPlace === i ? (
                                <SettingRow key={i} tone={panelTones.savedPlaces} className="gap-0! items-start! [&>div:first-child]:pr-0 [&>div:last-child]:hidden" aria-busy={savingPlace}>
                                    <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
                                        <div className="min-w-0">
                                            <div className="mb-1 flex items-center justify-between gap-1 text-xs leading-4 text-ink-muted">
                                                <label htmlFor="saved-place-name">{tr("Place name")}</label>
                                                <span id="saved-place-name-limit" className="shrink-0 tabular-nums">{placeLabel.length}/{PLACE_NAME_LIMIT}</span>
                                            </div>
                                            <input id="saved-place-name" required minLength={1} aria-label={tr("Place name")} aria-describedby="saved-place-name-limit" aria-invalid={Boolean(placeError && !validity.nameValid)} value={placeLabel} maxLength={PLACE_NAME_LIMIT} disabled={savingPlace} onChange={(event) => setPlaceLabel(event.target.value)} onKeyDown={(event) => { if (event.nativeEvent.isComposing) return; if (event.key === "Enter") { event.preventDefault(); savePlace() } if (event.key === "Escape") cancelEdit() }} placeholder={tr("Place name")} className={fieldClass + " disabled:opacity-60"} />
                                        </div>
                                        <div className="col-span-2 row-start-2 min-w-0 lg:col-span-1 lg:col-start-2 lg:row-start-1">
                                            <SavedPlaceAddressField aria-label={tr("Address")} value={placeInput} onChange={(value) => { setPlaceInput(value); setPlaceCoords(null) }} onResolve={setPlaceCoords} onResolving={setResolvingPlace} onCommit={savePlace} onCancel={cancelEdit} disabled={savingPlace} valid={validity.addressValid && validity.locationValid} placeholder={t("settings.addressPlaceholder", { place: p.label })} />
                                        </div>
                                        <div className="col-start-2 row-start-1 flex items-center gap-1 pt-5 lg:col-start-3">
                                            <IconButton ariaLabel={tr("Save place")} icon={mdiCheck} size={0.9} disabled={savingPlace || !validity.valid} onClick={savePlace} faceClassName="bg-strong text-on-strong" />
                                            <IconButton ariaLabel={tr("Cancel editing")} icon={mdiClose} size={0.9} disabled={savingPlace} onClick={cancelEdit} faceClassName="bg-white text-black" />
                                        </div>
                                    </div>
                                </SettingRow>
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
                                            <CircleIconButton ariaLabel={tr(p.address ? "Edit place" : "Add place") + " " + p.label} icon={p.address ? mdiPencil : mdiPlus} size={p.address ? 0.8 : 1} disabled={savingPlace} onClick={() => startEdit(i)} />
                                        </div>
                                    }
                                >
                                    <p className="text-base text-ink-muted">{tr(p.label)}</p>
                                    <h4 className="break-words text-lg font-medium">{p.address || t("settings.notAdded")}</h4>
                                </SettingRow>
                            )
                        ))}
                        {placeError && <li id="saved-place-error" role="alert" className="text-sm text-negative px-2">{placeError}</li>}
                        <li className="account-panel-motion w-full">
                            <button type="button" disabled={savingPlace} onClick={addPlace} className="font-medium text-lg w-full cursor-pointer select-none py-5 px-6 rounded-3xl flex justify-center items-center gap-2 bg-surface-muted text-ink transition-transform duration-150 ease-out active:scale-[0.99] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-60">
                                <Icon path={mdiPlus} size={0.9} /> {t("settings.addPlace")}
                            </button>
                        </li>
                </ul>
            )}
        </AccountLayout>
    )
}

export default SettingsPage

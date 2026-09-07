import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../../i18nCopy";
import Icon from '@mdi/react';
import { mdiMenu, mdiClose, mdiAccountCircle, mdiChevronDown, mdiCog, mdiInformation, mdiShieldCheck, mdiMapMarkerOutline, mdiClockTimeFourOutline } from '@mdi/js';
import { useViewNavigate } from "../../hooks/useViewNavigate";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApi } from '../../hooks/useApi';
import { useSignIn, useAuth, useUser } from "@clerk/clerk-react";
import Button from './Button';
import { useData } from '../../hooks/useData';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useExitAnim } from '../../hooks/useExitAnim';
import { scrollToSection, scrollToTop } from '../../hooks/useSmoothScroll';
import { useLocation } from 'react-router-dom';
import pfpPlaceholder from "../../assets/pfp-placeholder.webp"
import { angledVehicleImageOf } from "../../constants/vehicleImages"
import { labelOf } from "../../constants/vehicles"
import Skeleton from './Skeleton';
import ErrorPanel from './ErrorPanel';
import BorderGlow from './BorderGlow';
import { useTranslation } from 'react-i18next';


// The initial-in-a-circle, at whatever size the surface needs.
const Avatar = ({ invert, initial, box, text }) => (
    <div className={`${invert ? "bg-[var(--foreground)]" : "bg-[var(--background-primary)]"} flex items-center justify-center rounded-full transition-colors duration-300 motion-reduce:transition-none ${box}`}>
        <h3 className={`font-semibold ${text} transition-colors duration-300 motion-reduce:transition-none ${invert ? "text-[var(--text-foreground)]" : "text-[var(--text)]"}`}>
            {initial}
        </h3>
    </div>
)

const NavBar = ({ invert = false, hideExpanded = false, hideDestinationInput = false, className = "" }) => {
    useCopyLanguage();
    const { t } = useTranslation("website");
    const { user: clerkUser } = useUser();
    const navigate = useViewNavigate();
    const { signIn } = useSignIn();
    const { isSignedIn } = useAuth();
    const isMobile = useIsMobile();
    const { pathname } = useLocation();
    const scheduledTime = useData(state => state.scheduledTime);
    const setTiming = useData(state => state.setTiming);
    const setScheduledTime = useData(state => state.setScheduledTime);
    const bookingId = useData(state => state.bookingId);
    const bookingCode = useData(state => state.bookingCode);
    const status = useData(state => state.status);
    const sharing = useData(state => state.sharing);
    const vehicleClass = useData(state => state.vehicleClass);
    const fare = useData(state => state.fare);
    const setDrop = useData(state => state.setDrop);
    const setDropCoords = useData(state => state.setDropCoords);
    const pickupLocation = useData(state => state.pickupLocation);
    const setPickup = useData(state => state.setPickup);
    const setPickupCoords = useData(state => state.setPickupCoords);
    const [expand, setExpand] = useState(false)
    const api = useApi();
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const drawerRef = useRef(null)
    const [collapsed, setCollapsed] = useState(false)
    const destinationOnly = collapsed && !hideDestinationInput

    // The home rail begins as a clear destination-first control. Once the
    // reader has moved into the page it becomes compact, while retaining the
    // destination and menu instead of hiding the booking affordance entirely.
    useEffect(() => {
        const onScroll = () => setCollapsed(window.scrollY > 72)
        onScroll()
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => window.removeEventListener("scroll", onScroll)
    }, [])

    useEffect(() => {
        if (isSignedIn) {
            (async () => {
                setLoading(true)
                try {
                    const userData = await api.getMe();
                    if (userData?.error) {
                        setError(userData.error)
                        return
                    }
                    setUser(userData)
                }
                catch (err) {
                    console.error(err);
                    setError(dc("Something went wrong"))
                }
                finally {
                    setLoading(false)
                }
            })()
        }
    }, [isSignedIn])

    // One `expand` drives both surfaces — the avatar chip is hidden on mobile and
    // the hamburger on desktop, so only one of them can ever be the trigger.
    const { mounted: menuMounted, closing: menuClosing } = useExitAnim(expand, isMobile ? 280 : 220)

    // Crossing the breakpoint would swap the drawer for the dropdown mid-open.
    useEffect(() => { setExpand(false) }, [isMobile])

    useEffect(() => {
        if (!expand) return
        const onKey = (e) => { if (e.key === "Escape") setExpand(false) }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [expand])

    // Lock the page behind the drawer. Cleanup also covers unmount, so a route
    // change with the drawer open can't leave the body frozen.
    useEffect(() => {
        if (!(expand && isMobile)) return
        const previous = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => { document.body.style.overflow = previous }
    }, [expand, isMobile])

    useEffect(() => {
        if (menuMounted && isMobile) drawerRef.current?.focus()
    }, [menuMounted, isMobile])

    const dropdownTone = invert ? "dark" : "light"

    const handleSignOut = async () => {
        try {
            await api.logout()
            setExpand(false)
            navigate('/')
        } catch (err) {
            console.error(err)
            setError(dc("Couldn't sign you out. Please try again."))
        }
    }

    // scrollToSection returns false when the section isn't on this route — the
    // navbar renders on every page, so About has to be able to send you home.
    const goToSection = (id) => {
        if (!scrollToSection(id)) navigate('/', { state: { scrollTo: id } });
    }

    // Links that mean the top of a page rather than the route as such — the
    // logo means the booking form, Outstation its hero. Arriving from another
    // route PageMeta puts you at the top; already on the route a navigate() is
    // a no-op, so scrolled down the link would do nothing and has to scroll
    // instead. Same split the footer's "Book a ride" makes.
    const goToTopOf = (path) => {
        if (pathname === path) scrollToTop();
        else navigate(path);
    }

    const goHome = () => goToTopOf('/')

    const startBooking = (nextTiming) => {
        // The landing rail is a route-entry button now. Start the next screen
        // with a genuinely fresh route so its pickup can resolve from the
        // rider's current position and its drop-off remains theirs to enter.
        setPickup("")
        setPickupCoords(null)
        setDrop("")
        setDropCoords(null)
        setTiming(nextTiming)
        setScheduledTime(null)
        navigate('/book', {
            state: {
                stage: 'route',
                highlightRideNow: nextTiming === "Now",
            },
        })
    }

    const openBooking = () => startBooking("Schedule")
    const openRideNow = () => startBooking("Now")

    // Close first, act on the next task — the scroll lock has to be released
    // before goToSection's smooth scroll can move the page.
    const go = (fn) => {
        setExpand(false)
        setTimeout(fn, 0)
    }

    const primaryNavLinks = [
        [t("nav.about"), () => goToSection('about')],
        [t("nav.outstation"), () => goToTopOf('/outstation')],
        [t("nav.help"), () => navigate('/help')],
    ]
    const accountNavLinks = [
        ...(isSignedIn ? [[t("nav.rideHistory"), () => navigate('/manage-account', { state: { tab: "Ride History" } })]] : []),
        ...(clerkUser?.publicMetadata?.role === "admin" ? [[t("nav.dashboard"), () => navigate('/dashboard')]] : []),
    ]
    // The drawer keeps every destination in one list; desktop separates
    // account destinations so they sit beside the profile control.
    const navLinks = [...primaryNavLinks, ...accountNavLinks]

    const userDropDownList = [[<Icon path={mdiAccountCircle} size={1.2} />, t("nav.manageAccount"), "/manage-account"], [<Icon path={mdiCog} size={1.1} />, t("nav.settings"), "/settings"], [<Icon path={mdiShieldCheck} size={1.1} />, t("nav.safety"), "/safety"], [<Icon path={mdiInformation} size={1.1} />, t("nav.legal"), "/"]]

    const displayName = user?.name?.length > 15 ? `${user.name.slice(0, 15)}...` : user?.name

    const rowHover = invert
        ? "hover:bg-[var(--foreground)]/8 active:bg-[var(--foreground)]/12"
        : "hover:bg-[var(--foreground-muted)] active:bg-[var(--foreground-muted)]"

    const desktopSecondaryButton = `cursor-pointer rounded-full px-3 py-2 text-base font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${invert
        ? "bg-[var(--foreground)]/10 text-[var(--text)] hover:bg-[var(--foreground)]/15 active:bg-[var(--foreground)]/20"
        : "bg-[var(--background)]/10 text-[var(--text-foreground)] hover:bg-[var(--background)]/20 active:bg-[var(--background)]/15"
        }`

    const desktopPrimaryButton = "cursor-pointer rounded-full bg-primary px-3 py-2 text-base font-medium text-white outline-none transition-opacity duration-200 hover:opacity-90 active:opacity-80 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"

    const drawer = (
        <>
            <div
                onClick={() => setExpand(false)}
                className={`fixed inset-0 z-90 bg-black/40 backdrop-blur-[2px] ${menuClosing ? "animate-panel-fade-out" : "animate-backdrop"} motion-reduce:animate-none`}
            />
            <div
                ref={drawerRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label={t("nav.menu")}
                className={`fixed right-0 top-0 z-100 h-dvh w-[82%] max-w-[320px] flex flex-col overflow-y-auto overscroll-contain outline-none border-l shadow-[-8px_0_24px_rgba(0,0,0,0.35)] ${menuClosing ? "animate-sheet-out" : "animate-sheet"} motion-reduce:animate-none ${invert ? "bg-[var(--background-primary)] text-[var(--text)] border-[var(--foreground)]/15" : "bg-[var(--foreground)] text-[var(--text-foreground)] border-black/10"}`}
            >
                <div className='flex items-center justify-between gap-2 px-5 pt-6 pb-5'>
                    {isSignedIn
                        ? loading
                            ? <div className='flex min-w-0 items-center gap-3'>
                                <Skeleton tone={dropdownTone} rounded='rounded-full' className='w-12 h-12 shrink-0' />
                                <Skeleton tone={dropdownTone} className='h-8 w-32' />
                            </div>
                            : <div className='flex min-w-0 items-center gap-3'>
                                <Avatar invert={invert} initial={user?.name?.charAt(0)} box='w-12 h-12 shrink-0' text={"text-2xl"} />
                                <h3 className='truncate text-xl font-semibold'>{displayName}</h3>
                            </div>
                        : <h3
                            onClick={() => go(goHome)}
                            className='cursor-pointer opacity-100 hover:opacity-70 active:opacity-60 transition-opacity duration-300'
                        >
                            <span className='font-semibold'>RCS</span> travels
                        </h3>
                    }
                    <Icon
                        path={mdiClose}
                        size={1}
                        onClick={() => setExpand(false)}
                        className='shrink-0 cursor-pointer opacity-60 hover:opacity-100 active:opacity-80 transition-opacity duration-300'
                    />
                </div>

                <ul className='flex flex-col gap-0.5 px-2'>
                    {navLinks.map(([label, action], i) => (
                        <li
                            key={i}
                            onClick={() => go(action)}
                            className={`cursor-pointer rounded-xl px-3 py-3 text-lg transition-colors duration-300 ${rowHover}`}
                        >
                            {label}
                        </li>
                    ))}
                </ul>

                {isSignedIn &&
                    <>
                        <div className={`mx-5 my-3 h-px ${invert ? "bg-[var(--foreground)]/10" : "bg-black/10"}`} />
                        <ul className='flex flex-col gap-0.5 px-2'>
                            {loading
                                ? userDropDownList.map((_, i) => (
                                    <li key={i} className='flex items-center gap-3 rounded-xl px-3 py-3'>
                                        <Skeleton tone={dropdownTone} rounded='rounded-md' className='h-6 w-6' />
                                        <Skeleton tone={dropdownTone} className='h-5 w-32' />
                                    </li>
                                ))
                                : userDropDownList.map((item, i) => (
                                    <li
                                        key={i}
                                        onClick={() => go(() => navigate(`${item[2]}`))}
                                        className={`flex cursor-pointer items-center justify-start gap-3 rounded-xl px-3 py-3 text-lg transition-colors duration-300 ${rowHover}`}
                                    >
                                        {item[0]}
                                        <h4>{item[1]}</h4>
                                    </li>
                                ))
                            }
                        </ul>
                    </>
                }

                <div className='mt-auto px-5 pt-6 pb-6'>
                    {isSignedIn
                        ? <Button onClick={handleSignOut} prop={{ variant: "negative", width: "100%" }}>{t("nav.signout")}</Button>
                        : <div className='flex flex-col gap-2'>
                            <h4
                                onClick={() => go(() => navigate('/login'))}
                                className={`cursor-pointer rounded-xl border py-3 text-center text-base font-medium transition-colors duration-300 ${invert ? "border-[var(--foreground)]/25 hover:bg-[var(--foreground)]/10 active:bg-[var(--foreground)]/15" : "border-black/15 hover:bg-[var(--foreground-muted)] active:bg-[var(--foreground-muted)]"}`}
                            >
                                {t("nav.login")}
                            </h4>
                            <h4
                                onClick={() => go(() => navigate('/signup'))}
                                className='cursor-pointer rounded-xl bg-[var(--background-primary)] py-3 text-center text-base font-semibold text-[var(--text)] transition-opacity duration-300 hover:opacity-90 active:opacity-80'
                            >
                                {t("nav.signup")}
                            </h4>
                        </div>
                    }
                </div>
            </div>
        </>
    )

    return (
        <div className={`${className} flex justify-center items-center ${destinationOnly ? "mt-4 w-[calc(89vw-2px)] rounded-full shadow-[0_8px_28px_rgba(0,0,0,0.18)] sm:w-[min(620px,calc(78vw-2px))]" : `border ${invert ? "bg-[var(--background)] border-[var(--foreground)]/20" : "bg-[var(--foreground-muted)] border-[var(--background)]/20"} ${hideDestinationInput ? "w-full px-[5.5vw] py-3 sm:px-5 sm:py-4 lg:px-[11vw]" : "w-full flex-col gap-3 px-[5.5vw] py-4 pb-6 sm:px-5 sm:pb-7 lg:px-[11vw]"}`} transition-[width,padding,margin,border-radius,box-shadow,background-color] duration-300 motion-reduce:transition-none`}>
            <div className={`${destinationOnly ? "hidden" : "flex w-full justify-between px-1 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-6"} items-center ${invert ? "text-[var(--text)]" : "text-[var(--text-foreground)]"} transition-colors duration-300 motion-reduce:transition-none [&>*]:select-none`}>
                <h3 onClick={goHome} className='shrink-0 cursor-pointer pl-1 opacity-[1] transition-opacity duration-300 hover:opacity-[1] sm:order-2 sm:justify-self-center sm:text-2xl sm:opacity-[0.85]'><span className='font-semibold'>RCS</span> travels</h3>

                <div className='hidden sm:order-1 sm:block sm:justify-self-start'>
                    <ul className="flex gap-2">
                        {primaryNavLinks.map(([label, action], i) => (
                            <li key={i}>
                                <button type="button" onClick={action} className={desktopSecondaryButton}>{label}</button>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className='order-3 relative -mr-1.5 hidden items-center justify-center gap-3 sm:flex sm:justify-self-end'>
                    {isSignedIn
                        ? <>
                            <ul className="flex gap-2">
                                {accountNavLinks.map(([label, action], i) => (
                                    <li key={i}>
                                        <button type="button" onClick={action} className={desktopSecondaryButton}>{label}</button>
                                    </li>
                                ))}
                            </ul>
                            <div onClick={() => setExpand(!expand)} className={`flex ${invert ? "text-[var(--text)] bg-[var(--background-primary)] hover:bg-[var(--foreground)]/10" : "text-[var(--text-foreground)] bg-[var(--foreground)] hover:bg-[var(--background-primary)]/10"} jusityf-center items-center px-1 py-1 rounded-3xl justify-center items-center gap-1 cursor-pointer transition-colors duration-300 motion-reduce:transition-none`}>
                                <Avatar invert={invert} initial={user?.name?.charAt(0)} box='w-8 h-8' text='' />
                                <Icon path={mdiChevronDown} style={{
                                    transform: expand
                                        ? "rotate(180deg)"
                                        : "rotate(0deg)",
                                }} size={0.8} />
                            </div>
                        </>
                        :
                        <div className='flex items-center justify-center gap-2'>
                            <button type="button" onClick={() => navigate('/login')} className={desktopSecondaryButton}>{t("nav.login")}</button>
                            <button type="button" onClick={() => navigate('/signup')} className={desktopPrimaryButton}>{t("nav.signup")}</button>
                        </div>
                    }
                    {menuMounted && !isMobile &&
                        <Button prop={{ variant: "dropdown", width: "390px", innerClassName: "flex flex-col gap-3 sm:gap-4 items-start justify-center" }} className={`flex flex-col p-2 absolute right-0 top-[130%] ${menuClosing ? "animate-dropdown-out" : "animate-dropdown"} hover:opacity-[1] ${invert ? "" : "bg-[var(--foreground)]"}`}>
                            {loading
                                ? <>
                                    <div className='flex items-center w-full justify-between'>
                                        <Skeleton tone={dropdownTone} className='h-9 w-44' />
                                        <Skeleton tone={dropdownTone} rounded='rounded-full' className='w-14 h-14' />
                                    </div>
                                    <div className='w-full'>
                                        <ul className='flex flex-col items-start justify-center gap-2 w-full'>
                                            {userDropDownList.map((_, i) => (
                                                <li key={i} className='w-full rounded-lg py-2 px-3 flex items-center gap-3'>
                                                    <Skeleton tone={dropdownTone} rounded='rounded-md' className='h-7 w-7' />
                                                    <Skeleton tone={dropdownTone} className='h-6 w-36' />
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                </>
                                : <>
                                    <div className={`${invert ? "text-[var(--text)]" : "text-[var(--text-foreground)]"} flex items-center w-full justify-between`}>
                                        <h3 className='text-3xl font-semibold'>{displayName}</h3>
                                        <Avatar invert={invert} initial={user?.name?.charAt(0)} box='w-14 h-14' text={"text-3xl"} />
                                    </div>
                                    <div className='w-full'>
                                        <ul className='flex flex-col items-start justify-center gap-1 w-full'>
                                            {userDropDownList.map((item, i) => {
                                                return (
                                                    <li key={i} onClick={() => navigate(`${item[2]}`)} className={`font-normal text-3xl w-full rounded-2xl py-3 px-3 flex justify-start gap-2 transition-color duration-300 items-center ${!invert ? " text-[var(--text-foreground)] hover:bg-[var(--foreground-muted)]" : "text-[var(--text)] hover:bg-[var(--foreground)]/8"}`}>
                                                        {item[0]}
                                                        <h4 >{item[1]}</h4>
                                                    </li>
                                                )
                                            })}
                                            <Button onClick={handleSignOut} className="mt-5" prop={{ variant: "negative", width: "345px" }}>{t("nav.signout")}</Button>
                                        </ul>
                                    </div>
                                </>
                            }
                        </Button>
                    }
                </div>

                <Icon
                    path={mdiMenu}
                    onClick={() => setExpand(!expand)}
                    className='order-3 block shrink-0 cursor-pointer opacity-100 hover:opacity-70 active:opacity-60 transition-opacity duration-300 sm:hidden'
                    size={0.9}
                />
            </div>

            {!hideDestinationInput && <div className='relative order-2 flex w-full min-w-0 items-center justify-center sm:max-w-[620px]'>
                <BorderGlow
                    animated
                    glowColor={invert ? "var(--foreground)" : "var(--background)"}
                    darkGlowColor={invert ? "var(--foreground)" : "var(--background)"}
                    borderRadius={999}
                    edgeSensitivity={24}
                    glowRadius={24}
                    glowIntensity={0.72}
                    coneSpread={15}
                    className="w-full"
                >
                    <div
                        className={`flex w-full shadow-[-3.5px_7px_0_rgba(0,0,0,0.3)] sm:shadow-[-4.5px_8px_0_rgba(0,0,0,0.3)] hover:sm:shadow-[0_0_0_rgba(0,0,0,0)] transition-all duration-300 items-stretch rounded-full border-2 p-1.5 pl-3 ${invert ? "border-[var(--foreground)]/40 bg-[var(--background-muted)] text-[var(--foreground)]" : "border-[var(--background)]/40 bg-[var(--foreground)] text-[var(--background)]"}`}
                    >
                        <button
                            type="button"
                            onClick={openBooking}
                            aria-label={t("nav.destination")}
                            className="flex min-w-0 flex-1 cursor-pointer items-center rounded-l-full pr-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                        >
                            <Icon path={mdiMapMarkerOutline} size={1.1} className="shrink-0 mr-1" />
                            <span className="min-w-0 flex-1 break-words px-1 text-lg leading-5">{t("nav.destination")}</span>
                        </button>
                        <div className="relative flex shrink-0 items-center">
                            <button
                                type="button"
                                onClick={openRideNow}
                                aria-label={t("nav.now")}
                                className="mx-0.2 flex h-10 min-w-[78px] cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--background)] px-3 py-2 text-sm font-semibold text-[var(--text)] outline-none transition-opacity duration-200 hover:opacity-90 active:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary sm:text-base"
                            >
                                <Icon path={mdiClockTimeFourOutline} size={0.8} aria-hidden="true" />
                                {t("nav.now")}
                            </button>
                        </div>
                    </div>
                </BorderGlow>
            </div>}

            <ErrorPanel prop={{ error: expand ? error : null, setError, onOkay: () => navigate('/') }} />

            {menuMounted && isMobile && createPortal(drawer, document.body)}

            {/* expanded panel */}
            {/* {!hideExpanded && bookingId && isSignedIn &&
                <div className='w-full animate-dropdown'>
                    <div
                        onClick={() => navigate(`/booking/${bookingId}`)}
                        style={{
                            background: 'radial-gradient(130% 120% at 92% 50%, rgba(36,58,251,0.30) 0%, rgba(11,11,153,0.18) 35%, transparent 62%), linear-gradient(135deg, #1b1936 0%, #121220 55%, #0c0c16 100%)',
                            boxShadow: 'inset 0 1px 0 rgba(122,148,255,0.18)',
                        }}
                        className={`w-full cursor-pointer hover:scale-[1.005] transition-transform duration-300 flex items-center justify-between rounded-2xl py-2 px-4`}>
                        <div className='flex flex-col justify-center items-left'>
                            {status === 'assigned'
                                ? <>
                                    <h4 className='font-medium sm:block hidden'> Pick up in 2 min <span className="text-[var(--text-muted)]"> • {pickupLocation.split(",")[0]}</span></h4>
                                    <h4 className='text-base font-medium sm:hidden block'> Pick up in 2 min <br /> <span className="text-sm text-[var(--text-muted)]"> {pickupLocation.split(",")[0]}</span></h4>
                                </>
                                : <h4 className="font-medium">
                                    {status?.charAt(0).toUpperCase() + status?.slice(1)}
                                </h4>
                            }
                            {status === 'assigned'
                                ? <>
                                    <h4 className="text-sm sm:text-base text-[var(--text-muted)] sm:block hidden"> UP 16 AB 1234, Car name</h4>
                                    <h4 className="text-sm sm:text-base text-[var(--text-muted)] sm:hidden block"> UP 16 AB 1234</h4>
                                </>
                                : <h4 className="text-sm sm:text-base text-[var(--text-muted)]">
                                    {labelOf(vehicleClass)}
                                    {scheduledTime && (
                                        <>
                                            {" • "}
                                            {new Date(scheduledTime).toLocaleDateString("en-GB", {
                                                day: "numeric",
                                                month: "short",
                                            })}
                                            {" • "}
                                            {new Date(scheduledTime)
                                                .toLocaleTimeString("en-GB", {
                                                    hour: "2-digit",
                                                    minute: "2-digit",
                                                    hour12: true,
                                                })
                                                .toUpperCase()}
                                        </>
                                    )}
                                </h4>
                            }

                        </div>
                        <div className='items-right'>
                            <img
                                className='h-20 w-30 -mr-2 ml-1 -my-2 object-contain sm:ml-0 sm:mr-0'
                                src={angledVehicleImageOf(vehicleClass)}
                                alt={`${labelOf(vehicleClass)} vehicle`}
                            />
                        </div>
                    </div>
                </div>
            } */}
        </div>
    );
};

export default NavBar

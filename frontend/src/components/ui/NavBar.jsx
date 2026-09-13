import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../../i18nCopy";
import Icon from '@mdi/react';
import { mdiMenu, mdiClose, mdiAccountCircle, mdiChevronDown, mdiCog, mdiInformation, mdiShieldCheck, mdiLogout, mdiMapMarkerOutline, mdiClockTimeFourOutline } from '@mdi/js';
import { useViewNavigate } from "../../hooks/useViewNavigate";
import { cloneElement, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApi } from '../../hooks/useApi';
import { useSignIn, useAuth, useUser } from "@clerk/clerk-react";
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
const Avatar = ({ invert, themed = false, initial, box, text }) => (
    <div className={`${themed ? "bg-strong" : invert ? "bg-[var(--foreground)]" : "bg-[var(--background-primary)]"} flex items-center justify-center rounded-full transition-colors duration-300 motion-reduce:transition-none ${box}`}>
        <h3 className={`font-semibold ${text} transition-colors duration-300 motion-reduce:transition-none ${themed ? "text-on-strong" : invert ? "text-[var(--text-foreground)]" : "text-[var(--text)]"}`}>
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
    const navbarRef = useRef(null)
    const mobileTriggerRef = useRef(null)
    const destinationRef = useRef(null)
    const [mobileOrigin, setMobileOrigin] = useState(null)
    const [destinationGlowEnabled, setDestinationGlowEnabled] = useState(true)
    const [suppressNavbarTransitions, setSuppressNavbarTransitions] = useState(false)
    const navigationTimer = useRef(null)
    const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
    const profileTriggerRef = useRef(null)
    const [desktopMenuPosition, setDesktopMenuPosition] = useState(null)
    const [collapsed, setCollapsed] = useState(false)
    const [mobileAccountOpen, setMobileAccountOpen] = useState(false)
    const destinationOnly = collapsed && !hideDestinationInput

    // The rail becomes a compact destination pill after scrolling on all sizes.
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
    const mobileDuration = reducedMotion ? 0 : 360
    const { mounted: menuMounted, closing: menuClosing } = useExitAnim(expand, isMobile ? mobileDuration : 220)
    const mobileMenuActive = isMobile && (expand || menuMounted) && !!mobileOrigin

    const toggleMobileMenu = () => {
        // The portal recreates BorderGlow; keep its initial sweep from replaying.
        setDestinationGlowEnabled(false)
        setSuppressNavbarTransitions(true)
        if (!mobileMenuActive) {
            const node = navbarRef.current
            const rect = node.getBoundingClientRect()
            const styles = getComputedStyle(node)
            setMobileOrigin({
                top: rect.top, left: rect.left, width: rect.width, height: rect.height,
                padding: styles.padding, marginTop: styles.marginTop,
                borderRadius: styles.borderRadius,
                contentTop: node.firstElementChild.getBoundingClientRect().bottom - rect.top + 20,
            })
        }
        setExpand(open => !open)
    }

    // Grow the navbar's surface from its measured height; the header never slides.
    // Commit interrupted frames so rapid toggles reverse from the current position.
    useLayoutEffect(() => {
        if (!mobileMenuActive) return
        const node = navbarRef.current
        const reduced = reducedMotion
        const duration = mobileDuration
        const current = node.getBoundingClientRect()
        const animations = [node.animate([
            { height: `${current.height}px`, width: `${current.width}px`, left: `${current.left}px`, borderRadius: getComputedStyle(node).borderRadius },
            { height: `${expand ? window.innerHeight - mobileOrigin.top : mobileOrigin.height}px`, width: expand ? '100%' : `${mobileOrigin.width}px`, left: expand ? '0px' : `${mobileOrigin.left}px`, borderRadius: expand ? '0px' : mobileOrigin.borderRadius },
        ], { duration, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' })]
        for (const [element, visible] of [[destinationRef.current, !expand], [drawerRef.current, expand]]) {
            if (!element) continue
            animations.push(element.animate([
                { opacity: getComputedStyle(element).opacity }, { opacity: visible ? 1 : 0 },
            ], { duration: reduced ? 0 : 180, delay: reduced ? 0 : visible ? 120 : 0, fill: 'forwards', easing: 'ease-out' }))
        }
        return () => animations.forEach(animation => {
            if (animation.effect.target.isConnected) animation.commitStyles()
            animation.cancel()
        })
    }, [expand, mobileMenuActive, mobileOrigin, mobileDuration, reducedMotion])

    // Only suspend CSS transitions while moving between the rail and its portal.
    // Once the restored layout has painted, scroll-driven transitions can resume.
    useLayoutEffect(() => {
        if (mobileMenuActive || !suppressNavbarTransitions) return
        let settledFrame
        const restoredFrame = requestAnimationFrame(() => {
            settledFrame = requestAnimationFrame(() => setSuppressNavbarTransitions(false))
        })
        return () => {
            cancelAnimationFrame(restoredFrame)
            cancelAnimationFrame(settledFrame)
        }
    }, [mobileMenuActive, suppressNavbarTransitions])

    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)')
        const update = () => setReducedMotion(query.matches)
        query.addEventListener('change', update)
        return () => query.removeEventListener('change', update)
    }, [])

    useEffect(() => {
        if (!mobileMenuActive) return
        const closeOnResize = () => { setExpand(false); setMobileOrigin(null) }
        window.addEventListener('resize', closeOnResize)
        return () => window.removeEventListener('resize', closeOnResize)
    }, [mobileMenuActive])

    useEffect(() => {
        setExpand(false)
        return () => clearTimeout(navigationTimer.current)
    }, [pathname])

    // Crossing the breakpoint would swap the drawer for the dropdown mid-open.
    useEffect(() => { setExpand(false) }, [isMobile])

    useEffect(() => {
        if (!expand) return
        const onKey = (e) => { if (e.key === "Escape") setExpand(false) }
        window.addEventListener("keydown", onKey)
        return () => window.removeEventListener("keydown", onKey)
    }, [expand])

    useEffect(() => {
        if (!expand) setMobileAccountOpen(false)
    }, [expand])

    // Lock the page behind the drawer. Cleanup also covers unmount, so a route
    // change with the drawer open can't leave the body frozen.
    useEffect(() => {
        if (!mobileMenuActive) return
        const previous = document.body.style.overflow
        document.body.style.overflow = "hidden"
        return () => { document.body.style.overflow = previous }
    }, [mobileMenuActive])

    useEffect(() => {
        if (!mobileMenuActive) return
        mobileTriggerRef.current?.focus({ preventScroll: true })
        const trapFocus = (event) => {
            if (event.key !== 'Tab') return
            const controls = [...navbarRef.current.querySelectorAll('button, [href], [tabindex="0"]')]
                .filter(node => node.tabIndex >= 0 && !node.closest('[inert]') && node.getClientRects().length)
            const first = controls[0]
            const last = controls[controls.length - 1]
            if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
            else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
        }
        document.addEventListener('keydown', trapFocus)
        return () => {
            document.removeEventListener('keydown', trapFocus)
            requestAnimationFrame(() => mobileTriggerRef.current?.focus({ preventScroll: true }))
        }
    }, [mobileMenuActive])

    // The desktop menu is portalled to the body so later navbar siblings (most
    // visibly the destination/Now rail) and transformed page content can never
    // paint over it. Keep its viewport position anchored to the profile chip.
    useLayoutEffect(() => {
        if (!(menuMounted && !isMobile)) {
            setDesktopMenuPosition(null)
            return
        }

        const positionMenu = () => {
            const rect = profileTriggerRef.current?.getBoundingClientRect()
            if (!rect) return
            setDesktopMenuPosition({
                top: rect.bottom + 8,
                right: Math.max(16, window.innerWidth - rect.right),
            })
        }

        positionMenu()
        window.addEventListener("resize", positionMenu)
        window.addEventListener("scroll", positionMenu, true)
        return () => {
            window.removeEventListener("resize", positionMenu)
            window.removeEventListener("scroll", positionMenu, true)
        }
    }, [menuMounted, isMobile, collapsed])

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
        clearTimeout(navigationTimer.current)
        navigationTimer.current = setTimeout(fn, mobileMenuActive && !reducedMotion ? mobileDuration + 20 : 0)
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
    const accountPhone = user?.phone || clerkUser?.primaryPhoneNumber?.phoneNumber
    const accountPhoneDigits = String(accountPhone || '').replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '')
    const accountIdentity = /^\d{10}$/.test(accountPhoneDigits)
        ? `+91 ${accountPhoneDigits.slice(0, 5)} ${accountPhoneDigits.slice(5)}`
        : accountPhone

    const rowHover = "hover:bg-surface-muted active:bg-surface-raised"
    const mobileDrawerLink = "flex w-fit max-w-full cursor-pointer select-none items-center justify-start rounded-full px-4 py-2 text-[var(--text-foreground)] transition-opacity duration-200 hover:opacity-80 focus-within:opacity-80"
    const mobileDrawerLabel = "break-words text-xl font-semibold leading-snug"
    const mobileAccountLabel = "break-words text-lg font-semibold leading-snug"
    // Keep the destination rail independent of the shell's animated width/padding.
    const destinationWidth = "w-[calc(89vw-2px)] sm:w-[min(620px,calc(100vw-42px))]"

    const desktopSecondaryButton = `cursor-pointer rounded-xl px-3 py-2 text-base font-medium outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${invert
        ? "bg-[var(--foreground)]/10 text-[var(--text)] hover:bg-[var(--foreground)]/15 active:bg-[var(--foreground)]/20"
        : "bg-[var(--background)]/10 text-[var(--text-foreground)] hover:bg-[var(--background)]/20 active:bg-[var(--background)]/15"
        }`

    const desktopPrimaryButton = "cursor-pointer rounded-xl bg-primary px-3 py-2 text-base font-medium text-white outline-none transition-opacity duration-200 hover:opacity-90 active:opacity-80 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"

    const drawer = (
        <div ref={drawerRef} id="mobile-navigation"
            data-sheet-scroll
            inert={expand ? undefined : ''} aria-hidden={!expand}
            style={{ top: mobileOrigin?.contentTop, opacity: 0 }}
            className='absolute inset-x-0 bottom-0 flex flex-col overflow-y-auto overscroll-contain pb-6 text-ink'
        >
                {isSignedIn &&
                    <div className='px-5 pb-4'>
                        {loading
                            ? <div className='flex w-full items-center gap-3 rounded-3xl bg-[var(--foreground)] p-3'>
                                <Skeleton tone={dropdownTone} rounded='rounded-full' className='h-12 w-12 shrink-0' />
                                <div className='min-w-0 flex-1 space-y-2'>
                                    <Skeleton tone={dropdownTone} className='h-5 w-28 max-w-full' />
                                    <Skeleton tone={dropdownTone} className='h-4 w-36 max-w-full' />
                                </div>
                                <Skeleton tone={dropdownTone} rounded='rounded-full' className='h-9 w-9 shrink-0' />
                            </div>
                            : <div className='w-full'>
                                <button
                                    type="button"
                                    aria-expanded={mobileAccountOpen}
                                    aria-controls="mobile-account-menu"
                                    onClick={() => setMobileAccountOpen(open => !open)}
                                    className={`flex w-full items-center gap-3 bg-[var(--foreground)] p-3 text-left text-[var(--text-foreground)] outline-none transition-[border-radius] duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary motion-reduce:transition-none ${mobileAccountOpen ? 'rounded-t-3xl rounded-b-sm' : 'rounded-3xl'}`}
                                >
                                    <Avatar themed initial={user?.name?.charAt(0)} box='h-12 w-12 shrink-0' text={"text-2xl"} />
                                    <span className='min-w-0 flex-1'>
                                        <span className='block truncate text-xl font-semibold leading-tight'>{displayName}</span>
                                        {accountIdentity && <span className='mt-0.5 block truncate text-sm font-normal leading-tight text-ink-muted'>{accountIdentity}</span>}
                                    </span>
                                    <span className='flex h-9 w-9 shrink-0 items-center justify-center'>
                                        <Icon
                                            path={mdiChevronDown}
                                            size={0.85}
                                            className='transition-transform duration-200 motion-reduce:transition-none'
                                            style={{ transform: mobileAccountOpen ? "rotate(180deg)" : "rotate(0deg)" }}
                                        />
                                    </span>
                                </button>

                                <div
                                    aria-hidden={!mobileAccountOpen}
                                    className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out motion-reduce:transition-none ${mobileAccountOpen ? 'grid-rows-[1fr] opacity-100' : 'pointer-events-none grid-rows-[0fr] opacity-0'}`}
                                >
                                    <div className='min-h-0 overflow-hidden'>
                                    <ul id="mobile-account-menu" className='flex flex-col gap-1 pt-1'>
                                        {userDropDownList.map((item, i) => (
                                            <li key={i}>
                                                <button
                                                    type="button"
                                                    tabIndex={mobileAccountOpen ? 0 : -1}
                                                    onClick={() => go(() => navigate(`${item[2]}`))}
                                                    className={`flex w-full items-center gap-3 rounded-sm bg-[var(--foreground)] px-4 py-3 text-left text-[var(--text-foreground)] outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary hover:opacity-80 active:opacity-70`}
                                                >
                                                    <span className='shrink-0'>{cloneElement(item[0], { size: 1 })}</span>
                                                    <span className={mobileAccountLabel}>{item[1]}</span>
                                                </button>
                                            </li>
                                        ))}
                                        <li>
                                            <button
                                                type="button"
                                                tabIndex={mobileAccountOpen ? 0 : -1}
                                                onClick={handleSignOut}
                                                className={`flex w-full items-center gap-3 rounded-t-sm rounded-b-2xl bg-[var(--foreground)] px-4 py-3 text-left text-status-danger outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary hover:opacity-80 active:opacity-70`}
                                            >
                                                <Icon path={mdiLogout} size={1} className='shrink-0' />
                                                <span className={mobileAccountLabel}>{t("nav.signout")}</span>
                                            </button>
                                        </li>
                                    </ul>
                                    </div>
                                </div>
                            </div>
                        }
                    </div>
                }

                <ul className='flex flex-col items-start gap-2 px-5'>
                    {navLinks.map(([label, action], i) => (
                        <li key={i}>
                            <button type="button" onClick={() => go(action)} className={mobileDrawerLink}>
                                <span className={mobileDrawerLabel}>{label}</span>
                            </button>
                        </li>
                    ))}
                </ul>

                {!isSignedIn &&
                    <div className='mt-auto px-5 pt-6 pb-6'>
                        <div className='flex flex-col gap-2'>
                            <button type="button"
                                onClick={() => go(() => navigate('/login'))}
                                className='cursor-pointer rounded-xl border border-border py-3 text-center text-base font-medium transition-colors duration-300 hover:bg-[var(--foreground)] active:bg-surface-raised'
                            >
                                {t("nav.login")}
                            </button>
                            <button type="button"
                                onClick={() => go(() => navigate('/signup'))}
                                className='cursor-pointer rounded-xl bg-strong py-3 text-center text-base font-semibold text-on-strong transition-opacity duration-300 hover:opacity-90 active:opacity-80'
                            >
                                {t("nav.signup")}
                            </button>
                        </div>
                    </div>
                }
            </div>
    )

    const navbar = (
        <div
            ref={navbarRef}
            role={mobileMenuActive ? 'dialog' : undefined}
            aria-modal={mobileMenuActive ? true : undefined}
            aria-label={mobileMenuActive ? t('nav.menu') : undefined}
            style={mobileMenuActive ? {
                position: 'fixed', zIndex: 1010, top: mobileOrigin.top, left: mobileOrigin.left,
                width: mobileOrigin.width, height: mobileOrigin.height, margin: 0,
                padding: mobileOrigin.padding, borderRadius: mobileOrigin.borderRadius,
                flexDirection: 'column', justifyContent: 'flex-start', overflow: 'hidden',
                backgroundColor: invert ? 'var(--background)' : 'var(--foreground-muted)',
            } : undefined}
            className={`${className} flex justify-center items-center ${destinationOnly ? `mt-4 ${destinationWidth} rounded-full shadow-[0_8px_28px_rgba(0,0,0,0.18)]` : `border ${invert ? "bg-[var(--background)] border-[var(--foreground)]/20" : "bg-[var(--foreground-muted)] border-[var(--background)]/20"} ${hideDestinationInput ? "w-full px-[5.5vw] py-3 sm:px-5 sm:py-4 lg:px-[11vw]" : "w-full flex-col gap-3 px-[5.5vw] py-4 pb-6 sm:px-5 sm:pb-7 lg:px-[11vw]"}`} ${suppressNavbarTransitions ? "transition-none" : "transition-[width,padding,margin,border-radius,box-shadow,background-color]"} duration-300 motion-reduce:transition-none`}>
            <div className={`${destinationOnly && !mobileMenuActive ? "hidden" : "flex w-full justify-between px-1 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-6"} shrink-0 items-center ${invert ? "text-[var(--text)]" : "text-[var(--text-foreground)]"} transition-colors duration-300 motion-reduce:transition-none [&>*]:select-none`}>
                <h3 onClick={() => mobileMenuActive ? go(goHome) : goHome()} className='shrink-0 cursor-pointer pl-1 opacity-[1] transition-opacity duration-300 hover:opacity-[1] sm:order-2 sm:justify-self-center sm:text-2xl sm:opacity-[0.85]'><span className='font-semibold'>RCS</span> travels</h3>

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
                            <button
                                ref={profileTriggerRef}
                                type="button"
                                aria-haspopup="menu"
                                aria-expanded={expand}
                                aria-label={t("nav.menu")}
                                onClick={() => setExpand(!expand)}
                                className={`flex ${invert ? "bg-[var(--foreground)]/10 text-[var(--text)] hover:bg-[var(--foreground)]/15 active:bg-[var(--foreground)]/20" : "bg-[var(--background)]/10 text-[var(--text-foreground)] hover:bg-[var(--background)]/20 active:bg-[var(--background)]/15"} items-center rounded-xl px-1 py-1 justify-center gap-1 cursor-pointer outline-none transition-colors duration-300 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 motion-reduce:transition-none`}
                            >
                                <Avatar invert={invert} initial={user?.name?.charAt(0)} box='w-8 h-8' text='' />
                                <Icon path={mdiChevronDown} style={{
                                    transform: expand
                                        ? "rotate(180deg)"
                                        : "rotate(0deg)",
                                }} size={0.8} />
                            </button>
                        </>
                        :
                        <div className='flex items-center justify-center gap-2'>
                            <button type="button" onClick={() => navigate('/login')} className={desktopSecondaryButton}>{t("nav.login")}</button>
                            <button type="button" onClick={() => navigate('/signup')} className={desktopPrimaryButton}>{t("nav.signup")}</button>
                        </div>
                    }
                    {menuMounted && !isMobile && desktopMenuPosition && createPortal(
                        <div
                            role="menu"
                            aria-label={t("nav.menu")}
                            className={`fixed z-[1010] w-[390px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-surface-raised p-4 text-ink shadow-[0_12px_36px_rgba(0,0,0,0.32)] ${menuClosing ? "animate-dropdown-out" : "animate-dropdown"} motion-reduce:animate-none`}
                            style={desktopMenuPosition}
                        >
                            {loading
                                ? <div className='flex w-full items-center gap-3 rounded-3xl bg-[var(--foreground)] p-3'>
                                    <Skeleton tone={dropdownTone} rounded='rounded-full' className='h-12 w-12 shrink-0' />
                                    <div className='min-w-0 flex-1 space-y-2'>
                                        <Skeleton tone={dropdownTone} className='h-5 w-28 max-w-full' />
                                        <Skeleton tone={dropdownTone} className='h-4 w-36 max-w-full' />
                                    </div>
                                    <Skeleton tone={dropdownTone} rounded='rounded-full' className='h-9 w-9 shrink-0' />
                                </div>
                                : <div className='w-full'>
                                    <button
                                        type="button"
                                        aria-expanded="true"
                                        onClick={() => setExpand(false)}
                                        className='flex w-full items-center gap-3 rounded-t-3xl rounded-b-sm bg-[var(--foreground)] p-3 text-left text-[var(--text-foreground)] outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary'
                                    >
                                        <Avatar themed initial={user?.name?.charAt(0)} box='h-12 w-12 shrink-0' text={"text-2xl"} />
                                        <span className='min-w-0 flex-1'>
                                            <span className='block truncate text-xl font-semibold leading-tight'>{displayName}</span>
                                            {accountIdentity && <span className='mt-0.5 block truncate text-sm font-normal leading-tight text-ink-muted'>{accountIdentity}</span>}
                                        </span>
                                    </button>

                                    <ul className='flex flex-col gap-1 pt-1'>
                                        {userDropDownList.map((item, i) => (
                                            <li key={i}>
                                                <button
                                                    type="button"
                                                    role="menuitem"
                                                    onClick={() => go(() => navigate(`${item[2]}`))}
                                                    className='flex w-full items-center gap-3 rounded-sm bg-[var(--foreground)] px-4 py-3 text-left text-[var(--text-foreground)] outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary hover:opacity-80 active:opacity-70'
                                                >
                                                    <span className='shrink-0'>{cloneElement(item[0], { size: 1 })}</span>
                                                    <span className={mobileAccountLabel}>{item[1]}</span>
                                                </button>
                                            </li>
                                        ))}
                                        <li>
                                            <button
                                                type="button"
                                                role="menuitem"
                                                onClick={handleSignOut}
                                                className='flex w-full items-center gap-3 rounded-t-sm rounded-b-2xl bg-[var(--foreground)] px-4 py-3 text-left text-status-danger outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary hover:opacity-80 active:opacity-70'
                                            >
                                                <Icon path={mdiLogout} size={1} className='shrink-0' />
                                                <span className={mobileAccountLabel}>{t("nav.signout")}</span>
                                            </button>
                                        </li>
                                    </ul>
                                </div>
                            }
                        </div>,
                        document.body
                    )}
                </div>

                <button ref={mobileTriggerRef} type="button" onClick={toggleMobileMenu}
                    aria-expanded={isMobile && expand} aria-controls="mobile-navigation"
                    aria-label={expand ? t('common:actions.close') : t('nav.menu')}
                    className='relative order-3 block shrink-0 cursor-pointer outline-none before:absolute before:-inset-3 focus-visible:ring-2 focus-visible:ring-primary sm:hidden'
                >
                    <Icon path={expand ? mdiClose : mdiMenu} size={0.9} />
                </button>
            </div>

            {!hideDestinationInput && <div ref={destinationRef} inert={mobileMenuActive && expand ? '' : undefined} aria-hidden={mobileMenuActive && expand} className={`relative order-2 flex min-w-0 shrink-0 items-center justify-center ${destinationWidth}`}>
                <BorderGlow
                    animated={destinationGlowEnabled}
                    glowColor={invert ? "var(--foreground)" : "var(--background)"}
                    darkGlowColor={invert ? "var(--foreground)" : "var(--background)"}
                    borderRadius={999}
                    edgeSensitivity={24}
                    glowRadius={24}
                    glowIntensity={0.72}
                    coneSpread={15}
                    className="w-full transition-transform duration-[160ms] ease-out motion-reduce:transition-none sm:hover:-translate-x-0.5 sm:hover:translate-y-1"
                >
                    <div
                        className={`flex w-full shadow-[-3.5px_7px_0_rgba(0,0,0,0.3)] sm:shadow-[-4.5px_8px_0_rgba(0,0,0,0.3)] hover:sm:shadow-[0_0_0_rgba(0,0,0,0)] transition-all duration-300 items-stretch rounded-full border-2 p-1.5 pl-3 ${invert ? "border-[var(--foreground)]/40 bg-[var(--background-muted)] text-ink" : "border-[var(--background)]/40 bg-[var(--foreground)] text-ink"}`}
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

            {mobileMenuActive && drawer}

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

    return mobileMenuActive
        ? <><div aria-hidden="true" style={{ height: mobileOrigin.height, width: mobileOrigin.width, marginTop: mobileOrigin.marginTop }} />{createPortal(navbar, document.body)}</>
        : navbar;
};

export default NavBar

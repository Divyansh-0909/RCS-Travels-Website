import Icon from '@mdi/react';
import { mdiMenu, mdiClose, mdiAccountCircle, mdiChevronDown, mdiCog, mdiInformation, mdiShieldCheck } from '@mdi/js';
import { useViewNavigate } from "../../hooks/useViewNavigate";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useApi } from '../../hooks/useApi';
import { useSignIn, useAuth, useUser } from "@clerk/clerk-react";
import Button from './Button';
import { useData } from '../../hooks/useData';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useExitAnim } from '../../hooks/useExitAnim';
import { scrollToSection } from '../../hooks/useSmoothScroll';
import pfpPlaceholder from "../../assets/pfp-placeholder.webp"
import FourSeaterSide from "../../assets/4-seater-bottom-left.webp"
import SixSeaterSide from "../../assets/6-seater-bottom-left.webp"
import Skeleton from './Skeleton';
import ErrorPanel from './ErrorPanel';


// The initial-in-a-circle, at whatever size the surface needs.
const Avatar = ({ invert, initial, box, text }) => (
    <div className={`${invert ? "bg-[var(--foreground)]" : "bg-[var(--background-primary)]"} flex items-center justify-center rounded-full ${box}`}>
        <h3 className={`font-semibold ${text} ${invert ? "text-[var(--text-foreground)]" : "text-[var(--text)]"}`}>
            {initial}
        </h3>
    </div>
)

const NavBar = ({ invert = false, hideExpanded = false }) => {
    const { user: clerkUser } = useUser();
    const navigate = useViewNavigate();
    const { signIn } = useSignIn();
    const { isSignedIn } = useAuth();
    const isMobile = useIsMobile();
    const scheduledTime = useData(state => state.scheduledTime);
    const bookingId = useData(state => state.bookingId);
    const bookingCode = useData(state => state.bookingCode);
    const status = useData(state => state.status);
    const sharing = useData(state => state.sharing);
    const vehicleType = useData(state => state.vehicleType);
    const fare = useData(state => state.fare);
    const dropLocation = useData(state => state.dropLocation);
    const pickupLocation = useData(state => state.pickupLocation);
    const [expand, setExpand] = useState(false)
    const api = useApi();
    const [user, setUser] = useState(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null)
    const drawerRef = useRef(null)

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
                    setError("Something went wrong")
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
            setError("Couldn't sign you out. Please try again.")
        }
    }

    // scrollToSection returns false when the section isn't on this route — the
    // navbar renders on every page, so About has to be able to send you home.
    const goToSection = (id) => {
        if (!scrollToSection(id)) navigate('/', { state: { scrollTo: id } });
    }

    // Close first, act on the next task — the scroll lock has to be released
    // before goToSection's smooth scroll can move the page.
    const go = (fn) => {
        setExpand(false)
        setTimeout(fn, 0)
    }

    // One source for both the desktop row and the drawer, so the signed-in and
    // admin conditions can't drift apart.
    const navLinks = [
        ["About", () => goToSection('about')],
        ["Help", () => navigate('/help')],
        ...(isSignedIn ? [["Ride History", () => navigate('/manage-account', { state: { tab: "Ride History" } })]] : []),
        ...(clerkUser?.publicMetadata?.role === "admin" ? [["Dashboard", () => navigate('/dashboard')]] : []),
    ]

    const userDropDownList = [[<Icon path={mdiAccountCircle} size={1.2} />, "Manage Account", "/manage-account"], [<Icon path={mdiCog} size={1.1} />, "Settings", "/settings"], [<Icon path={mdiShieldCheck} size={1.1} />, "Safety", "/safety"], [<Icon path={mdiInformation} size={1.1} />, "Legal", "/"]]

    const displayName = user?.name?.length > 15 ? `${user.name.slice(0, 15)}...` : user?.name

    const rowHover = invert
        ? "hover:bg-[var(--foreground)]/8 active:bg-[var(--foreground)]/12"
        : "hover:bg-[var(--foreground-muted)] active:bg-[var(--foreground-muted)]"

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
                aria-label="Menu"
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
                                <Avatar invert={invert} initial={user?.name?.charAt(0)} box='w-12 h-12 shrink-0' text='text-2xl' />
                                <h3 className='truncate text-xl font-semibold'>{displayName}</h3>
                            </div>
                        : <h3><span className='font-semibold'>RCS</span> travels</h3>
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
                        ? <Button onClick={handleSignOut} prop={{ variant: "negative", width: "100%" }}>Sign out</Button>
                        : <div className='flex flex-col gap-2'>
                            <h4
                                onClick={() => go(() => navigate('/login'))}
                                className={`cursor-pointer rounded-xl border py-3 text-center text-base font-medium transition-colors duration-300 ${invert ? "border-[var(--foreground)]/25 hover:bg-[var(--foreground)]/10 active:bg-[var(--foreground)]/15" : "border-black/15 hover:bg-[var(--foreground-muted)] active:bg-[var(--foreground-muted)]"}`}
                            >
                                Log in
                            </h4>
                            <h4
                                onClick={() => go(() => navigate('/signup'))}
                                className='cursor-pointer rounded-xl bg-[var(--background-primary)] py-3 text-center text-base font-semibold text-[var(--text)] transition-opacity duration-300 hover:opacity-90 active:opacity-80'
                            >
                                Sign up
                            </h4>
                        </div>
                    }
                </div>
            </div>
        </>
    )

    return (
        <div className={`flex flex-col justify-center items-center ${invert ? "bg-[var(--background-primary)]" : "bg-[var(--foreground)]"} w-[310px] sm:w-[700px] h-[40px] sm:h-[50px] gap-1 px-2 py-6 rounded-xl shadow-[8px_10px_0_rgba(0,0,0,0.25)] outline-1 outline-gray-400`}>
            <div className={`flex justify-between items-center ${invert ? "text-[var(--text)]" : "text-[var(--text-foreground)]"} [&>*]:select-none w-full sm:gap-24 px-1`}>
                <h3 onClick={() => navigate('/')} className={`cursor-pointer pl-1 sm:opacity-[0.85] transition-opacity duration-300 opacity-[1] hover:opacity-[1]`}><span className='font-semibold'>RCS</span> travels</h3>

                <div className='sm:block hidden'>
                    <ul className={`flex gap-2 [&>li]:cursor-pointer [&>li]:text-sm [&>li]:transition-all [&>li]:duration-300 [&>*]:px-2 [&>*]:py-1.5 [&>*]:rounded-lg ${invert ? "[&>*]:text-[var(--text)]/80 [&>*]:hover:text-[var(--text)] [&>*]:bg-[var(--background-primary)] [&>*]:hover:bg-[var(--foreground)]/10" : "[&>*]:text-[var(--text-foreground)]/80 [&>*]:hover:text-[var(--text-foreground)] [&>*]:bg-[var(--foreground)] [&>*]:hover:bg-[var(--background-primary)]/10"}`}>
                        {navLinks.map(([label, action], i) => (
                            <li key={i} onClick={action}>{label}</li>
                        ))}
                    </ul>
                </div>

                <div className='flex relative justify-center -mr-1.5 items-center gap-3 sm:block hidden '>
                    {isSignedIn
                        ?
                        <div onClick={() => setExpand(!expand)} className={`flex ${invert ? "text-[var(--text)] bg-[var(--background-primary)] hover:bg-[var(--foreground)]/10" : "text-[var(--text-foreground)] bg-[var(--foreground)] hover:bg-[var(--background-primary)]/10"} jusityf-center items-center px-1 py-1 rounded-3xl justify-center items-center gap-1 cursor-pointer transition-color duration-300`}>
                            <Avatar invert={invert} initial={user?.name?.charAt(0)} box='w-8 h-8' text='' />
                            <Icon path={mdiChevronDown} style={{
                                transform: expand
                                    ? "rotate(180deg)"
                                    : "rotate(0deg)",
                            }} size={0.8} />
                        </div>
                        :
                        <div className='flex gap-1 justify-center items-center [&>*]:opacity-[1] [&>*]:hover:opacity-[0.8] [&>*]:cursor-pointer [&>*]:transition-all [&>*]:duration-300'>
                            <h4 onClick={() => navigate('/login')} className='text-base font-medium hover:bg-[var(--background-primary)]/10 px-3 py-2 rounded-lg'>Log in</h4>
                            <h4 onClick={() => navigate('/signup')} className='text-base font-medium text-[var(--text)] bg-[var(--background-primary)] px-3 py-2 rounded-lg'>Sign up</h4>
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
                                        <Avatar invert={invert} initial={user?.name?.charAt(0)} box='w-14 h-14' text='text-3xl' />
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
                                            <Button onClick={handleSignOut} className="mt-5" prop={{ variant: "negative", width: "345px" }}>Sign out</Button>
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
                    className='block sm:hidden cursor-pointer opacity-100 hover:opacity-70 active:opacity-60 transition-opacity duration-300'
                    size={0.9}
                />
            </div>

            <ErrorPanel prop={{ error: expand ? error : null, setError, onOkay: () => navigate('/') }} />

            {menuMounted && isMobile && createPortal(drawer, document.body)}

            {/* expanded panel */}
            {/* {!hideExpanded && bookingId && isSignedIn &&
                <div className='w-full animate-dropdown'>
                    <div
                        onClick={() => navigate('/booking/test')}
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
                                    {vehicleType === 4 ? "Cab Economy" : "Cab XL"}
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
                            <img className='w-30 -mr-2 ml-1 sm:ml-0 sm:mr-0 -my-2' src={vehicleType === 4 ? FourSeaterSide : SixSeaterSide} alt="car" />
                        </div>
                    </div>
                </div>
            } */}
        </div>
    );
};

export default NavBar

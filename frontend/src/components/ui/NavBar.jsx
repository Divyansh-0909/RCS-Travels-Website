import Icon from '@mdi/react';
import { mdiMenu, mdiAccountCircle, mdiChevronDown, mdiCog, mdiInformation, mdiShieldCheck } from '@mdi/js';
import { useViewNavigate } from "../../hooks/useViewNavigate";
import { useEffect, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import { useSignIn, useAuth } from "@clerk/clerk-react";
import Button from './Button';
import { useData } from '../../hooks/useData';
import pfpPlaceholder from "../../assets/pfp-placeholder.webp"
import FourSeaterSide from "../../assets/4-seater-bottom-left.webp"
import SixSeaterSide from "../../assets/6-seater-bottom-left.webp"
import ManageAccount from '../../pages/ManageAccount';
import Skeleton from './Skeleton';
import ErrorPanel from './ErrorPanel';

//hideExpanded is for the vertically expanded navbar which shows up when a booking is done which has been removed now

const NavBar = ({ invert = false, hideExpanded = false }) => {
    const navigate = useViewNavigate();
    const { signIn } = useSignIn();
    const { isSignedIn } = useAuth();
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

    const [menuMounted, setMenuMounted] = useState(false)
    const [menuClosing, setMenuClosing] = useState(false)
    useEffect(() => {
        if (expand) {
            setMenuMounted(true)
            setMenuClosing(false)
            return
        }
        if (!menuMounted) return
        setMenuClosing(true)
        const t = setTimeout(() => {
            setMenuMounted(false)
            setMenuClosing(false)
        }, 220)
        return () => clearTimeout(t)
    }, [expand, menuMounted])

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

    const userDropDownList = [[<Icon path={mdiAccountCircle} size={1.2} />,"Manage Account"], [<Icon path={mdiCog} size={1.1} />,"Setting"], [<Icon path={mdiShieldCheck} size={1.1} />,"Safety"], [<Icon path={mdiInformation} size={1.1} />,"Legal"]]

    return (
        <div className={`flex flex-col justify-center items-center ${invert ? "bg-[var(--background-primary)]" : "bg-[var(--foreground)]"} w-[300px] sm:w-fit ${bookingId && isSignedIn ? "h-fit" : "h-[40px] sm:h-[50px]"} gap-1 px-2 py-2 rounded-full`}>
            <div className={`flex justify-between items-center ${invert ? "text-[var(--text)]" : "text-[var(--text-foreground)]"} [&>*]:select-none w-full sm:gap-24 px-1`}>
                <h3 onClick={() => navigate('/')} className={`cursor-pointer pl-1 sm:opacity-[0.85] transition-opacity duration-300 opacity-[1] hover:opacity-[1]`}><span className='font-semibold'>RCS</span> travels</h3>

                <div className='sm:block hidden'>
                    <ul className={`flex gap-2 [&>li]:cursor-pointer [&>li]:text-sm [&>li]:transition-all [&>li]:duration-300 [&>*]:px-2 [&>*]:py-1.5 [&>*]:rounded-full ${invert ? "[&>*]:text-[var(--text)]/80 [&>*]:hover:text-[var(--text)] [&>*]:bg-[var(--background-primary)] [&>*]:hover:bg-[var(--foreground)]/10" : "[&>*]:text-[var(--text-foreground)]/80 [&>*]:hover:text-[var(--text-foreground)] [&>*]:bg-[var(--foreground)] [&>*]:hover:bg-[var(--background-primary)]/10"}`}>
                        <li onClick={() => navigate('/about')}>About</li>
                        <li onClick={() => navigate('/help')}>Help</li>
                        {isSignedIn &&
                            <li onClick={() => navigate('/ride-history')}>Ride History</li>
                        }
                    </ul>
                </div>

                <div className='flex relative justify-center -mr-1.5 items-center gap-3 sm:block hidden '>
                    {isSignedIn
                        ?
                        <div onClick={() => setExpand(!expand)} className={`flex ${invert ? "text-[var(--text)] bg-[var(--background-primary)] hover:bg-[var(--foreground)]/10" : "text-[var(--text-foreground)] bg-[var(--foreground)] hover:bg-[var(--background-primary)]/10"} jusityf-center items-center px-1 py-1 rounded-3xl justify-center items-center gap-1 cursor-pointer transition-color duration-300`}>
                            <div className={`${invert ? "bg-[var(--foreground)]" : "bg-[var(--background-primary)]"} flex items-center justify-center w-8 h-8 rounded-full`}>
                                <h3 className={`font-semibold ${invert ? "text-[var(--text-foreground)]" : "text-[var(--text)]"}`}>
                                    {user?.name?.charAt(0)}
                                </h3>
                            </div>
                            <Icon path={mdiChevronDown} style={{
                                transform: expand
                                    ? "rotate(180deg)"
                                    : "rotate(0deg)",
                            }} size={0.8} />
                        </div>
                        :
                        <div className='flex gap-1 justify-center items-center [&>*]:opacity-[1] [&>*]:hover:opacity-[0.8] [&>*]:cursor-pointer [&>*]:transition-all [&>*]:duration-300'>
                            <h4 onClick={() => navigate('/login')} className='text-base font-medium hover:bg-[var(--background-primary)]/10 px-3 py-2 rounded-3xl'>Log in</h4>
                            <h4 onClick={() => navigate('/signup')} className='text-base font-medium text-[var(--text)] bg-[var(--background-primary)] px-3 py-2 rounded-3xl'>Sign up</h4>
                        </div>
                    }
                    {menuMounted &&
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
                                    <div className={`${invert ? "text-[var(--text)]" : "text-[var(--text-foreground)]"} flex items-center w-full justify-between py-2`}>
                                        <h3 className='text-3xl font-semibold'>
                                            {
                                                user?.name?.length > 15
                                                    ? `${user.name.slice(0, 15)}...`
                                                    : user?.name
                                            }
                                        </h3>
                                        <div className={`${invert ? "bg-[var(--foreground)]" : "bg-[var(--background-primary)]"} flex items-center justify-center w-14 h-14 rounded-full`}>
                                            <h3 className={`font-semibold text-3xl ${invert ? "text-[var(--text-foreground)]" : "text-[var(--text)]"}`}>
                                                {user?.name?.charAt(0)}
                                            </h3>
                                        </div>
                                    </div>
                                    <div className='w-full'>
                                        <ul className='flex flex-col items-start justify-center gap-2 sm:gap-3 w-full'>
                                            {userDropDownList.map((item, i) => {
                                                return (
                                                    <li key={i} className={`font-normal text-3xl w-full rounded-full py-2 px-3 flex justify-start gap-2 transition-color duration-300 items-center ${!invert ? " text-[var(--text-foreground)] bg-[var(--background-primary)]/10 hover:bg-[var(--background-primary)]/15" : "text-[var(--text)] bg-[var(--foreground)]/10 hover:bg-[var(--foreground)]/5"}`}>
                                                        {item[0]}
                                                        <h4>{item[1]}</h4>
                                                    </li>
                                                )
                                            })}
                                            <Button onClick={handleSignOut} prop={{variant: "negative", width: "345px" }}>Sign out</Button>
                                        </ul>
                                    </div>
                                </>
                            }
                        </Button>
                    }
                </div>

                <Icon path={mdiMenu} className='block sm:hidden' size={0.9} />
            </div>

            <ErrorPanel prop={{ error: expand ? error : null, setError, onOkay: () => navigate('/') }} />

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
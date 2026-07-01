import Icon from '@mdi/react';
import { mdiMenu, mdiAccountCircle, mdiChevronDown } from '@mdi/js';
import { useViewNavigate } from "../../hooks/useViewNavigate";
import { useState } from 'react';
import { useSignIn, useAuth } from "@clerk/clerk-react";
import Button from './Button';
import { useData } from '../../hooks/useData';
import pfpPlaceholder from "../../assets/pfp-placeholder.webp"
import FourSeaterSide from "../../assets/4-seater-bottom-left.webp"
import SixSeaterSide from "../../assets/6-seater-bottom-left.webp"

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

    return (
        <div className={`flex flex-col justify-center items-center ${invert ? "bg-[var(--background-primary)]" : "bg-[var(--foreground)]"} w-[300px] sm:w-fit ${bookingId && isSignedIn ? "h-fit" : "h-[40px] sm:h-[50px]"} gap-1 px-2 py-2 rounded-full`}>
            <div className={`flex justify-between items-center ${invert ? "text-[var(--text)]" : "text-[var(--text-foreground)]"} w-full sm:gap-24 px-1`}>
                <h3 onClick={() => navigate('/')} className={`cursor-pointer pl-1 ${invert ? "sm:opacity-[0.85]" : "sm:opacity-[0.75]"} transition-opacity duration-300 opacity-[1] hover:opacity-[1]`}><span className='font-semibold'>RCS</span> travels</h3>

                <div className='sm:block hidden'>
                    <ul className={`flex gap-4 [&>li]:cursor-pointer [&>li]:text-sm [&>li]:transition-all [&>li]:duration-300ms ${invert ? "[&>li]:text-white/80 [&>li]:hover:text-white" : "[&>li]:text-black/80 [&>li]:hover:text-black"}`}>
                        <li onClick={() => navigate('/about')}>About</li>
                        <li onClick={() => navigate('/help')}>Help</li>
                        {isSignedIn &&
                            <li onClick={() => navigate('/ride-history')}>Ride History</li>
                        }
                    </ul>
                </div>

                <div className='flex relative justify-center items-center gap-3 sm:block hidden '>
                    {isSignedIn
                        ?
                        <div onClick={() => setExpand(!expand)} className={`flex ${invert? "text-[var(--text-foreground)] bg-[var(--foreground)]" : "text-[var(--text)] bg-[var(--background-primary)]"} jusityf-center items-center px-1 py-1 rounded-3xl justify-center items-center gap-1 hover:opacity-[0.9] cursor-pointer transition-opacity duration-300`}>
                            <Icon path={mdiAccountCircle} size={1.3} />
                            <Icon path={mdiChevronDown} className='mr-1' style={{
                                transform: expand
                                    ? "rotate(180deg)"
                                    : "rotate(0deg)",
                            }} size={0.8} />
                        </div>
                        :
                        <div className='flex gap-3 justify-center items-center -mr-1 [&>*]:opacity-[1] [&>*]:hover:opacity-[0.8] [&>*]:cursor-pointer [&>*]:transition-opacity [&>*]:duration-300'>
                            <h4 onClick={() => navigate('/login')} className='text-base font-medium '>Log in</h4>
                            <h4 onClick={() => navigate('/signup')} className='text-base font-medium text-[var(--text)] bg-[var(--background-primary)] px-3 py-1 rounded-3xl'>Sign up</h4>
                        </div>
                    }
                    {expand
                        ?
                        <div>

                        </div>
                        :
                        <div>

                        </div>
                    }
                </div>

                <Icon path={mdiMenu} className='block sm:hidden' size={0.9} />
            </div>

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
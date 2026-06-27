import Icon from '@mdi/react';
import { mdiMenu, mdiAccountCircle } from '@mdi/js';
import { useViewNavigate } from "../../hooks/useViewNavigate";
import { useSignIn, useAuth } from "@clerk/clerk-react";
import Button from './Button';
import { useData } from '../../hooks/useData';
import pfpPlaceholder from "../../assets/pfp-placeholder.webp"
import FourSeaterSide from "../../assets/4-seater-bottom-left.webp"
import SixSeaterSide from "../../assets/6-seater-bottom-left.webp"

const NavBar = () => {
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

    return (
        <div className={`flex flex-col justify-start items-center bg-[var(--foreground)] w-[300px] sm:w-fit ${bookingId && isSignedIn ? "h-fit" : "h-[50px]"} gap-1 px-2 sm:px-3 py-2 rounded-3xl shadow-[0px_10px_30px_rgba(0,0,0,0.4)]`}>
            <div className='flex justify-between items-center text-[var(--text-foreground)] w-full sm:gap-24 px-1'>
                <h3 onClick={() => navigate('/')} className='cursor-pointer'><span className='font-semibold'>RCS</span> travels</h3>

                <div className='sm:block hidden'>
                    <ul className='flex gap-4 [&>li]:cursor-pointer [&>li]:text-sm [&>li]:text-black/80 [&>li]:transition-all [&>li]:duration-300ms [&>li]:hover:text-black'>
                        <li onClick={() => navigate('/about')}>About</li>
                        <li onClick={() => navigate('/help')}>Help</li>
                        {isSignedIn &&
                            <li onClick={() => navigate('/ride-history')}>Ride History</li>
                        }
                    </ul>
                </div>

                <div className='flex justify-center items-center gap-3 sm:block hidden '>
                    {isSignedIn
                        ?
                        <Icon onClick={() => navigate('/account')} className='[&>*]:opacity-[1] [&>*]:hover:opacity-[0.8] [&>*]:cursor-pointer [&>*]:transition-opacity [&>*]:duration-300 -mr-1' path={mdiAccountCircle} size={1.5} />
                        :
                        <div className='flex gap-3 justify-center items-center -mr-1 [&>*]:opacity-[1] [&>*]:hover:opacity-[0.8] [&>*]:cursor-pointer [&>*]:transition-opacity [&>*]:duration-300'>
                            <h4 onClick={() => navigate('/login')} className='text-base font-medium '>Log in</h4>
                            <h4 onClick={() => navigate('/signup')} className='text-base font-medium text-[var(--text)] bg-primary px-3 py-1 rounded-3xl'>Sign up</h4>
                        </div>
                    }
                </div>

                <Icon path={mdiMenu} className='block sm:hidden' size={0.9} />
            </div>

            {/* expanded panel */}
            {bookingId && isSignedIn &&
            <div className='w-full animate-dropdown'>
            <div
                onClick={()=>navigate('/booking/:id')}
                style={{
                    background: 'radial-gradient(130% 120% at 92% 50%, rgba(36,58,251,0.30) 0%, rgba(11,11,153,0.18) 35%, transparent 62%), linear-gradient(135deg, #1b1936 0%, #121220 55%, #0c0c16 100%)',
                    boxShadow: 'inset 0 1px 0 rgba(122,148,255,0.18)',
                }}
                className={`w-full cursor-pointer hover:scale-[1.01] transition-transform duration-300 flex items-center justify-between rounded-2xl py-2 px-4`}>
                <div className='flex flex-col justify-center items-left'>
                    {status === 'assigned'
                        ? <h4 className='font-medium'> Pick up in 2 min <span className="text-base text-[var(--text-muted)]">• {pickupLocation.split(",")[0]}</span></h4>
                        : <h4 className="font-medium">
                            {status?.charAt(0).toUpperCase() + status?.slice(1)}
                          </h4>
                    }
                    {status === 'assigned'
                        ? <h4 className="text-base text-[var(--text-muted)]"> UP 16 AB 1234, Car name</h4>
                        : <h4 className="text-base text-[var(--text-muted)]">
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
                    <img className='w-25 sm:w-30 -mr-2 ml-1 sm:ml-0 sm:mr-0 -my-2' src={vehicleType === 4 ? FourSeaterSide : SixSeaterSide} alt="car" />
                </div>
            </div>
            </div>
            }
        </div>
    );
};

export default NavBar
import Icon from '@mdi/react';
import { mdiMenu, mdiAccountCircle } from '@mdi/js';
import { useViewNavigate } from "../../hooks/useViewNavigate";
import { useSignIn, useAuth } from "@clerk/clerk-react";
import Button from './Button';

const NavBar = ()=>{
    const navigate = useViewNavigate();
    const { signIn } = useSignIn();
    const { isSignedIn } = useAuth();
    
    return (
        <div className="flex justify-between items-center text-[var(--text-foreground)] bg-[var(--foreground)] w-fit h-[50px] gap-8 sm:gap-24 px-4 py-2 rounded-full">
            <h3 onClick={()=>navigate('/')} className='cursor-pointer'><span className='font-semibold'>RCS</span> travels</h3>
            
            <div className='sm:block hidden'>
                <ul className='flex gap-4 [&>li]:cursor-pointer [&>li]:text-sm [&>li]:text-black/80 [&>li]:transition-all [&>li]:duration-300ms [&>li]:hover:text-black'>
                    <li onClick={()=>navigate('/about')}>About</li>
                    <li onClick={()=>navigate('/help')}>Help</li>
                    {isSignedIn && 
                        <li onClick={()=>navigate('/ride-history')}>Ride History</li>
                    }
                </ul>
            </div>
            
            <div className='flex justify-center items-center gap-3 sm:block hidden '>
                { isSignedIn 
                ?  
                    <Icon onClick={()=>navigate('/account')} className='[&>*]:opacity-[1] [&>*]:hover:opacity-[0.8] [&>*]:cursor-pointer [&>*]:transition-opacity [&>*]:duration-300 -mr-2' path={mdiAccountCircle} size={1.55} />
                :
                    <div className='flex gap-3 justify-center items-center -mr-1 [&>*]:opacity-[1] [&>*]:hover:opacity-[0.8] [&>*]:cursor-pointer [&>*]:transition-opacity [&>*]:duration-300'>
                        <h4 onClick={()=>navigate('/login')} className='text-base font-medium '>Log in</h4>
                        <h4 onClick={()=>navigate('/signup')} className='text-base font-medium text-[var(--text)] bg-primary px-3 py-1 rounded-3xl'>Sign up</h4>
                    </div>
                }
            </div>

            <Icon path={mdiMenu} className='block sm:hidden' size={0.9}/>
        </div>
    );
};

export default NavBar
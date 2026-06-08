import Icon from '@mdi/react';
import { mdiMenu } from '@mdi/js';

const NavBar = ()=>{
    return (
        <div className="flex justify-between items-center text-black bg-white w-fit gap-4 px-4 py-2 rounded-full">
            <h3><span className='font-semibold'>RCS</span> travels</h3>
            <Icon path={mdiMenu} size={0.9}/>
            {/* <div className='flex justify-center items-center gap-3'>
                <h4 className='font-medium'>Log in</h4>
                <Icon path={mdiMenu} size={0.85} />
            </div> */}
        </div>
    );
};

export default NavBar
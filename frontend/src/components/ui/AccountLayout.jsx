import Icon from '@mdi/react';
import { mdiKeyboardBackspace } from '@mdi/js';
import { useViewNavigate } from "../../hooks/useViewNavigate";


const AccountLayout = ({ items, selected, onSelect, title, children }) => {
    const navigate = useViewNavigate();

    return (
        <div className="w-[100vw] h-[100dvh] flex flex-col justify-center items-center px-5 pb-10 sm:px-10 bg-[var(--foreground)] text-[var(--text-foreground)]">
            <div className="flex w-full justify-start items-center gap-3 py-6">
                <h3 onClick={() => navigate('/')} className="sm:block hidden cursor-pointer text-[var(--background-primary)] text-2xl pl-1 opacity-[0.85] transition-opacity duration-300 hover:opacity-[1]"><span className="font-semibold">RCS</span> travels</h3>
                <Icon onClick={() => navigate('/')} className="sm:hidden block cursor-pointer text-[var(--background-primary)] opacity-[0.85] transition-opacity duration-300 hover:opacity-[1]" path={mdiKeyboardBackspace} size={1.2} />
                {title && (
                    <>
                        <span className="text-[var(--background-primary)]/25 text-xl font-light select-none">/</span>
                        <h3 className="text-[var(--background-primary)]/60 text-xl">{title}</h3>
                    </>
                )}
            </div>
            <div className="w-full flex-1 min-h-0 flex gap-5 justify-center items-center">
                <div className="w-[16%] flex justify-center items-start h-full">
                    <ul className="flex flex-col items-start justify-center w-full">
                        {items.map((item, i) => (
                            <li key={i} onClick={() => onSelect(i)} className={`font-normal text-3xl w-full cursor-pointer select-none py-3 px-4 rounded-2xl flex justify-start gap-2 transition-color duration-300 items-center ${selected === i ? "bg-[var(--background-primary)] hover:bg-[var(--background-primary)] text-[var(--text)]" : "hover:bg-[var(--background-primary)]/5 text-[var(--text-foreground)]"}`}>
                                <h4>{item}</h4>
                            </li>
                        ))}
                    </ul>
                </div>
                <div className="w-[84%] flex flex-col rounded-3xl justify-start items-start h-full min-h-0">
                    <h3 className="text-4xl text-[var(--text-foreground)] font-semibold pb-4 sm:pb-6 px-4">{items[selected]}</h3>
                    {children}
                </div>
            </div>
        </div>
    );
};

export default AccountLayout;

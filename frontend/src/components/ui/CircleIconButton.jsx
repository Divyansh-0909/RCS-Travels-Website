import Icon from '@mdi/react';

// Round action button at the end of a settings row (the "+" opener, the download
// tray, etc.). Dims and blocks clicks while `disabled`.
const CircleIconButton = ({ icon, onClick, size = 1, disabled = false, className = "" }) => (
    <div
        onClick={disabled ? undefined : onClick}
        className={`bg-[var(--background-primary)] text-[var(--foreground)] transition-opacity duration-300 flex items-center justify-center w-8 h-8 shrink-0 rounded-full ${disabled ? "opacity-60 pointer-events-none" : "opacity-100 hover:opacity-80 cursor-pointer"} ${className}`}
    >
        <Icon path={icon} size={size} />
    </div>
);

export default CircleIconButton;

import Icon from '@mdi/react';

// Round action button at the end of a settings row (the "+" opener, the download
// tray, etc.). Dims and blocks clicks while `disabled`.
const CircleIconButton = ({ icon, onClick, size = 1, disabled = false, className = "", ariaLabel = "Action" }) => (
    <button
        type="button"
        aria-label={ariaLabel}
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        className={`bg-strong text-on-strong transition-opacity duration-300 flex items-center justify-center w-8 h-8 shrink-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${disabled ? "opacity-60 cursor-not-allowed" : "opacity-100 hover:opacity-80 cursor-pointer"} ${className}`}
    >
        <Icon path={icon} size={size} />
    </button>
);

export default CircleIconButton;

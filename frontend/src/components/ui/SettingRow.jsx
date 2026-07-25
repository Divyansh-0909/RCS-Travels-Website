// Settings-page row card: left-hand content plus an optional `trailing` control.
const SettingRow = ({ children, trailing, onClick, className = "" }) => (
    <li
        onClick={onClick}
        className={`font-normal text-3xl w-full select-none py-4 px-6 rounded-2xl flex justify-between items-center gap-2 bg-[var(--background-primary)]/5 text-[var(--text-foreground)] ${onClick ? "cursor-pointer transition-color duration-300 hover:bg-[var(--background-primary)]/10" : ""} ${className}`}
    >
        <div className="min-w-0">{children}</div>
        {trailing}
    </li>
);

export default SettingRow;

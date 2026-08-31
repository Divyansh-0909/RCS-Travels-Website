// Settings-page row card: left-hand content plus an optional `trailing` control.
const SettingRow = ({ children, trailing, onClick, className = "", tone = "bg-[var(--foreground)]" }) => (
    <li
        onClick={onClick}
        className={`font-normal text-3xl w-full select-none py-5 px-5 sm:px-6 rounded-3xl flex justify-between items-center gap-5 ${tone} text-[var(--text-foreground)] ${onClick ? "cursor-pointer transition-opacity duration-200 hover:opacity-80" : ""} ${className}`}
    >
        <div className="min-w-0 pr-2">{children}</div>
        {trailing}
    </li>
);

export default SettingRow;

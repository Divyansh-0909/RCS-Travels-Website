import Icon from "@mdi/react";
import { mdiContentCopy } from "@mdi/js";

// Shared display helpers for booking/driver cards (admin dashboard + ride history).

export const vehicleLabel = (t) => (t === 4 ? "Cab Economy" : t === 6 ? "Cab XL" : "—");

// Soft-tinted chip colors per booking status; active trip states share the brand blue.
export const statusChip = (status) => {
    if (status === "completed") return "text-green-700 bg-green-600/10";
    if (status === "cancelled") return "text-red-600 bg-red-500/10";
    if (status === "pending") return "text-amber-600 bg-amber-500/10";
    return "text-primary bg-primary/10";
};

// "Cyber Hub, DLF Cyber City, Gurugram" → ["Cyber Hub", "DLF Cyber City, Gurugram"]
export const splitAddress = (addr) => {
    const [main, ...rest] = (addr ?? "").split(",");
    return [main, rest.join(",").trim()];
};

export const displayPhone = (p) => (p ?? "").replace(/^\+91/, "");

export const formatDateTime = (d) =>
    `${new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} • ${new Date(d)
        .toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: true })
        .toUpperCase()}`;

// Hover-copy icon with the app's "copy" tooltip, used on ride IDs and phone numbers.
export const CopyBtn = ({ value, onCopy }) => (
    <span className="group relative inline-flex items-center align-middle">
        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-md bg-primary text-[var(--foreground)] text-xs font-semibold whitespace-nowrap opacity-0 translate-y-1 transition-[opacity,transform] duration-200 group-hover:opacity-100 group-hover:translate-y-0">copy</span>
        <Icon onClick={() => onCopy(value)} className="cursor-pointer mb-0.5 text-gray-500 transition-color duration-300 hover:text-[var(--text-foreground)]" path={mdiContentCopy} size={0.6} />
    </span>
);

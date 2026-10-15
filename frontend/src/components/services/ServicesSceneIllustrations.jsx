const outline = {
    fill: "none",
    stroke: "var(--services-ink)",
    strokeLinecap: "round",
    strokeLinejoin: "round",
};

export function SunCutout(props) {
    return (
        <svg viewBox="0 0 180 180" {...props} aria-hidden="true" focusable="false">
            <g transform="translate(7 8)" fill="var(--services-ink)"><circle cx="84" cy="84" r="54" /></g>
            <circle cx="84" cy="84" r="54" fill="var(--color-primary-light, var(--services-blue-soft))" stroke="var(--services-ink)" strokeWidth="4" />
            <g {...outline} strokeWidth="3"><path d="m49 55 15 8m18-15 2 17m22-12-10 14m22 7-16 6m-49 9 16 5m11 13-5 16m25-13 12 12m8-31 17-3" /></g>
        </svg>
    );
}

export function OrbitCutout(props) {
    return (
        <svg viewBox="0 0 220 120" {...props} aria-hidden="true" focusable="false">
            <path d="M16 110C31 28 105 2 181 26c17 5 29 13 38 22l-21 25c-10-9-21-15-34-19-59-19-112 1-128 62Z" transform="translate(8 8)" fill="var(--services-ink)" />
            <path d="M16 110C31 28 105 2 181 26c17 5 29 13 38 22l-21 25c-10-9-21-15-34-19-59-19-112 1-128 62Z" fill="var(--services-cream)" stroke="var(--services-ink)" strokeWidth="4" strokeLinejoin="round" />
            <g {...outline} strokeWidth="3"><path d="m43 75 12 7m29-31 6 13m36-9-3 14m38 4-10 10" /></g>
        </svg>
    );
}

export function StarCutout(props) {
    return (
        <svg viewBox="0 0 100 100" {...props} aria-hidden="true" focusable="false">
            <path d="m55 8 10 31 29 10-29 11-10 31-11-31L15 49l29-10L55 8Z" transform="translate(5 5)" fill="var(--services-ink)" />
            <path d="m50 5 10 31 29 10-29 11-10 31-11-31L10 46l29-10L50 5Z" fill="var(--services-cream)" stroke="var(--services-ink)" strokeWidth="4" strokeLinejoin="round" />
        </svg>
    );
}

export function BoltCutout(props) {
    return (
        <svg viewBox="0 0 100 130" {...props} aria-hidden="true" focusable="false">
            <path d="m58 8-43 62h27l-4 49 47-68H59l-1-43Z" transform="translate(6 6)" fill="var(--services-ink)" />
            <path d="M52 4 9 66h27l-4 49 47-68H53L52 4Z" fill="var(--services-blue)" stroke="var(--services-ink)" strokeWidth="4" strokeLinejoin="round" />
        </svg>
    );
}

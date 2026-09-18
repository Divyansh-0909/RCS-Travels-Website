const outline = {
    fill: "none",
    stroke: "var(--services-ink)",
    strokeLinecap: "round",
    strokeLinejoin: "round",
};

export function SunCutout(props) {
    return (
        <svg viewBox="0 0 180 180" aria-hidden="true" {...props}>
            <g transform="translate(7 9)">
                <circle cx="90" cy="90" r="53" fill="var(--services-ink)" />
            </g>
            <circle cx="90" cy="90" r="53" fill="var(--services-orange)" stroke="var(--services-ink)" strokeWidth="4" />
            <g {...outline} strokeWidth="4">
                <path d="M90 8v20M90 152v20M8 90h20M152 90h20" />
                <path d="m32 32 14 14m88 88 14 14M148 32l-14 14m-88 88-14 14" />
            </g>
            <g stroke="var(--services-ink)" strokeWidth="3" strokeLinecap="round">
                <path d="m71 65 7 9m12-20 2 13m16-9-5 12m19 0-10 8m-48 16 12 2m29 1 13 4m-41 17 8-10m17 12 2-12" />
            </g>
        </svg>
    );
}

export function CampusCutout(props) {
    return (
        <svg viewBox="0 0 650 390" aria-hidden="true" {...props}>
            <g transform="translate(12 14)" opacity=".9" fill="var(--services-ink)">
                <path d="M56 337V182l112-76 106 70v161H56Z" />
                <path d="M236 337V128l132-94 132 94v209H236Z" />
                <path d="M454 337V171l72-49 78 53v162H454Z" />
            </g>

            <g stroke="var(--services-ink)" strokeWidth="4" strokeLinejoin="round">
                <path d="M44 325V170l112-76 106 70v161H44Z" fill="var(--services-sand)" />
                <path d="M224 325V116l132-94 132 94v209H224Z" fill="var(--services-cream)" />
                <path d="M442 325V159l72-49 78 53v162H442Z" fill="var(--services-sand)" />

                <path d="M224 116h264M44 170h218M442 159h150" fill="none" />

                <g fill="var(--services-blue)">
                    <rect x="78" y="198" width="42" height="54" rx="3" />
                    <rect x="139" y="198" width="42" height="54" rx="3" />
                    <rect x="199" y="198" width="34" height="54" rx="3" />
                    <rect x="264" y="145" width="47" height="59" rx="3" />
                    <rect x="333" y="145" width="47" height="59" rx="3" />
                    <rect x="402" y="145" width="47" height="59" rx="3" />
                    <rect x="264" y="229" width="47" height="59" rx="3" />
                    <rect x="402" y="229" width="47" height="59" rx="3" />
                    <rect x="471" y="190" width="37" height="52" rx="3" />
                    <rect x="527" y="190" width="37" height="52" rx="3" />
                </g>

                <path d="M329 325v-90h60v90" fill="var(--services-teal)" />
                <path d="M349 325v-68h20v68" fill="var(--services-ink)" opacity=".16" />
            </g>

            <g stroke="var(--services-ink)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M8 334h624" />
                <path d="M92 326c0-26 12-43 32-43s33 17 33 43" fill="var(--services-teal)" />
                <path d="M110 326v-63m-18 23 18 14 18-18" />
                <path d="M520 326c0-29 13-48 35-48s36 19 36 48" fill="var(--services-teal)" />
                <path d="M553 326v-70m-20 27 20 15 19-22" />
            </g>
        </svg>
    );
}

export function CabExitIllustration(props) {
    return (
        <svg viewBox="0 0 980 540" aria-hidden="true" {...props}>
            <ellipse cx="455" cy="486" rx="374" ry="31" fill="var(--services-ink)" opacity=".2" />
            <ellipse cx="791" cy="494" rx="102" ry="18" fill="var(--services-ink)" opacity=".18" />

            <g transform="translate(12 13)" fill="var(--services-ink)" opacity=".88">
                <path d="M77 367c0-39 22-73 62-84l90-26 83-118c18-25 44-39 74-39h188c31 0 55 11 78 34l97 98 93 29c40 12 66 43 70 86l8 69H77v-49Z" />
            </g>

            <g stroke="var(--services-ink)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M65 354c0-39 22-73 62-84l90-26 83-118c18-25 44-39 74-39h188c31 0 55 11 78 34l97 98 93 29c40 12 66 43 70 86l8 69H65v-49Z" fill="var(--services-cream)" />
                <path d="m243 241 69-98c13-19 31-28 56-28h83v121l-208 5Z" fill="var(--services-blue-soft)" />
                <path d="M469 115h77c20 0 37 8 51 23l79 79-207 7V115Z" fill="var(--services-blue-soft)" />
                <path d="m218 244 505-18" fill="none" />
                <path d="M499 239v148M332 245v142" fill="none" />
                <path d="M602 263h48" fill="none" />
                <path d="M356 269h43" fill="none" />
                <path d="M83 331h79l24 50H68" fill="var(--services-orange)" />
                <path d="M785 319h82l15 53h-83" fill="var(--services-orange)" />
            </g>

            <g>
                <circle cx="231" cy="402" r="67" fill="var(--services-ink)" />
                <circle cx="231" cy="402" r="39" fill="var(--services-cream)" stroke="var(--services-ink)" strokeWidth="5" />
                <circle cx="731" cy="402" r="67" fill="var(--services-ink)" />
                <circle cx="731" cy="402" r="39" fill="var(--services-cream)" stroke="var(--services-ink)" strokeWidth="5" />
                <circle cx="231" cy="402" r="13" fill="var(--services-blue)" />
                <circle cx="731" cy="402" r="13" fill="var(--services-blue)" />
            </g>

            <g stroke="var(--services-ink)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M430 239 548 238l-28 174-119-10 29-163Z" fill="var(--services-ink)" opacity=".14" />
                <path d="M429 239h117l-23 158-117-4 23-154Z" fill="var(--services-sand)" />
                <path d="m545 241 73 54-31 150-64-48 22-156Z" fill="var(--services-cream)" />
                <path d="M551 269h48" />
            </g>

            <g transform="translate(610 54)">
                <ellipse cx="138" cy="426" rx="116" ry="18" fill="var(--services-ink)" opacity=".2" />

                <g transform="translate(10 12)" fill="var(--services-ink)" opacity=".9">
                    <circle cx="115" cy="78" r="40" />
                    <path d="M78 116c24-18 64-18 89 1l31 99-64 27-72-67 16-60Z" />
                    <path d="m97 216-22 116 53 75h45l-30-92 44-90-90-9Z" />
                </g>

                <g stroke="var(--services-ink)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="105" cy="66" r="40" fill="var(--services-skin)" />
                    <path d="M71 66c0-29 17-48 43-48 23 0 39 16 39 41-17-3-29-10-40-23-8 14-20 24-42 30Z" fill="var(--services-ink)" />
                    <path d="M83 84c8 8 22 11 33 6" fill="none" />
                    <path d="M68 112c23-18 64-19 89 0l37 93-68 28-72-69 14-52Z" fill="var(--services-blue)" />
                    <path d="m69 126-48 66 34 22 50-54" fill="var(--services-teal)" />
                    <path d="m159 125 54 45-25 33-56-35" fill="var(--services-teal)" />
                    <circle cx="23" cy="193" r="15" fill="var(--services-skin)" />
                    <circle cx="213" cy="171" r="15" fill="var(--services-skin)" />
                    <path d="M85 202h86l-34 107-72 2 20-109Z" fill="var(--services-denim)" />
                    <path d="m78 300-21 71 48 43 31-25-29-34 18-55" fill="var(--services-denim)" />
                    <path d="m143 303 27 70 55 10 7-39-42-8-17-53" fill="var(--services-denim)" />
                    <path d="m98 391 28 27-18 24-43-30-8-41" fill="var(--services-cream)" />
                    <path d="m190 337 45 5 7 35-66 4-6-9" fill="var(--services-cream)" />
                    <path d="M53 139c-7 24-5 49 6 74" fill="none" />
                    <path d="M59 121c-19 11-29 31-28 59" fill="none" />
                </g>
            </g>

            <g fill="var(--services-ink)">
                <rect x="122" y="290" width="58" height="9" rx="4.5" />
                <path d="M843 286h35l20 18h-52l-3-18Z" />
            </g>
        </svg>
    );
}

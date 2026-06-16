const MapBase = () => (
    <>
        <rect width="290" height="200" fill="#e8e0d4"/>
        {/* city blocks — top row */}
        <rect x="8"   y="8"   width="48" height="38" fill="#d9d0c2" rx="2"/>
        <rect x="64"  y="8"   width="44" height="30" fill="#d9d0c2" rx="2"/>
        <rect x="116" y="8"   width="52" height="38" fill="#d9d0c2" rx="2"/>
        <rect x="176" y="8"   width="46" height="30" fill="#d9d0c2" rx="2"/>
        <rect x="230" y="8"   width="52" height="38" fill="#d9d0c2" rx="2"/>
        {/* parks */}
        <rect x="8"   y="64" width="48" height="36" fill="#c4d8b3" rx="3"/>
        <rect x="200" y="60" width="50" height="42" fill="#c4d8b3" rx="3"/>
        {/* city blocks — mid row */}
        <rect x="8"   y="112" width="44" height="32" fill="#d9d0c2" rx="2"/>
        <rect x="60"  y="108" width="48" height="36" fill="#d9d0c2" rx="2"/>
        <rect x="116" y="110" width="52" height="34" fill="#d9d0c2" rx="2"/>
        <rect x="176" y="106" width="46" height="38" fill="#d9d0c2" rx="2"/>
        <rect x="230" y="110" width="52" height="34" fill="#d9d0c2" rx="2"/>
        {/* city blocks — bottom row */}
        <rect x="8"   y="158" width="44" height="34" fill="#d9d0c2" rx="2"/>
        <rect x="60"  y="154" width="48" height="38" fill="#d9d0c2" rx="2"/>
        <rect x="116" y="156" width="52" height="36" fill="#d9d0c2" rx="2"/>
        <rect x="176" y="152" width="46" height="40" fill="#d9d0c2" rx="2"/>
        <rect x="230" y="156" width="52" height="36" fill="#d9d0c2" rx="2"/>
        {/* major horizontal roads */}
        <rect x="0" y="54"  width="290" height="8" fill="white"/>
        <rect x="0" y="100" width="290" height="7" fill="white"/>
        <rect x="0" y="146" width="290" height="7" fill="white"/>
        {/* major vertical roads */}
        <rect x="56"  y="0" width="8" height="200" fill="white"/>
        <rect x="108" y="0" width="6" height="200" fill="white"/>
        <rect x="168" y="0" width="8" height="200" fill="white"/>
        <rect x="222" y="0" width="6" height="200" fill="white"/>
        {/* minor horizontal roads */}
        <rect x="0" y="26"  width="290" height="2.5" fill="white" opacity="0.65"/>
        <rect x="0" y="76"  width="290" height="2.5" fill="white" opacity="0.65"/>
        <rect x="0" y="130" width="290" height="2.5" fill="white" opacity="0.65"/>
        <rect x="0" y="172" width="290" height="2.5" fill="white" opacity="0.65"/>
        {/* minor vertical roads */}
        <rect x="30"  y="0" width="2.5" height="200" fill="white" opacity="0.65"/>
        <rect x="140" y="0" width="2.5" height="200" fill="white" opacity="0.65"/>
        <rect x="255" y="0" width="2.5" height="200" fill="white" opacity="0.65"/>
        {/* center dashes */}
        <line x1="0" y1="58"    x2="290" y2="58"    stroke="#fcd34d" strokeWidth="0.6" strokeDasharray="6,5" opacity="0.6"/>
        <line x1="0" y1="103.5" x2="290" y2="103.5" stroke="#fcd34d" strokeWidth="0.6" strokeDasharray="6,5" opacity="0.6"/>
        <line x1="0" y1="149.5" x2="290" y2="149.5" stroke="#fcd34d" strokeWidth="0.6" strokeDasharray="6,5" opacity="0.6"/>
        {/* expressway diagonal */}
        <path d="M0,200 Q72,164 145,128 Q218,92 290,56" stroke="white" strokeWidth="9" fill="none"/>
        {/* river */}
        <path d="M0,182 Q55,176 108,184 Q162,192 210,184 Q248,177 290,183" stroke="#a8d4f0" strokeWidth="8" fill="none"/>
    </>
)

export default MapBase

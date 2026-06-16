import mapImage from "../../assets/map.webp"

/* Illustration 2 — Safe, verified rides */
const SafetyIllustration = () => (
    <div style={{ position: "relative", width: "290px", height: "200px", borderRadius: "16px", overflow: "hidden" }}>

        {/* actual Greater Noida map */}
        <img
            src={mapImage}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 50%", transform: "scale(2)", transformOrigin: "50% 50%" }}
        />

        {/* subtle white wash */}
        <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.18)" }} />

        {/* pins + path + chip overlay */}
        <svg viewBox="0 0 290 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>

            {/* "Verified driver" chip — matches Image 2 top pill */}
            <rect x="8" y="8" width="140" height="23" rx="11.5" fill="white" style={{ filter: "drop-shadow(0 1px 6px rgba(0,0,0,0.18))" }}/>
            <circle cx="22" cy="19.5" r="9.5" fill="#243AFB"/>
            <text x="22" y="24" textAnchor="middle" fontSize="9" fill="#fcd34d">★</text>
            <text x="36" y="23.5" fontSize="9" fill="#222" fontWeight="600">4.9 · Verified driver</text>

            {/* dashed path: driver → user (Alpha 1 area) */}
            <path d="M55,158 Q90,134 128,108" stroke="#243AFB" strokeWidth="2" fill="none" strokeDasharray="4,3" opacity="0.7"/>

            {/* user pin (Alpha 1) */}
            <circle cx="128" cy="108" r="8" fill="#243AFB" stroke="white" strokeWidth="2.5"/>
            <circle cx="128" cy="108" r="3.5" fill="white"/>
            {/* pin shadow/drop */}
            <ellipse cx="128" cy="118" rx="5" ry="2" fill="rgba(36,58,251,0.25)"/>

            {/* driver pin (Knowledge Park direction) */}
            <circle cx="55" cy="158" r="11" fill="#243AFB" stroke="white" strokeWidth="2.5"/>
            {/* tiny car shape inside */}
            <rect x="50" y="152" width="10" height="12" rx="2.5" fill="rgba(255,255,255,0.3)"/>
            <rect x="51" y="153" width="8" height="5.5" rx="1" fill="rgba(255,255,255,0.65)"/>
            <rect x="50" y="158.5" width="2" height="3" rx="0.5" fill="#fcd34d" opacity="0.9"/>
            <rect x="58" y="158.5" width="2" height="3" rx="0.5" fill="#fcd34d" opacity="0.9"/>
        </svg>

        {/* bottom gradient */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.3) 38%, transparent 58%)", pointerEvents: "none" }}/>

        {/* card — Image 2 style */}
        <div style={{
            position: "absolute", bottom: "10px", left: "50%", transform: "translateX(-50%)",
            width: "265px", background: "white", borderRadius: "16px", padding: "11px 13px",
            boxShadow: "0 2px 16px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.04)",
        }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                    {/* driver avatar */}
                    <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "linear-gradient(135deg, #7A94FF 0%, #243AFB 100%)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ color: "white", fontSize: "11px", fontWeight: "700", fontFamily: "Poppins, sans-serif" }}>RK</span>
                    </div>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "4px" }}>
                            <span style={{ color: "#111", fontSize: "12.5px", fontWeight: "700", fontFamily: "Poppins, sans-serif" }}>Raju</span>
                            <span style={{ color: "#fbbf24", fontSize: "11px" }}>★</span>
                            <span style={{ color: "#333", fontSize: "10.5px", fontWeight: "600", fontFamily: "Poppins, sans-serif" }}>4.8</span>
                        </div>
                        <p style={{ color: "#555", fontSize: "9.5px", margin: "0 0 2px", display: "flex", alignItems: "center", gap: "5px", fontFamily: "Poppins, sans-serif" }}>
                            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#888", display: "inline-block", flexShrink: 0 }}/> Knowledge Park
                        </p>
                        <p style={{ color: "#555", fontSize: "9.5px", margin: 0, display: "flex", alignItems: "center", gap: "5px", fontFamily: "Poppins, sans-serif" }}>
                            <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#243AFB", display: "inline-block", flexShrink: 0 }}/> Alpha 1
                        </p>
                    </div>
                </div>
                <p style={{ color: "#243AFB", fontSize: "22px", fontWeight: "800", margin: 0, fontFamily: "Poppins, sans-serif" }}>₹120</p>
            </div>

            <div style={{ marginTop: "8px", display: "flex", gap: "6px" }}>
                <span style={{ background: "#EEF0FF", color: "#243AFB", fontSize: "9px", fontWeight: "600", padding: "3px 9px", borderRadius: "20px", fontFamily: "Poppins, sans-serif" }}>
                    🛡️ Background verified
                </span>
                <span style={{ background: "#F0FFF4", color: "#16a34a", fontSize: "9px", fontWeight: "600", padding: "3px 9px", borderRadius: "20px", fontFamily: "Poppins, sans-serif" }}>
                    GPS tracked
                </span>
            </div>
        </div>
    </div>
)

export default SafetyIllustration

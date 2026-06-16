import mapImage from "../../assets/map.webp"

/* Illustration 1 — Lowest campus prices */
const PriceIllustration = () => (
    <div style={{ position: "relative", width: "290px", height: "200px", borderRadius: "16px", overflow: "hidden" }}>

        {/* actual Greater Noida map */}
        <img
            src={mapImage}
            alt=""
            style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "55% 45%", transform: "scale(2)", transformOrigin: "55% 45%" }}
        />

        {/* subtle white wash so pins/card are readable */}
        <div style={{ position: "absolute", inset: 0, background: "rgba(255,255,255,0.18)" }} />

        {/* route + pins overlay */}
        <svg viewBox="0 0 290 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
            {/* route glow */}
            <path d="M48,148 Q95,108 145,82 Q185,60 230,42" stroke="rgba(36,58,251,0.22)" strokeWidth="9" fill="none" strokeLinecap="round"/>
            {/* dashed route line */}
            <path d="M48,148 Q95,108 145,82 Q185,60 230,42" stroke="#243AFB" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeDasharray="5,3"/>

            {/* pickup pin (Knowledge Park area) */}
            <circle cx="48" cy="148" r="8" fill="#22c55e" stroke="white" strokeWidth="2"/>
            <circle cx="48" cy="148" r="3" fill="white"/>

            {/* drop pin (Delta I / Gamma area) */}
            <circle cx="230" cy="42" r="8" fill="#243AFB" stroke="white" strokeWidth="2"/>
            <circle cx="230" cy="42" r="3" fill="white"/>
        </svg>

        {/* bottom gradient for card readability */}
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.3) 38%, transparent 58%)", pointerEvents: "none" }}/>

        {/* card — Image 1 style */}
        <div style={{
            position: "absolute", bottom: "10px", left: "50%", transform: "translateX(-50%)",
            width: "265px", background: "white", borderRadius: "16px", padding: "11px 13px",
            boxShadow: "0 2px 16px rgba(0,0,0,0.14), 0 0 0 1px rgba(0,0,0,0.04)",
        }}>
            <p style={{ color: "#999", fontSize: "9.5px", margin: "0 0 6px", fontFamily: "Poppins, sans-serif", letterSpacing: "0.02em" }}>Starting from</p>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                    <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: "#243AFB", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                            <path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1l2-4h10l2 4h1a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <circle cx="7.5" cy="17.5" r="2.5" stroke="white" strokeWidth="2"/>
                            <circle cx="16.5" cy="17.5" r="2.5" stroke="white" strokeWidth="2"/>
                        </svg>
                    </div>
                    <div>
                        <p style={{ color: "#111", fontSize: "12px", fontWeight: "700", margin: "0 0 1px", fontFamily: "Poppins, sans-serif" }}>14 min · 4.2 km</p>
                        <p style={{ color: "#888", fontSize: "9.5px", margin: 0, fontFamily: "Poppins, sans-serif" }}>Knowledge Park → Delta I</p>
                    </div>
                </div>
                <p style={{ color: "#243AFB", fontSize: "22px", fontWeight: "800", margin: 0, fontFamily: "Poppins, sans-serif" }}>₹120</p>
            </div>

            <div style={{ marginTop: "8px", display: "flex", gap: "6px" }}>
                <span style={{ background: "#EEF0FF", color: "#243AFB", fontSize: "9px", fontWeight: "600", padding: "3px 9px", borderRadius: "20px", fontFamily: "Poppins, sans-serif" }}>
                    ⚡ 40% cheaper
                </span>
                <span style={{ background: "#F5F5F5", color: "#999", fontSize: "9px", padding: "3px 9px", borderRadius: "20px", fontFamily: "Poppins, sans-serif", textDecoration: "line-through" }}>
                    Auto ₹180+
                </span>
            </div>
        </div>
    </div>
)

export default PriceIllustration

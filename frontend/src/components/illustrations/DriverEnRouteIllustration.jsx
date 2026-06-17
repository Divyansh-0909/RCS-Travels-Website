import { useState, useEffect } from "react"
import mapLight from "../../assets/map.webp"
import mapDark from "../../assets/map-dark.webp"

/* Illustration 2 — Safe, verified rides */
const SafetyIllustration = () => {
    const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'))

    useEffect(() => {
        const el = document.documentElement
        const observer = new MutationObserver(() => setIsDark(el.classList.contains('dark')))
        observer.observe(el, { attributes: true, attributeFilter: ['class'] })
        return () => observer.disconnect()
    }, [])

    return (
        <div style={{ position: "relative", width: "290px", height: "200px", borderRadius: "16px", overflow: "hidden" }}>

            <img
                src={isDark ? mapDark : mapLight}
                alt=""
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "50% 50%", transform: "scale(1.3)", transformOrigin: "50% 50%" }}
            />

            {/* overlay */}
            <div style={{ position: "absolute", inset: 0, background: isDark ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.18)" }} />

            {/* pins + path overlay */}
            <svg viewBox="0 0 290 200" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
                <path d="M55,158 Q90,134 128,108" stroke="#243AFB" strokeWidth="2" fill="none" strokeDasharray="4,3" opacity="0.7"/>

                {/* user pin */}
                <circle cx="128" cy="108" r="8" fill="#243AFB" stroke="white" strokeWidth="2.5"/>
                <circle cx="128" cy="108" r="3.5" fill="white"/>
                <ellipse cx="128" cy="118" rx="5" ry="2" fill="rgba(36,58,251,0.25)"/>

                {/* driver pin */}
                <circle cx="55" cy="158" r="11" fill="#243AFB" stroke="white" strokeWidth="2.5"/>
                <rect x="50" y="152" width="10" height="12" rx="2.5" fill="rgba(255,255,255,0.3)"/>
                <rect x="51" y="153" width="8" height="5.5" rx="1" fill="rgba(255,255,255,0.65)"/>
                <rect x="50" y="158.5" width="2" height="3" rx="0.5" fill="#fcd34d" opacity="0.9"/>
                <rect x="58" y="158.5" width="2" height="3" rx="0.5" fill="#fcd34d" opacity="0.9"/>
            </svg>


            {/* card */}
            <div style={{
                position: "absolute", bottom: "10px", left: "50%", transform: "translateX(-50%)",
                width: "265px", background: "#243AFB", borderRadius: "16px", padding: "11px 13px",
                boxShadow: "0 4px 20px rgba(19, 19, 19, 0.9), 0 8px 40px rgba(0,0,0,0.35)",
            }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "9px" }}>
                        <div style={{ width: "36px", height: "36px", borderRadius: "50%", background: "rgba(255,255,255,0.2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ color: "white", fontSize: "11px", fontWeight: "700" }}>RK</span>
                        </div>
                        <div>
                            <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "4px" }}>
                                <span style={{ color: "white", fontSize: "12.5px", fontWeight: "700" }}>Raju</span>
                                <span style={{ color: "#fbbf24", fontSize: "11px" }}>★</span>
                                <span style={{ color: "rgba(255,255,255,0.75)", fontSize: "10.5px", fontWeight: "600" }}>4.8</span>
                            </div>
                            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "9.5px", margin: "0 0 2px", display: "flex", alignItems: "center", gap: "5px" }}>
                                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "rgba(255,255,255,0.5)", display: "inline-block", flexShrink: 0 }}/> University Parking
                            </p>
                            <p style={{ color: "rgba(255,255,255,0.65)", fontSize: "9.5px", margin: 0, display: "flex", alignItems: "center", gap: "5px" }}>
                                <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "white", display: "inline-block", flexShrink: 0 }}/> Delhi
                            </p>
                        </div>
                    </div>
                    <p style={{ color: "white", fontSize: "22px", fontWeight: "800", margin: 0 }}>₹900</p>
                </div>

                <div style={{ marginTop: "8px", display: "flex", gap: "6px" }}>
                    <span style={{ background: "rgba(255,255,255,0.18)", color: "white", fontSize: "9px", fontWeight: "600", padding: "3px 9px", borderRadius: "20px" }}>
                        🛡️ Background verified
                    </span>
                    <span style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.85)", fontSize: "9px", fontWeight: "600", padding: "3px 9px", borderRadius: "20px" }}>
                        GPS tracked
                    </span>
                </div>
            </div>
        </div>
    )
}

export default SafetyIllustration

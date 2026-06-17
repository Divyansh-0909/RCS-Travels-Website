/* Illustration 1 — Lowest campus prices */
const PriceIllustration = () => (
    <div style={{
        position: "relative", width: "290px", height: "200px", borderRadius: "16px", overflow: "hidden",
        background: "#243AFB",
    }}>
        {/* radial depth highlight */}
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 28% 18%, rgba(255,255,255,0.16) 0%, transparent 55%)" }}/>

        {/* rating pill — top left */}
        <div className="flex justify-center items-center" style={{ position: "absolute", top: "14px", left: "14px", background: "white", borderRadius: "20px", padding: "2px 8px", display: "flex", alignItems: "center", gap: "4px" }}>
            <span style={{ color: "#fbbf24", fontSize: "15px" }}>★</span>
            <span style={{ color: "#111", fontSize: "9.5px",}}>4.9</span>
            <span style={{ color: "#888", fontSize: "8px", }}>Avg rating</span>
        </div>

        {/* overlapping rider avatars */}
        <div style={{ position: "absolute", top: "48px", left: "14px", display: "flex" }}>
            {[
                { bg: "#FF6B6B", initial: "S" },
                { bg: "#4ECDC4", initial: "A" },
                { bg: "#FFD166", initial: "R" },
                { bg: "#06D6A0", initial: "P" },
            ].map(({ bg, initial }, i) => (
                <div key={i} style={{
                    width: "28px", height: "28px", borderRadius: "50%",
                    background: bg, border: "2.5px solid #243AFB",
                    marginLeft: i === 0 ? 0 : "-8px", position: "relative", zIndex: 4 - i,
                    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                    <span style={{ color: "white", fontSize: "9px", fontWeight: "700"}}>{initial}</span>
                </div>
            ))}
        </div>

        {/* "40% Cheaper" chip — right aligned */}
        <div className="flex justify-center items-center" style={{ position: "absolute", top: "49px", right: "14px", background: "rgba(255,255,255,0.18)", borderRadius: "20px", padding: "2px 8px", border: "1px solid rgba(255,255,255,0.22)" }}>
            <span style={{ color: "white", fontSize: "10px", fontWeight: "700"}}>20% Cheaper</span>
        </div>

        {/* big savings figure */}
        <div style={{ position: "absolute", top: "86px", left: "14px" }}>
            <p style={{ color: "white", fontSize: "42px", fontWeight: "800", margin: 0, lineHeight: 1, letterSpacing: "-0.03em" }}>₹400+</p>
            <p style={{ color: "rgba(255,255,255,0.6)", fontSize: "9.5px", margin: "5px 0 0", }}>avg savings per month</p>
        </div>

        {/* bottom headline */}
        <p style={{ position: "absolute", bottom: "14px", left: "14px", right: "14px", color: "white", fontSize: "13.5px", margin: 0, lineHeight: 1.3 }}>
            Campus rides, campus prices.
        </p>
    </div>
)

export default PriceIllustration

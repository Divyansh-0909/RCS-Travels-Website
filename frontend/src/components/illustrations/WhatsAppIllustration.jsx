import chatBg from "../../assets/chat-bg.webp"
import waLogo from "../../assets/whatsapp-logo.webp"

/* Illustration 3 — Book via WhatsApp */
const WhatsAppIllustration = () => (
    <div style={{
        position: "relative", width: "290px", height: "200px", borderRadius: "16px", overflow: "hidden",
        background: "#0B141A",
    }}>
        {/* actual WhatsApp chat background */}
        <img src={chatBg} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}/>

        {/* chat bubbles */}
        <div style={{
            position: "absolute", top: "14px", left: "50%", transform: "translateX(-50%)",
            width: "258px", display: "flex", flexDirection: "column", gap: "15px",
        }}>
            {/* user message (sent — right, WhatsApp teal) */}
            <div style={{ alignSelf: "flex-end", background: "#005C4B", padding: "6px 10px", borderRadius: "10px 10px 2px 10px", maxWidth: "82%" }}>
                {[
                    "* Date of Travel - 17 August 2026",
                    "* Time - 7:00 AM",
                    "* Pickup Location - Delhi",
                    "* Drop Location - University Parking",
                    "* Contact Number - +91 XXXXX XXXXX",
                ].map((line, i) => (
                    <p key={i} style={{ color: "#E9EDF0", fontSize: "8px", margin: i === 0 ? 0 : "1px 0 0", fontFamily: "Poppins, sans-serif", whiteSpace: "nowrap", textAlign: "left" }}>{line}</p>
                ))}
            </div>

            {/* bot reply (received — left, dark card) */}
            <div style={{ alignSelf: "flex-start", background: "#1F2C34", padding: "7px 10px", borderRadius: "10px 10px 10px 2px", maxWidth: "88%" }}>
                <p style={{ color: "#E9EDF0", fontSize: "9.5px", fontWeight: "600", margin: "0 0 2px", fontFamily: "Poppins, sans-serif" }}>
                    Confirmed! Raju is arriving in <strong>4 min</strong>
                </p>
                <p style={{ color: "#8696A0", fontSize: "8.5px", margin: 0, fontFamily: "Poppins, sans-serif" }}>Swift · UP16 XX XX XXXX · ₹900</p>
            </div>
        </div>

        {/* bottom center row — "via WhatsApp" + "30 sec to book" */}
        <div style={{ position: "absolute", bottom: "14px", left: 0, right: 0, display: "flex", alignItems: "center", justifyContent: "center", gap: "15px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                <img src={waLogo} alt="WhatsApp" style={{ width: "20px", height: "20px", borderRadius: "50%" }}/>
                <span style={{ color: "#8696A0", fontSize: "11px", fontWeight: "600", fontFamily: "Poppins, sans-serif" }}>Book via WhatsApp · +91 85860 88085</span>
            </div>
            {/* <div className="flex justify-center items-center" style={{ background: "white", height: "20px", borderRadius: "20px", padding: "4px 10px" }}>
                <span style={{ color: "#243AFB", fontSize: "9.5px", fontWeight: "700", fontFamily: "Poppins, sans-serif" }}>30 sec to book</span>
            </div> */}
        </div>
    </div>
)

export default WhatsAppIllustration

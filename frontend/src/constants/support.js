// Single source of truth for support contact details — every page imports from here.
// Parts kept split so the raw number/email never appear in the bundle as one string;
// call/WhatsApp/email links are built at click time.
const PHONE_PARTS = ["91", "8586", "088", "085"];
const EMAIL_PARTS = ["rcstravels", ".", "support"];
const EMAIL_DOMAIN = ["gmail", "com"];

const supportPhone = () => PHONE_PARTS.join("");

export const supportEmail = () => `${EMAIL_PARTS.join("")}@${EMAIL_DOMAIN.join(".")}`;

// "+918586088085" — for tel: targets
export const supportTel = () => `+${supportPhone()}`;

// "+91 85860 88085" — for places that display the number as text
export const supportPhoneDisplay = () => {
    const p = supportPhone();
    return `+${p.slice(0, 2)} ${p.slice(2, 7)} ${p.slice(7)}`;
};

export const callSupport = () => { window.location.href = `tel:${supportTel()}`; };
export const emailSupport = () => { window.location.href = `mailto:${supportEmail()}`; };
export const openSupportWhatsApp = (message) => {
    const url = `https://wa.me/${supportPhone()}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
    window.open(url, "_blank", "noopener,noreferrer");
};

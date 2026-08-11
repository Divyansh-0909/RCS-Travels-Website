import { Linking } from 'react-native';

// The captain-side twin of frontend/src/constants/support.js — same number, same
// split-parts trick so the raw string never sits in the bundle whole, and the links
// are built at press time. Linking rather than window: there is no window here.
//
// Kept as a copy rather than an import. shared/ carries theme tokens only, and
// reaching across the package boundary for three strings would put a build-time
// dependency between the app and the website for the first time.
const PHONE_PARTS = ['91', '8586', '088', '085'];
const EMAIL_PARTS = ['rcstravels', '.', 'support'];
const EMAIL_DOMAIN = ['gmail', 'com'];

const supportPhone = () => PHONE_PARTS.join('');

export const supportEmail = () => `${EMAIL_PARTS.join('')}@${EMAIL_DOMAIN.join('.')}`;

/** "+918586088085" — for tel: targets */
export const supportTel = () => `+${supportPhone()}`;

/** "+91 85860 88085" — for the places that show the number as text */
export const supportPhoneDisplay = () => {
    const p = supportPhone();
    return `+${p.slice(0, 2)} ${p.slice(2, 7)} ${p.slice(7)}`;
};

export const callSupport = () => Linking.openURL(`tel:${supportTel()}`);

// WhatsApp rather than a call, and pre-filled with the ride reference: a captain
// asking about a ride is asking about a specific one, and the first thing support
// would have to ask for is the number he is already looking at.
export const openSupportWhatsApp = (message?: string) =>
    Linking.openURL(
        `https://wa.me/${supportPhone()}${message ? `?text=${encodeURIComponent(message)}` : ''}`,
    );

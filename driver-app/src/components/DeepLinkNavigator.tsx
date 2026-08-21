import { useEffect, useState } from 'react';
import { Linking } from 'react-native';
import { useNavigate } from 'react-router-native';

const BOOKING_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Convert only the two links owned by RCS Travels into an in-app ride route.
 * Unknown links are ignored instead of allowing an external URL to choose an
 * arbitrary authenticated screen.
 */
export const ridePathFromDeepLink = (url: string | null): string | null => {
    if (!url) return null;

    try {
        const parsed = new URL(url);
        const parts = parsed.pathname.split('/').filter(Boolean);
        let bookingId: string | undefined;

        if (parsed.protocol === 'rcscaptains:' && parsed.hostname === 'rides') {
            [bookingId] = parts;
        } else if (
            parsed.protocol === 'https:'
            && parsed.hostname === 'www.rcstravels.co.in'
            && parts[0] === 'captains'
            && parts[1] === 'rides'
        ) {
            bookingId = parts[2];
        }

        return bookingId && BOOKING_ID.test(bookingId) ? `/rides/${bookingId}` : null;
    } catch {
        return null;
    }
};

const DeepLinkNavigator = ({ isSignedIn }: { isSignedIn: boolean }) => {
    const [incomingUrl, setIncomingUrl] = useState<string | null>(null);
    const navigate = useNavigate();

    useEffect(() => {
        Linking.getInitialURL().then(setIncomingUrl).catch(() => {});
        const subscription = Linking.addEventListener('url', ({ url }) => setIncomingUrl(url));
        return () => subscription.remove();
    }, []);

    useEffect(() => {
        // Keep the initial URL pending in state while Clerk is signed out, so
        // the driver continues to the requested ride immediately after login.
        if (!isSignedIn) return;
        const path = ridePathFromDeepLink(incomingUrl);
        if (path) navigate(path, { replace: true });
    }, [incomingUrl, isSignedIn, navigate]);

    return null;
};

export default DeepLinkNavigator;

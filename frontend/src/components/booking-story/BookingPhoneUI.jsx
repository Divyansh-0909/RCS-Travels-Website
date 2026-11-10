import { VEHICLE_CLASSES } from '../../constants/vehicles';
import { useWebsiteCopy } from '../../hooks/useWebsiteCopy';

export const bookingSteps = [
    { title: 'Tell us where you want to go.', description: 'Enter your pickup, destination, date and time. Check the locations before you continue.', screen: 'Book a ride' },
    { title: 'Review your trip and choose your ride.', description: 'Check the timing and locations, then compare the cars and fares available for your route.', screen: 'Choose a ride' },
    { title: 'Confirm your booking.', description: 'Review your trip before booking. Scheduled rides need a 10% advance. Ride Now has no upfront payment.', screen: 'Review & confirm' },
    { title: 'Meet your driver and enjoy your ride.', description: 'Driver and car details appear after assignment. Track the pickup when available, share your OTP at pickup, and pay by cash or UPI where available.', screen: 'Your ride' },
];

function LineIcon({ type }) {
    const paths = {
        calendar: 'M5 4V1M15 4V1M2 8H18M4 3H16Q18 3 18 5V17Q18 19 16 19H4Q2 19 2 17V5Q2 3 4 3ZM6 12H9M6 15H12',
        arrow: 'M3 10H17M11 4L17 10L11 16',
        call: 'M5 2L8 6L6 9Q8 13 12 15L15 13L19 16Q18 21 14 19Q3 16 1 6Q0 3 5 2Z',
        chat: 'M4 3H16Q19 3 19 6V13Q19 16 16 16H9L4 20V16Q1 16 1 13V6Q1 3 4 3Z',
    };
    return <svg viewBox="0 0 20 22" fill="none" aria-hidden="true"><path d={paths[type]} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

const Obscured = ({ width = '72%' }) => <span className="booking-demo-obscured" style={{ width }} />;

function RouteMap({ driver = false }) {
    return <svg className={`booking-demo-map ${driver ? 'has-driver' : ''}`} viewBox="0 0 216 132" fill="none" aria-hidden="true">
        <rect width="216" height="132" rx="12" fill="#EEEDE5" />
        <path d="M0 94L62 50L110 0H156L113 47L149 87L173 132H128L106 92L60 132H20L68 87Z" fill="#D7E9C6" />
        <path d="M-8 26L223 99M-12 75L177 -5M19 137L83 -6M99 139L194 -5M-4 114L220 54" stroke="#FFFFFF" strokeWidth="5" />
        <path d="M32 104C54 103 60 71 82 69C112 67 118 38 146 39L183 25" stroke="#0078FC" strokeWidth="5" strokeLinecap="round" />
        <circle cx="32" cy="104" r="7" fill="#63C850" stroke="#FFFFFF" strokeWidth="3" />
        <circle cx="183" cy="25" r="7" fill="#FF6B5F" stroke="#FFFFFF" strokeWidth="3" />
        {driver && <g transform="translate(106 57) rotate(-35)"><rect x="-6" y="-10" width="12" height="20" rx="4" fill="#FFFFFF" stroke="#172331" /><path d="M-4 -4H4V5H-4Z" fill="#172331" /></g>}
    </svg>;
}

function TripFields({ compact = false }) {
    const tr = useWebsiteCopy();
    return <div className={`booking-demo-fields ${compact ? 'is-compact' : ''}`}>
        <div><i className="pickup-dot" /><span><small>{tr('Pickup')}</small><Obscured width="80%" /></span></div>
        <div><i className="destination-dot" /><span><small>{tr('Destination')}</small><Obscured width="94%" /></span></div>
        {!compact && <div><LineIcon type="calendar" /><span><small>{tr('When')}</small><Obscured width="86%" /></span></div>}
    </div>;
}

function Action({ children }) {
    return <div className="booking-demo-action">{children}<LineIcon type="arrow" /></div>;
}

// Read-only illustrations of real booking states. Bars stand in for addresses,
// live quotes, driver identity and OTP; no customer data or invented fare is used.
export default function BookingPhoneUI({ step = 0 }) {
    const tr = useWebsiteCopy();
    return <div className="booking-demo-ui" aria-hidden="true" data-demo-step={step + 1}>
        <header className="booking-demo-header"><h4>{tr(bookingSteps[step].screen)}</h4><span>×</span></header>
        {step === 0 && <>
            <div className="booking-demo-timing"><span>{tr('One way')}</span><span>{tr('Later')}⌄</span></div>
            <TripFields />
            <RouteMap />
            <Action>{tr('Continue')}</Action>
        </>}
        {step === 1 && <>
            <div className="booking-demo-route-caption"><Obscured width="76%" /><Obscured width="92%" /></div>
            <div className="booking-demo-vehicles">{['hatchback', 'sedan', 'suv'].map(key => <div key={key} className={key === 'sedan' ? 'is-selected' : ''}>
                <img src={VEHICLE_CLASSES[key].image} alt="" />
                <span className="booking-demo-car-copy"><b>{VEHICLE_CLASSES[key].label}</b><small>{tr('{{value0}} seats', { value0: VEHICLE_CLASSES[key].seats })}</small></span>
                <span className="booking-demo-car-price"><span className="booking-demo-selected" aria-hidden="true">{key === 'sedan' ? '✓' : '›'}</span><span>₹ <Obscured width="24px" /></span></span>
            </div>)}</div>
            <Action>{tr('Continue')}</Action>
        </>}
        {step === 2 && <>
            <div className="booking-demo-chosen"><img src={VEHICLE_CLASSES.sedan.image} alt="" /><b>{VEHICLE_CLASSES.sedan.label}</b><span>₹ <Obscured width="26px" /></span></div>
            <TripFields compact />
            <div className="booking-demo-summary"><span>{tr('When')}</span><span>{tr('Later')}</span></div>
            <div className="booking-demo-summary"><span>{tr('Trip fare')}</span><span>₹ <Obscured width="35px" /></span></div>
            <div className="booking-demo-note"><span className="booking-demo-info">i</span><span>{tr('Scheduled ride')}<b>{tr('10% advance')}</b></span></div>
            <Action>{tr('Confirm booking')}</Action>
        </>}
        {step === 3 && <>
            <RouteMap driver />
            <div className="booking-demo-driver"><div className="booking-demo-avatar" aria-hidden="true"><span /></div><span><b>{tr('Your driver')}</b><Obscured width="90%" /><Obscured width="67%" /></span></div>
            <div className="booking-demo-contact"><span><LineIcon type="call" />{tr('Call')}</span><span><LineIcon type="chat" />{tr('Chat')}</span></div>
            <div className="booking-demo-otp"><span>{tr('Share OTP at pickup')}</span><b>• • • •</b></div>
        </>}
    </div>;
}

import { useId, useMemo } from 'react';
import phoneArtwork from '../../assets/booking-story/booking-phone-hand.svg?raw';
import BookingPhoneUI from './BookingPhoneUI';

const contents = phoneArtwork.slice(phoneArtwork.indexOf('>') + 1, phoneArtwork.lastIndexOf('</svg>')).replace(/<title>[\s\S]*?<\/title>/, '');
const foregroundPattern = /<g id="(?:phone-notch|phone-foreground)"[\s\S]*?<\/g>/g;
const foreground = (contents.match(foregroundPattern) || []).join('');
const background = contents.replace(foregroundPattern, '');
// A perspective registration keeps the screen against all four traced edges.
const screenTransform = contents.match(/data-ui-transform="([^"]+)"/)[1];
const viewBox = phoneArtwork.match(/viewBox="([^"]+)"/)[1];

export default function BookingStepIllustration({ step = 0, animate = true }) {
    const id = `booking-phone-${useId().replaceAll(':', '')}`;
    const layers = useMemo(() => {
        const prefix = source => source
            .replace(/\bid="([^"]+)"/g, (_, name) => `id="${id}-${name}"`)
            .replace(/url\(#([^)]+)\)/g, (_, name) => `url(#${id}-${name})`);
        return { background: prefix(background), foreground: prefix(foreground) };
    }, [id]);
    return <svg className="booking-step-illustration" viewBox={viewBox} fill="none" aria-hidden="true" data-animate={animate} data-phone-step={step + 1}>
        <g dangerouslySetInnerHTML={{ __html: layers.background }} />
        <g clipPath={`url(#${id}-phone-screen)`}>
            {[0, 1, 2, 3].map(index => <foreignObject key={index} width="1448" height="1086" className={`booking-phone-screen ${step === index ? 'is-active' : ''}`}>
                <div style={{ width: 240, height: 468, transform: screenTransform, transformOrigin: '0 0' }}>
                    <BookingPhoneUI step={index} />
                </div>
            </foreignObject>)}
        </g>
        <g dangerouslySetInnerHTML={{ __html: layers.foreground }} />
    </svg>;
}

import { useId, useLayoutEffect, useMemo, useRef } from 'react';
import standing from '../../assets/booking-story/01-standing.svg?raw';
import side from '../../assets/booking-story/02-side.svg?raw';
import shoulder from '../../assets/booking-story/03-shoulder.svg?raw';
import phone from '../../assets/booking-story/04-phone-and-hand.svg?raw';
import { cameraPose, jointPose } from './bookingStoryRig';
import BookingPhoneUI from './BookingPhoneUI';

const contents = source => source.slice(source.indexOf('>') + 1, source.lastIndexOf('</svg>')).replace(/<title>[\s\S]*?<\/title>/, '');
const artwork = [standing, side, shoulder].map(contents);
const phoneContent = contents(phone);
const fingerContent = phoneContent.match(/<g id="holding-fingers"[\s\S]*?<\/g>/)?.[0] ?? '';

function useJointMotion(root, fixedTime, animate, strength) {
    const elapsed = useRef(0);
    const frozenStrength = fixedTime !== null || !animate ? strength : null;
    useLayoutEffect(() => {
        const svg = root.current;
        const groups = [...svg.querySelectorAll('[data-motion-view]')].map(view => ({
            index: Number(view.dataset.motionView), layers: [...view.querySelectorAll('[data-joint]')],
        }));
        const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
        let frame = 0, previous = null, visible = true;
        const pose = seconds => {
            const strength = Number(svg.dataset.motionStrength);
            for (const view of groups) for (const layer of view.layers) {
                const transform = jointPose(layer.dataset.joint, seconds, view.index, strength);
                if (transform) layer.setAttribute('transform', transform);
            }
        };
        const stop = () => { cancelAnimationFrame(frame); frame = 0; previous = null; };
        const tick = now => {
            if (previous !== null) elapsed.current += (now - previous) / 1000;
            previous = now;
            pose(elapsed.current);
            frame = requestAnimationFrame(tick);
        };
        const sync = () => {
            stop();
            pose(preference.matches ? 0 : fixedTime ?? elapsed.current);
            if (animate && fixedTime === null && !preference.matches && !document.hidden && visible) frame = requestAnimationFrame(tick);
        };
        const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); });
        observer.observe(svg);
        preference.addEventListener('change', sync);
        document.addEventListener('visibilitychange', sync);
        sync();
        return () => { stop(); observer.disconnect(); preference.removeEventListener('change', sync); document.removeEventListener('visibilitychange', sync); };
    }, [root, fixedTime, animate, frozenStrength]);
}

export default function BookingStoryArtwork({ camera = 0, step = 0, phase = 1, time = null, animate = true, framing = 'wide' }) {
    const root = useRef(null);
    const id = useId().replaceAll(':', '');
    const layers = useMemo(() => artwork.map((markup, index) => markup.replace(/\bid="([^"]+)"/g, (_, part) => `id="booking-${id}-${index}-${part}"`)), [id]);
    const pose = cameraPose(camera);
    const settled = Math.min(1, Math.max(0, (camera - .86) / .14));
    useJointMotion(root, time, animate && settled < 1, 1 - settled);
    const tap = step === 2 ? Math.sin(Math.PI * Math.min(1, Math.max(0, (phase - .3) / .5))) : 0;
    const viewBox = framing === 'phone' ? '685 35 440 850' : framing === 'character' ? '240 35 600 850' : '0 0 1100 900';
    return <svg ref={root} className="booking-story-vector" viewBox={viewBox} fill="none" aria-hidden="true" data-motion-strength={1 - settled}>
        {layers.map((markup, index) => <g key={index} opacity={pose.weights[index]} transform={pose.transforms[index]} data-motion-view={index} className={`booking-view booking-view-${index}`}>
            <g dangerouslySetInnerHTML={{ __html: markup }} />
        </g>)}
        <g opacity={pose.phoneOpacity} transform={pose.phone} data-motion-view="2" className="booking-pov-phone" style={{ '--phone-settled': settled }}>
          <g data-joint="phone-grip">
            <g stroke="#172331" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: phoneContent.replace(/\bid="([^"]+)"/g, (_, part) => `id="booking-${id}-pov-${part}"`) }} />
            <foreignObject width="217" height="477" transform="matrix(1 .071 -.065 1 100 48)">
                <BookingPhoneUI step={step} phase={phase} />
            </foreignObject>
            <path fill="#0F1A29" d="M174 53L244 58L242 70C241 77 236 79 230 78L183 75C176 74 172 71 173 65Z" />
            <g stroke="#172331" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: fingerContent.replace(/\bid="([^"]+)"/g, (_, part) => `id="booking-${id}-front-${part}"`) }} />
            <g opacity={tap} transform={`translate(${(1 - tap) * 180} ${(1 - tap) * 210})`} stroke="#172331" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                <path fill="#FC9568" d="M420 700L343 586L284 491C278 480 263 482 261 492C259 502 266 516 274 531L300 578C280 563 264 569 265 582C249 575 234 585 241 599C224 594 215 606 223 622L265 700Z" />
                <path fill="#FDF8EC" d="M254 665C293 642 328 651 353 682L364 700L256 700Z" />
            </g>
          </g>
        </g>
    </svg>;
}

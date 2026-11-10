import { useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import gsap from 'gsap';
import { ScrollSmoother } from 'gsap/ScrollSmoother';
import { useWebsiteCopy } from '../../hooks/useWebsiteCopy';
import BookingStepIllustration from './BookingStepIllustration';
import { bookingSteps } from './BookingPhoneUI';
import './BookingStory.css';

gsap.registerPlugin(ScrollSmoother);
const pinnedQuery = '(min-width: 900px) and (min-height: 650px) and (prefers-reduced-motion: no-preference)';

export default function BookingStory({ fixedProgress = null, animate = true }) {
    const tr = useWebsiteCopy();
    const body = useRef(null);
    const illustration = useRef(null);
    const items = useRef([]);
    const [active, setActive] = useState(0);
    const step = fixedProgress === null ? active : Math.min(3, Math.max(0, Math.floor(fixedProgress * 4)));

    useLayoutEffect(() => {
        if (fixedProgress !== null) return;
        const ratios = bookingSteps.map(() => 0);
        const observer = new IntersectionObserver(entries => {
            for (const entry of entries) ratios[Number(entry.target.dataset.bookingStep)] = entry.isIntersecting ? entry.intersectionRatio : 0;
            const best = ratios.indexOf(Math.max(...ratios));
            if (ratios[best] > 0) setActive(best);
        }, { rootMargin: '-20% 0px -50% 0px', threshold: [0, .25, .5, .75, 1] });
        items.current.forEach(item => observer.observe(item));
        const media = gsap.matchMedia();
        media.add(pinnedQuery, () => {
            const container = body.current;
            const visual = illustration.current;
            const section = container.closest('.booking-story');
            let disposed = false, previous = -1, previousScroll = NaN;
            // Follow the rendered container, including ScrollSmoother's offset.
            // Only the illustration moves: no pin spacer, scroll-position write,
            // or global refresh is needed when it enters or leaves the section.
            const position = () => {
                if (disposed) return;
                const bounds = container.getBoundingClientRect();
                // Let the lower silhouette run into the section boundary so the
                // following panel covers it while its rounded corners reveal the art.
                const limit = Math.max(0, section.getBoundingClientRect().bottom - bounds.top - visual.offsetHeight * .8);
                const offset = Math.max(0, Math.min(112 - bounds.top, limit));
                if (Math.abs(offset - previous) > .01) {
                    visual.style.setProperty('--booking-visual-offset', `${offset.toFixed(3)}px`);
                    previous = offset;
                }
            };
            const tick = () => {
                const scroll = ScrollSmoother.get()?.scrollTop() ?? window.scrollY;
                if (Math.abs(scroll - previousScroll) < .01) return;
                previousScroll = scroll;
                position();
            };
            const resize = new ResizeObserver(position);
            gsap.ticker.add(tick);
            resize.observe(container);
            resize.observe(visual);
            document.fonts.ready.then(position);
            position();
            return () => {
                disposed = true;
                resize.disconnect();
                gsap.ticker.remove(tick);
                visual.style.removeProperty('--booking-visual-offset');
            };
        });
        return () => { observer.disconnect(); media.revert(); };
    }, [fixedProgress]);

    return <section className="booking-story booking-story-method" aria-labelledby="booking-story-heading" data-step={step + 1}>
        <div className="booking-story-container">
            <header className="booking-story-header">
                <h2 id="booking-story-heading">{tr('Book a ride in four simple steps')}</h2>
                <p className="booking-story-intro">{tr('Tell us where you’re headed. Compare the rides for your route, then book and follow your pickup.')}</p>
            </header>
            <div className="booking-story-layout" ref={body}>
                <aside className="booking-story-art-column" aria-label={tr('Booking steps')}>
                    <div className="booking-story-visual" ref={illustration}>
                        <BookingStepIllustration step={step} animate={animate} />
                    </div>
                </aside>
                <ol className="booking-story-steps">{bookingSteps.map((item, index) => <li key={item.title} ref={node => { items.current[index] = node; }} data-booking-step={index} aria-current={step === index ? 'step' : undefined} className={step === index ? 'is-active' : ''}>
                    <span className="booking-story-marker" aria-hidden="true">{index + 1}</span>
                    <div className="booking-story-copy">
                        <h3>{tr(item.title)}</h3>
                        <p className="booking-story-description">{tr(item.description)}</p>
                        {index === 3 && <Link className="booking-story-book bg-primary text-on-primary rounded-xl px-6 py-3 font-semibold focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary" to="/book">{tr('Book a ride')} <span aria-hidden="true">↗</span></Link>}
                    </div>
                    <div className="booking-story-inline-art"><BookingStepIllustration step={index} animate={false} /></div>
                </li>)}</ol>
            </div>
        </div>
    </section>;
}

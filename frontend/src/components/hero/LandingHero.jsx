import { useLayoutEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Icon from '@mdi/react';
import { mdiMapMarkerOutline, mdiClockTimeFourOutline } from '@mdi/js';
import NavBar from '../ui/NavBar';
import { useData } from '../../hooks/useData';
import { useViewNavigate } from '../../hooks/useViewNavigate';
import AnimatedRCSCharacter, { heroAsset } from './AnimatedRCSCharacter';
import './LandingHero.css';

gsap.registerPlugin(ScrollTrigger);
const clouds = [
  ['top-left-cloud', 8, 8, 8],
  ['top-right-cloud', 70, 4, 11.6],
  ['top-right-middle-cloud', 58, 20, 11.4],
  ['top-right-over-building-cloud', 72, 36, 6.8],
];
export default function LandingHero() {
  const section = useRef(null);
  const { t } = useTranslation('website');
  const navigate = useViewNavigate();
  const startBooking = (timing) => {
    const state = useData.getState();
    state.setPickup(''); state.setPickupCoords(null);
    state.setDrop(''); state.setDropCoords(null);
    state.setTiming(timing); state.setScheduledTime(null);
    navigate('/book', { state: { stage: 'route', highlightRideNow: timing === 'Now' } });
  };
  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const ctx = gsap.context(() => {
        gsap.utils.toArray('.hero-cloud').forEach((cloud, index) => gsap.to(cloud, {
          x: () => -section.current.clientWidth * (.025 + index * .008), ease: 'none',
          scrollTrigger: { trigger: section.current, start: 'top top', end: 'bottom top', scrub: 1, invalidateOnRefresh: true },
        }));
      }, section);
      return () => ctx.revert();
    });
    return () => media.revert();
  }, []);
  return <section ref={section} className="landing-hero" data-bar-tone="primary" aria-labelledby="hero-heading">
    <NavBar hero hideDestinationInput />
    <div className="hero-copy">
      <h1 id="hero-heading">A ride for wherever<br />you’re headed</h1>
      <div className="hero-destination">
        <button type="button" onClick={() => startBooking('Schedule')} className="hero-destination-label">
          <Icon path={mdiMapMarkerOutline} size={1.1} aria-hidden="true" />
          <span>{t('nav.destination')}</span>
        </button>
        <button type="button" onClick={() => startBooking('Now')} className="hero-now">
          <Icon path={mdiClockTimeFourOutline} size={.8} aria-hidden="true" />{t('nav.now')}
        </button>
      </div>
    </div>
    <div className="hero-scene" aria-hidden="true">
      <div className="hero-scenery"><img src={heroAsset('background')} alt="" fetchPriority="high" /></div>
      {clouds.map(([name, left, top, width]) => <img key={name} className="hero-cloud" src={heroAsset(name)} alt="" style={{ left: `${left}%`, top: `${top}%`, width: `${width}%` }} />)}
      <AnimatedRCSCharacter />
    </div>
  </section>;
}

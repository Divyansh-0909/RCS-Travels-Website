import { useId, useLayoutEffect, useRef } from 'react';
import gsap from 'gsap';
import { characterParts, leftHandReferenceClips, characterClips } from './characterPose';
import characterReference from '../../assets/hero-section-illustration/character-full-reference.webp';

const assets = import.meta.glob(['../../assets/hero-section-illustration/*.webp', '!../../assets/hero-section-illustration/*reference.webp'], { eager: true, query: '?url', import: 'default' });
export const heroAsset = (name) => name === 'character-full-reference'
  ? characterReference
  : assets[`../../assets/hero-section-illustration/${name}.webp`];
const joints = {
  hair: [332, 124], head: [356, 164], backpack: [249, 211],
  'left-arm': [281, 182], 'left-forearm': [192, 367], 'left-hand': [165, 414],
  'right-arm': [403, 203], 'right-forearm': [454, 382], 'right-hand': [471, 401],
  'left-leg': [311, 348], 'right-leg': [359, 366],
  'right-shoe': [596, 611], 'left-shoe': [408, 588],
};

export default function AnimatedRCSCharacter({ debug = false }) {
  const rig = useRef(null);
  const id = useId().replaceAll(':', '');
  const clip = name => `${id}-${name}`;
  const showDebug = import.meta.env.DEV && debug;
  useLayoutEffect(() => {
    const media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const loops = [];
      const ctx = gsap.context(() => {
        const sway = (part, from, to, duration, delay = 0) => {
          const target = rig.current.querySelector(`[data-joint="${part}"]`);
          loops.push(gsap.fromTo(target,
            { svgOrigin: joints[part].join(' '), ...from },
            { ...to, duration, delay, repeat: -1, yoyo: true, ease: 'sine.inOut' }));
        };
        sway('hair', { rotation: -1.5, x: -1 }, { rotation: 2, x: 2 }, 3.8);
        sway('head', { rotation: -1 }, { rotation: 1.5 }, 4.3, .2);
        sway('backpack', { rotation: -1, y: 0 }, { rotation: 1.5, y: 2 }, 3.3, .4);
        sway('left-arm', { rotation: -1.2 }, { rotation: 1.4 }, 3.2);
        sway('left-forearm', { rotation: 1 }, { rotation: -2 }, 2.7, .25);
        sway('left-hand', { rotation: -2 }, { rotation: 2 }, 2.4, .4);
        sway('right-arm', { rotation: -.5 }, { rotation: .7 }, 3.9, .15);
        sway('right-forearm', { rotation: -.8 }, { rotation: 1.2 }, 3.6, .3);
        sway('right-hand', { rotation: -1.5 }, { rotation: 1.5 }, 3.1, .6);
        sway('left-leg', { rotation: -.25 }, { rotation: .35 }, 4.6, .3);
        sway('right-leg', { rotation: -.6 }, { rotation: .7 }, 3.7, .1);
        sway('right-shoe', { rotation: -1, y: 0 }, { rotation: 3, y: 2 }, 2.7, .2);
        sway('left-shoe', { rotation: -.3 }, { rotation: .5 }, 4.8, .5);
      }, rig);
      // Idle motion is time-driven. ScrollSmoother may transform the hero;
      // its intersection state must not control these independent loops.
      const syncVisibility = () => loops.forEach(loop => loop.paused(document.hidden));
      syncVisibility();
      document.addEventListener('visibilitychange', syncVisibility);
      return () => {
        document.removeEventListener('visibilitychange', syncVisibility);
        ctx.revert();
      };
    });
    return () => media.revert();
  }, []);
  const part = (name, mask) => {
    const { width, height, matrix, asset = name } = characterParts[name];
    return <g transform={`matrix(${matrix.join(' ')})`} data-part={name}>
      <image href={heroAsset(asset)} width={width} height={height} clipPath={mask ? `url(#${clip(mask)})` : undefined} />
      {showDebug && <><rect width={width} height={height} fill="none" stroke="magenta" /><text fontSize="12" fill="red">{name}</text></>}
    </g>;
  };
  return <svg ref={rig} className="rcs-character" viewBox="0 0 755 731" aria-hidden="true">
    <defs>
      {Object.entries({ ...leftHandReferenceClips, ...characterClips }).map(([name, path]) =>
        <clipPath key={name} id={clip(name)}><path d={path} clipRule="evenodd" fillRule="evenodd" /></clipPath>
      )}
    </defs>
    {part('hair', 'reference-hair-underlap')}
    <g data-joint="hair">{part('hair', 'reference-hair')}</g>
    <g clipPath={`url(#${clip('reference-backpack-hair-underlap')})`}>
      <svg x="98" y="184" width="172" height="200" viewBox="60 215 10 10" preserveAspectRatio="none">
        <image href={characterReference} width="755" height="731" />
      </svg>
    </g>
    <g data-joint="backpack">{part('bagpack', 'reference-backpack')}</g>
    <g data-joint="right-leg">
      {/* Extend the original trouser pixels beneath the resized hand. The
          reference's former hand outline must not leave a sky-colored gap. */}
      <g clipPath={`url(#${clip('reference-arm-pants-underlap')})`}>
        <svg x="433" y="388" width="116" height="78" viewBox="415 440 10 10" preserveAspectRatio="none">
          <image href={characterReference} width="755" height="731" />
        </svg>
      </g>
      <g transform="translate(-4 0)">{part('right-leg', 'reference-right-leg-underlap')}</g>
      {part('right-leg', 'reference-right-leg')}
      {part('right-ankle-underlap', 'reference-right-ankle')}
      <g data-joint="right-shoe">{part('right-shoe', 'reference-right-shoe')}</g>
      {part('right-leg', 'reference-right-cuff-front')}
    </g>
    {part('torso', 'reference-body')}
    <g data-joint="left-leg">
      {part('left-leg', 'reference-left-leg')}
      {part('left-ankle-underlap', 'reference-left-ankle')}
      <g data-joint="left-shoe">{part('left-shoe', 'left-shoe-art')}</g>
      {/* The front cuff belongs above the ankle, so the smaller shoe sits
          inside the opening instead of painting across its front edge. */}
      {part('left-leg', 'reference-left-cuff-front')}
    </g>
    <g data-joint="left-arm">
      {part('left-upper-arm')}
      <g data-joint="left-forearm">
        {part('right-forearm', 'left-skin')}
        <g data-joint="left-hand">{part('right-hand', 'left-hand-shape')}</g>
      </g>
    </g>
    <g data-joint="right-arm">
      <g data-joint="right-forearm">
        {part('right-full-hand', 'right-full-forearm')}
        <g data-joint="right-hand">{part('right-full-hand', 'right-full-palm')}</g>
      </g>
      {part('right-sleeve', 'right-full-sleeve')}
    </g>
    {part('bag-strap-underlap', 'reference-strap-underlap')}
    <g clipPath={`url(#${clip('reference-strap-underlap')})`}>{part('bag-strap', 'bag-strap-art')}</g>
    <g data-joint="head">{part('head', 'reference-head')}</g>
    {showDebug && Object.entries(joints).map(([name,[x,y]]) => <g key={name}><circle cx={x} cy={y} r="5" fill="red" /><text x={x + 8} y={y} fontSize="12" fill="red">{name}</text></g>)}
  </svg>;
}

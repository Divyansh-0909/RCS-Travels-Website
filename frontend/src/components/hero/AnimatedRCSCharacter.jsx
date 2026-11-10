import { useId, useLayoutEffect, useMemo, useRef } from 'react';
import vectorArtwork from '../../assets/hero-section-illustration/character-vector.svg?raw';
import background from '../../assets/hero-section-illustration/background.webp';
import { bones, vectorPose } from './characterRig';

const scenery = import.meta.glob('../../assets/hero-section-illustration/top-*-cloud.webp', { eager: true, query: '?url', import: 'default' });
export const heroAsset = name => name === 'background' ? background : scenery[`../../assets/hero-section-illustration/${name}.webp`];
// This is repository-owned vector artwork, not user-supplied markup. Keep the
// editable SVG file itself as the source so it also opens in vector editors.
const vectorContent = vectorArtwork.slice(vectorArtwork.indexOf('>') + 1, vectorArtwork.lastIndexOf('</svg>'));

export default function AnimatedRCSCharacter({ debug = false, time = null }) {
  const root = useRef(null);
  const id = `character-${useId().replaceAll(':', '')}`;
  const markup = useMemo(() => vectorContent.replace(/\bid="([^"]+)"/g, (_, part) => `id="${id}-${part}"`), [id]);

  useLayoutEffect(() => {
    const svg = root.current;
    const layers = [...svg.querySelectorAll('[data-joint]')];
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let request = 0, elapsed = 0, previous = null;
    const pose = seconds => {
      const transforms = vectorPose(seconds);
      for (const layer of layers) {
        const matrix = transforms[layer.dataset.joint];
        layer.setAttribute('transform', `matrix(${matrix.map(n => +n.toFixed(6)).join(' ')})`);
      }
    };
    const stop = () => {
      cancelAnimationFrame(request);
      request = 0;
      previous = null;
    };
    const tick = now => {
      if (previous !== null) elapsed += (now - previous) / 1000;
      previous = now;
      pose(elapsed);
      request = requestAnimationFrame(tick);
    };
    const sync = () => {
      stop();
      pose(reducedMotion.matches ? 0 : (time ?? elapsed));
      if (time === null && !reducedMotion.matches && !document.hidden) request = requestAnimationFrame(tick);
    };
    reducedMotion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      stop();
      reducedMotion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [markup, time]);

  return <svg ref={root} className="rcs-character" viewBox="0 0 755 731" fill="none" aria-hidden="true" data-character-renderer="layered-vector">
    <g dangerouslySetInnerHTML={{ __html: markup }} />
    {import.meta.env.DEV && debug && bones.map(bone => <g key={bone.name} data-joint={bone.name}>
      <circle cx={bone.pivot[0]} cy={bone.pivot[1]} r="3" fill="magenta" />
    </g>)}
  </svg>;
}

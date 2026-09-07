import { useEffect, useRef } from "react";
import "./BorderGlow.css";

/**
 * A one-time edge glow adapted from React Bits' BorderGlow.
 *
 * This version is deliberately surface-agnostic: it wraps an existing control
 * without repainting its background or border. The default colours stay tied
 * to the site's semantic theme roles instead of introducing a second palette.
 */
const BorderGlow = ({
  children,
  className = "",
  edgeSensitivity = 30,
  borderRadius = 28,
  glowRadius = 24,
  glowIntensity = 1,
  coneSpread = 25,
  animated = false,
  glowColor = "var(--background)",
  darkGlowColor = "var(--foreground)",
}) => {
  const glowRef = useRef(null);

  useEffect(() => {
    const glow = glowRef.current;
    if (!animated || !glow) return undefined;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) return undefined;

    // Let the page settle before beginning a deliberately visible full sweep.
    // The earlier 1.8s pass started during first paint and was easy to miss.
    const delay = 450;
    const duration = 3200;
    const angleStart = 110;
    const angleDistance = 355;
    let animationFrame;
    let delayTimer;
    let startTime;

    glow.classList.add("border-glow--sweeping");

    const tick = (now) => {
      startTime ??= now;
      const progress = Math.min((now - startTime) / duration, 1);
      const fadeIn = Math.min(progress / 0.12, 1);
      const fadeOut = Math.min((1 - progress) / 0.18, 1);

      glow.style.setProperty("--border-glow-edge", `${Math.max(0, Math.min(fadeIn, fadeOut)) * 100}`);
      glow.style.setProperty("--border-glow-angle", `${angleStart + angleDistance * progress}deg`);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(tick);
      } else {
        glow.classList.remove("border-glow--sweeping");
        glow.style.setProperty("--border-glow-edge", "0");
      }
    };

    delayTimer = window.setTimeout(() => {
      animationFrame = requestAnimationFrame(tick);
    }, delay);

    return () => {
      window.clearTimeout(delayTimer);
      cancelAnimationFrame(animationFrame);
      glow.classList.remove("border-glow--sweeping");
      glow.style.setProperty("--border-glow-edge", "0");
    };
  }, [animated]);

  const radius = typeof borderRadius === "number" ? `${borderRadius}px` : borderRadius;

  return (
    <div
      ref={glowRef}
      className={`border-glow ${className}`}
      style={{
        "--border-glow-edge-sensitivity": edgeSensitivity,
        "--border-glow-radius": radius,
        "--border-glow-padding": `${glowRadius}px`,
        "--border-glow-intensity": glowIntensity,
        "--border-glow-cone-spread": coneSpread,
        "--border-glow-color-light": glowColor,
        "--border-glow-color-dark": darkGlowColor,
      }}
    >
      <span className="border-glow__light" aria-hidden="true" />
      <div className="border-glow__inner">{children}</div>
    </div>
  );
};

export default BorderGlow;

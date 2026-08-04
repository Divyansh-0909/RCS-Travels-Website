import { Suspense, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import OnBoarding from './pages/OnBoarding';
import LoadingScreen from "./components/LoadingScreen";
import NavBar from "./components/ui/NavBar";
import HowItWorks from "./pages/HowItWorks";
import WhyUs from "./pages/WhyUs";
import Services from "./pages/Services";
import AboutUs from "./pages/AboutUs";
import Footer from "./components/Footer";
import FinalCTA from "./components/FinalCTA";
import { useSmoothScroll, useSectionTone, scrollToSection } from "./hooks/useSmoothScroll";

function App() {
  const location = useLocation();
  useSmoothScroll();
  // The bar is fixed over bands that alternate dark and light on the way down,
  // so it inverts against whichever one it is currently over. The rail is what
  // gets measured — the tone flips on the bar's centre line, not the viewport's.
  const railRef = useRef(null);
  const sectionTone = useSectionTone(railRef);

  // useSmoothScroll's layout effect runs before this one on the same commit, so
  // the smoother is already live when we land here from another route with a
  // section to jump to.
  useEffect(() => {
    const id = location.state?.scrollTo;
    if (!id) return;
    scrollToSection(id);
    window.history.replaceState({}, "");
  }, [location.state]);

  return (
    <Suspense fallback={<LoadingScreen />}>
      <div>
        {/* Outside #smooth-content on purpose. ScrollSmoother transforms the
            content, and a transformed ancestor re-anchors position:fixed to
            itself — the navbar would scroll away with the page.

            Full-width rail rather than left-1/2 + -translate-x-1/2: with `left`
            set and `right` auto, a fixed box shrink-to-fits against what's left
            of the viewport, and the bar's own max-sm:w-[min(86vw,100%)] then
            resolves its 100% against THAT — a percentage of a width that was
            itself derived from the content, which collapses the bar to about
            the width of its logo. inset-x-0 gives it a real 100vw to be a
            percentage of, and justify-center does the centring the transform
            used to.

            pointer-events: the rail spans the viewport now, so it must not eat
            clicks either side of the bar. The drawer portals to body, so it is
            unaffected. */}
        <div ref={railRef} className="fixed inset-x-0 z-100 flex justify-center top-6 sm:top-10 pointer-events-none">
          {/* Dark bar over everything except the dark bands: --primary-dark is
              dark enough that a white bar glares against it, and the bar's
              --background-primary reads as its own layer over the blue. */}
          <NavBar invert={sectionTone !== "dark"} className="pointer-events-auto"/>
        </div>
        <div id="smooth-wrapper">
          {/* data-bar-tone is the tone of the section itself, not of the bar
              over it — the bar takes the opposite. "primary" is the third
              value: a --primary-dark band, which takes the same dark bar a
              light band does. Declared here rather than inside each page
              because it is a property of this arrangement: the same components
              appear on other routes against other backgrounds. */}
          <div id="smooth-content">
            <div data-bar-tone="dark"><OnBoarding/></div>
            <div id="how-it-works" data-bar-tone="light"><HowItWorks/></div>
            <div id="services" data-bar-tone="light"><Services/></div>
            <div id="about" data-bar-tone="primary"><AboutUs/></div>
            <div id="why-us" data-bar-tone="light"><WhyUs/></div>
            <div data-bar-tone="light"><FinalCTA/></div>
            <div data-bar-tone="dark"><Footer/></div>
          </div>
        </div>
      </div>
    </Suspense>
  );
};

export default App

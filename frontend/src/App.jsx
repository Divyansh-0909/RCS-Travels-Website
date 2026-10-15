import { Suspense, useEffect } from "react";
import { useLocation } from "react-router-dom";
import LoadingScreen from "./components/LoadingScreen";
import LandingHero from "./components/hero/LandingHero";
import { lazy } from "react";
import { useSmoothScroll, scrollToSection } from "./hooks/useSmoothScroll";

// Marketing sections are below the booking entry point. Keep their code out of
// the initial customer bundle and fetch them when React needs to render them.
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const WhyUs = lazy(() => import("./pages/WhyUs"));
const Services = lazy(() => import("./pages/Services"));
const AboutUs = lazy(() => import("./pages/AboutUs"));
const Footer = lazy(() => import("./components/Footer"));
const FinalCTA = lazy(() => import("./components/FinalCTA"));

function App() {
  const location = useLocation();
  useSmoothScroll();
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
        <div id="smooth-wrapper">
          <div id="smooth-content" className="flex flex-col gap-18 bg-[var(--foreground)]">
            {/* <div id="services" data-bar-tone="light" className="pt-[136px] sm:pt-[150px]"><Services/></div> */}
            <LandingHero />
            <div id="how-it-works" data-bar-tone="light" ><HowItWorks/></div>
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

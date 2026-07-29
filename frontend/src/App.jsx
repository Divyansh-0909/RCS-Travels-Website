import { Suspense, useEffect } from "react";
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
import { useSmoothScroll, scrollToSection } from "./hooks/useSmoothScroll";

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
        <div className="fixed inset-x-0 z-100 flex justify-center top-6 sm:top-10 pointer-events-none">
          <NavBar className="pointer-events-auto"/>
        </div>
        <div id="smooth-wrapper">
          <div id="smooth-content">
            <OnBoarding/>
            <div id="how-it-works"><HowItWorks/></div>
            <div id="services"><Services/></div>
            <div id="about"><AboutUs/></div>
            <div id="why-us"><WhyUs/></div>
            <FinalCTA/>
            <Footer/>
          </div>
        </div>
      </div>
    </Suspense>
  );
};

export default App

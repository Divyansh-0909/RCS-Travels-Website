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
            itself — the navbar would scroll away with the page. */}
        <div className="fixed z-100 flex flex-col justify-center items-center left-1/2 -translate-x-1/2 top-6 sm:top-10">
          <NavBar/>
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

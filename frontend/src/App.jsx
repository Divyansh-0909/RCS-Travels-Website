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

function App() {
  const location = useLocation();
  useEffect(() => {
    const id = location.state?.scrollTo;
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    window.history.replaceState({}, "");
  }, [location.state]);

  return (
    <Suspense fallback={<LoadingScreen />}>
      <div>
        <div className="fixed z-100 flex flex-col justify-center items-center left-1/2 -translate-x-1/2 top-6 sm:top-10">
          <NavBar/>
        </div> 
        <OnBoarding/>
        <div id="how-it-works"><HowItWorks/></div>
        <div id="services"><Services/></div>
        <div id="about"><AboutUs/></div>
        <div id="why-us"><WhyUs/></div>
        <Footer/>
      </div>
    </Suspense>
  );
};

export default App

import { Suspense } from "react";
import OnBoarding from './pages/OnBoarding';
import LoadingScreen from "./components/LoadingScreen";
import NavBar from "./components/ui/NavBar";
import HowItWorks from "./pages/HowItWorks";
import WhyUs from "./pages/WhyUs";
import Services from "./pages/Services";

function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <div>
        <div className="fixed z-100 left-1/2 -translate-x-1/2 top-6 sm:top-10">
          <NavBar/>
        </div> 
        <OnBoarding/>
        <HowItWorks/>
        <Services/>
        <WhyUs/>
      </div>
    </Suspense>
  );
};

export default App

import { Suspense } from "react";
import OnBoarding from './pages/OnBoarding';
import LoadingScreen from "./components/LoadingScreen";
import NavBar from "./components/ui/NavBar";

function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <div>
        <div className="fixed z-100 left-1/2 -translate-x-1/2 top-6">
          <NavBar/>
        </div> 
        <OnBoarding/>
      </div>
    </Suspense>
  );
};

export default App

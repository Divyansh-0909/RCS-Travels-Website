import { Suspense } from "react";
import OnBoarding from './pages/OnBoarding';
import LoadingScreen from "./components/LoadingScreen";

function App() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <OnBoarding/>
    </Suspense>
  );
};

export default App

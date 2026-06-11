import { useEffect, useRef, useState } from "react";
import "./styles/App.css";
import {UnsupportedScreen} from "./components/UnsupportedScreen";
import CONFIG from "./utils/config";
// import {useUrbanRisk} from './hooks/useUrbanRisk';
// import {useInterceptors} from './hooks/useInterceptors';

const {Datasets} = CONFIG;

function App() {
  const [xrSupport, setXrSupport] = useState("checking");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("forceList")) {
      setXrSupport(true);
      return;
    }
    if (!navigator.xr?.isSessionSupported) {
      setXrSupport(false);
      return;
    }
    navigator.xr
      .isSessionSupported("immersive-ar")
      .then((ok) => setXrSupport(ok))
      .catch(() => setXrSupport(false));
  }, []);

  console.log("XR support:", xrSupport);

  useEffect(() => {


sd


    Datasets.forEach(({id, url})=>{

    })
  }, []);




  if (xrSupport === "checking") {
    return (
      <div className="app-shell centered">
        <span className="status-spinner" />
      </div>
    );
  }
  if (xrSupport === false) {
    return <UnsupportedScreen />;
  }
  return (
    <div className="app-shell">
      <h1>Invisible Safety AR</h1>
    </div>
  );
}

export default App;

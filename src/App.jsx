import { useEffect, useState } from "react";
import "./styles/App.css";
import { UnsupportedScreen } from "./components/UnsupportedScreen";
import CONFIG from "./utils/config";
import { useUrbanRisk } from "./hooks/useUrbanRisk";
import { useInterceptors } from "./hooks/useInterceptors";
import { useArHotspots } from "./hooks/useArHotspots";
import { HotspotList } from "./components/HotspotList";
import {hasValidPoint} from "./utils/dataUtils";
import {ARPreview} from './ar/ARPreview';

const RISK_WEIGHTS = { crime: 25, crash: 25, complaint: 25, infra: 25 };
const { DATASETS } = CONFIG;

function App() {
  
  const [xrSupport, setXrSupport] = useState("checking");
  const [datasets, setDatasets] = useState({});
  const [dataStatus, setDataStatus] = useState({});
  const [anchor, setAnchor] = useState(null);
  
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


  useEffect(() => {
    const controller = new AbortController();

    async function loadDatasets() {
      setDataStatus(
        Object.fromEntries(DATASETS.map(({ key }) => [key, "loading"])),
      );

      const results = await Promise.allSettled(
        DATASETS.map(async ({ key, url }) => {
          const response = await fetch(url, {
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(`Failed to load ${key}`);
          }

          const geo = await response.json();

          const features = Array.isArray(geo.features)
            ? geo.features.filter(hasValidPoint)
            : [];

          return { key, features };
        }),
      );

      const nextDatasets = {};
      const nextStatus = {};

      results.forEach((result, index) => {
        const key = DATASETS[index].key;

        if (result.status === "fulfilled") {
          nextDatasets[key] = result.value.features;
          nextStatus[key] = "loaded";
        } else {
          nextDatasets[key] = [];
          nextStatus[key] = "error";
        }
      });

      setDatasets(nextDatasets);
      setDataStatus(nextStatus);
    }

    loadDatasets();

    return () => {
      controller.abort();
    };
  }, []);

  const enabled = xrSupport === true;

  const { featureCollection: riskGeoJson } = useUrbanRisk({
    crime: datasets.crime,
    collisions: datasets.collisions,
    complaints: datasets.complaints,
    csoFeatures: datasets.cso,
    weights: RISK_WEIGHTS,
    enabled,
  });
  const { interceptorFeatures } = useInterceptors({ enabled });
  const { hotspots, ready } = useArHotspots({
    csoFeatures: datasets.cso,
    complaints: datasets.complaints,
    riskGeoJson,
  });


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
      <HotspotList
        hotspots={hotspots}
        loading={!ready}
        error={Object.values(dataStatus).includes("error")}
        onSelect={(h) =>
          setAnchor({ object: h.feature, hotspot: h, layerId: "cso-locations" })
        }
      />
      <ARPreview
        open={!!anchor}
        onClose={() => setAnchor(null)}
        selectedFeature={anchor}
        riskGeoJson={riskGeoJson}
        interceptorFeatures={interceptorFeatures}
        complaints={datasets.complaints}
        csoFeatures={datasets.cso}
      />
      <h1>Invisible Safety AR</h1>
    </div>
  );
}

export default App;

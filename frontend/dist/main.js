/* global Vue _ mapboxgl MapboxDraw turf */

import hex from "./hex.js";
import { infra, pars, attrs } from "./config.js";
import model from "./model.js";

const toObj = (arr) => arr.reduce((acc, el) => ((acc[el.col] = el), acc), {});

const toObjSingle = (arr, key) =>
  arr.reduce((acc, el) => ((acc[el.col] = el[key]), acc), {});

const toObjArr = (arr) =>
  arr.reduce((acc, el) => ((acc[el.col] = []), acc), {});

const fmt = (val) => val && Math.round(val).toLocaleString("en");

const zip = (a, b) => a.map((k, i) => [k, b[i]]);

const zipflat = (a, b) =>
  zip(a, b)
    .reduce((k, i) => k.concat(i))
    .concat(b.slice(-1));

const Slider = {
  props: ["obj"],
  template: `
  <div>
    <label>
      <div>
        {{ obj.label }}:
        {{ obj.val.toLocaleString("en") }}
        {{ obj.unit }}
      </div>
      <input type="range"
             :min="obj.min"
             :max="obj.max"
             :step="(obj.max - obj.min)/100"
             v-model="obj.val"
      >
    </label>
  </div>
  `,
};

const app = Vue.createApp({
  components: {
    Slider,
  },
  data() {
    return {
      pars: pars,
      idLabels: false,
      attrs: toObj(attrs),
      colorBy: "road_dist",
      infra: infra,
      drawing: null,
    };
  },
  computed: {
    idLabelsText: function () {
      if (this.idLabels) {
        return "visible";
      } else {
        return "none";
      }
    },
    drawText: function (col) {
      return this.drawing == col ? "Stop drawing" : "Draw";
    },
    parVals: function () {
      return toObjSingle(this.pars, "val");
    },
    colorByObj: function () {
      return this.attrs[this.colorBy];
    },
  },
  watch: {
    idLabelsText: function () {
      map.setLayoutProperty("hex_label", "visibility", this.idLabelsText);
    },
    parVals: function () {
      this.debouncedUpdate();
    },
    colorBy: function () {
      updatePaint(this.colorByObj);
    },
  },
  created: function () {
    this.debouncedUpdate = _.debounce(this.update, 500);
  },
  methods: {
    draw: function (col) {
      if (this.drawing == col) {
        this.drawing = null;
        draw.create();
      } else {
        this.drawing = col;
      }
      setDrawing(this.drawing);
    },
    deleteDraw: function (col) {
      deleteDrawing(col);
      this.drawing = null;
    },
    update: function () {
      updateHex(this.parVals);
    },
  },
}).mount("#sidebar");

mapboxgl.accessToken =
  "pk.eyJ1IjoiY2FyZGVybmUiLCJhIjoiY2puMXN5cnBtNG53NDN2bnhlZ3h4b3RqcCJ9.eNjrtezXwvM7Ho1VSxo06w";
const map = new mapboxgl.Map({
  container: "map",
  style: "mapbox://styles/carderne/cl0rvsxn200ce14jz3q5j5hco?fresh=true",
  center: [37.7, 0.31],
  zoom: 6,
});

const setDrawing = (drawing) => {
  draw.changeMode(drawing ? "draw_line_string" : "static");
};

hex.features.forEach((ft) => {
  ft.properties.grid_dist_orig = ft.properties.grid_dist;
  ft.properties.road_dist_orig = ft.properties.road_dist;
});

const resetProp = (prop) => {
  hex.features.forEach((ft) => {
    ft.properties[prop] = ft.properties[`${prop}_orig`];
  });
};

const deleteDrawing = (col) => {
  map.getSource(`drawn_${col}`).setData(featsToFc([]));
  draw.deleteAll();
  resetProp(col);
  updateHex(app.parVals);
};

const StaticMode = {};
StaticMode.onSetup = function () {
  this.setActionableState();
  return {};
};
StaticMode.toDisplayFeatures = function (state, geojson, display) {
  display(geojson);
};

const draw = new MapboxDraw({
  displayControlsDefault: false,
  modes: { ...MapboxDraw.modes, static: StaticMode },
  styles: [
    {
      id: "gl-draw-grid",
      type: "line",
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
      paint: {
        "line-color": "#000000",
        "line-width": 3,
      },
    },
  ],
});
map.addControl(draw);

const joinLineToHex = (line) => {
  const length = Math.floor(turf.lineDistance(line, "km"));
  const points = {
    type: "FeatureCollection",
    features: [],
  };
  for (let step = 0; step < length + 6; step += 5) {
    points.features.push(turf.along(line, step, "km"));
  }
  const tagged = turf
    .tag(points, hex, "index", "hexId")
    .features.map((f) => f.properties.hexId);
  const ids = [...new Set(tagged)].filter(Number);
  return ids;
};

const featsToFc = (feats) => ({
  type: "FeatureCollection",
  features: feats,
});

const drawnLines = toObjArr(infra);

const updateLine = (e) => {
  const drawing = app.drawing;
  if (drawing) {
    drawnLines[drawing] = drawnLines[drawing].concat(e.features);
    map.getSource(`drawn_${drawing}`).setData(featsToFc(drawnLines[drawing]));
    const lines = draw.getAll();
    const ids = lines.features.map((f) => joinLineToHex(f.geometry)).flat(1);
    extendProp(ids, 0, drawing);
    updateHex(app.parVals, app.colorByObj);
  }
};

const extendProp = (ids, dist, col) => {
  const neis = [];
  ids.forEach((i) => {
    if (hex.features[i].properties[col] > dist) {
      hex.features[i].properties[col] = dist;
      const p = hex.features[i].properties;
      const nei = [p.n0, p.n1, p.n2, p.n3, p.n4, p.n5];
      neis.push(nei);
    }
  });
  if (neis.length > 0) {
    const idsSet = new Set(ids);
    const newIds = [...new Set(neis.flat(1))].filter((x) => !idsSet.has(x));
    extendProp(newIds, dist + 10, col);
  }
};

map.on("draw.create", updateLine);
map.on("draw.modechange", (e) => {
  if (e.mode === "simple_select")
    setTimeout(() => {
      draw.changeMode("draw_line_string");
    }, 100);
});

let mapLoaded = false;
map.on("load", () => {
  mapLoaded = true;

  infra.forEach((i) => {
    const id = `drawn_${i.col}`;
    map.addSource(id, {
      type: "geojson",
      data: featsToFc([]),
    });

    map.addLayer({
      id: id,
      type: "line",
      source: id,
      paint: {
        "line-color": i.color,
        "line-width": 5,
      },
    });
  });

  map.addSource("hex", {
    type: "geojson",
    data: hex,
  });

  const filt = ["!=", ["get", "farm_type"], "none"];

  map.addLayer({
    id: "hex",
    type: "fill",
    source: "hex",
    filter: filt,
    paint: {
      "fill-color": "rgba(0, 0, 0, 0)",
      "fill-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0.6, 13, 0.2],
      "fill-outline-color": [
        "interpolate",
        ["linear"],
        ["zoom"],
        5,
        "hsla(0, 0%, 11%, 0)",
        13,
        "hsl(0, 0%, 11%)",
      ],
    },
  });
  map.addLayer({
    id: "hex_label",
    type: "symbol",
    source: "hex",
    filter: filt,
    layout: {
      "text-field": "{index}",
      "text-size": 10,
      "visibility": app.idLabelsText,
    },
    paint: {
      "text-halo-width": 1,
      "text-halo-color": "#fff",
      "text-halo-blur": 1,
      "text-color": "#000",
    },
  });
  updateHex(app.parVals);
  updatePaint(app.colorByObj);

  const pointer = () => {
    if (!app.drawing) map.getCanvas().style.cursor = "pointer";
  };
  const nopointer = () => {
    if (!app.drawing) map.getCanvas().style.cursor = "";
  };

  map.on("mouseenter", "hex", pointer);
  map.on("mouseleave", "hex", nopointer);

  const addPopup = (e) => {
    if (!app.drawing) {
      const props = e.features[0].properties;
      const description = `
        <div><strong>ID: ${props.index}</strong></div>
        <div>adm1: ${props.adm1}</div>
        <div>Grid dist: ${fmt(props.grid_dist)} km</div>
        <div>Road dist: ${fmt(props.road_dist)} km</div>
        <div>Farm type: ${props.farm_type}</div>
        <div>Fish output: ${fmt(props.fish_output)} tons/year</div>
        <div>Profit: ${fmt(props.profit)} USD/year</div>
        <div>Gov costs: ${fmt(props.gov_costs)} USD/year</div>
        <div>Social: ${fmt(props.social)} USD/year</div>
      `;
      new mapboxgl.Popup().setLngLat(e.lngLat).setHTML(description).addTo(map);
    }
  };
  map.on("click", "hex", (e) => addPopup(e));
});

const updatePaint = (attr) => {
  if ("cats" in attr) {
    map.setPaintProperty(
      "hex",
      "fill-color",
      ["match"]
        .concat([["get", attr.col]])
        .concat(zipflat(attr.cats, attr.colors))
    );
  } else {
    const hexVals = hex.features.map((f) => f.properties[attr.col]);
    const hexMax = Math.max(...hexVals);
    const hexMin = Math.min(...hexVals);
    map.setPaintProperty("hex", "fill-color", [
      "interpolate",
      ["linear"],
      ["get", attr.col],
      hexMin,
      attr.minCol,
      0.5 * hexMax,
      attr.maxCol,
    ]);
  }
};

const updateHex = (parVals) => {
  if (mapLoaded) {
    hex.features.forEach((ft) => {
      ft.properties = {
        ...ft.properties,
        ...model(ft.properties, parVals),
      };
    });
    map.getSource("hex").setData(hex);
  }
};
/// app.js
import React from "react";
import DeckGL from "@deck.gl/react";
import { TileLayer } from "@deck.gl/geo-layers";
import { StaticMap } from "react-map-gl";
// import {BandsBitmapLayer} from "deckgl-bands-bitmap-layer";
import BandsBitmapLayer from "./bitmap-layer/bitmap-layer";
import {ImageLoader} from '@loaders.gl/images';
import {load} from '@loaders.gl/core';

import {loadImageArray} from '@loaders.gl/images';

// Viewport settings
const viewState = {
  longitude: -112.1861,
  latitude: 36.1284,
  zoom: 12.1,
  pitch: 0,
  bearing: 0
};

// DeckGL react component
export default class App extends React.Component {
  state = {
    r_img: null,
    g_img: null,
    b_img: null,
  }

  async componentDidMount() {
    const url = "https://landsat-lambda.kylebarron.dev/tiles/229bc0ed88ac7f39effdb554efa0959766e41bb3948754faba13f74f/12/771/1606@2x.png?bands={band}&color_ops=gamma+R+3.5%2C+sigmoidal+R+15+0.35";

    const r_url = url.replace('{band}', '4');
    const g_url = url.replace('{band}', '3');
    const b_url = url.replace('{band}', '2');

    const r_img = await load(r_url, ImageLoader);
    const g_img = await load(g_url, ImageLoader);
    const b_img = await load(b_url, ImageLoader);

    this.setState({
      r_img,
      g_img,
      b_img
    })

  }

  render() {
    const {r_img, g_img, b_img} = this.state;
    console.log([r_img, g_img, b_img])

    // let layers = [];
    // if (r_img && g_img && b_img) {
    //   layers.push(
    //     new BandsBitmapLayer({
    //       // https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Tile_servers
    //       // data: "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
    //       images: [r_img, g_img, b_img],
    //       bounds: [-112.236328125, 36.10237644873644, -112.1484375, 36.17335693522158]
    //
    //     })
    //
    //   )
    // }
    const layers = [
      new TileLayer({
        // https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Tile_servers
        // data: "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
        data:
          "https://landsat-lambda.kylebarron.dev/tiles/229bc0ed88ac7f39effdb554efa0959766e41bb3948754faba13f74f/{z}/{x}/{y}@2x.png?bands=&color_ops=gamma+R+3.5%2C+sigmoidal+R+15+0.35",

        minZoom: 0,
        maxZoom: 12,

        getTileData: async ({url}) => {
          const urls = [
            url.replace("bands=", "bands=4"),
            url.replace("bands=", "bands=3"),
            url.replace("bands=", "bands=2")
          ];
          const images = await Promise.all([
            load(urls[0], ImageLoader),
            load(urls[1], ImageLoader),
            load(urls[2], ImageLoader),
          ])
          return images;
        },

        renderSubLayers: props => {
          const {
            bbox: { west, south, east, north }
          } = props.tile;
          const {data} = props;

          let image_r, image_g, image_b;
          if (Array.isArray(data)) {
            image_r = data[0];
            image_g = data[1];
            image_b = data[2];
          } else if (data) {
            image_r = data.then(result => result && result[0]);
            image_g = data.then(result => result && result[1]);
            image_b = data.then(result => result && result[2]);
          }

          return new BandsBitmapLayer(props, {
            data: null,
            images: [image_r, image_g, image_b],
            bounds: [west, south, east, north]
          });
        }
      })
      // new BandsBitmapLayer({
      //   // https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Tile_servers
      //   // data: "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png",
      //   images: [r_img, g_img, b_img],
      //   bounds: [-112.236328125, 36.10237644873644, -112.1484375, 36.17335693522158]
      //
      // })
    ];

    return (
      <DeckGL initialViewState={viewState} layers={layers} controller>
        <StaticMap
          mapStyle="https://cdn.jsdelivr.net/gh/nst-guide/osm-liberty-topo@gh-pages/style.json"
          mapOptions={{ hash: true }}
        />
      </DeckGL>
    );
  }
}

// Copyright (c) 2015 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

/* global HTMLVideoElement */
import GL from '@luma.gl/constants';
import {Layer, project32, picking} from '@deck.gl/core';
import {Model, Geometry, Texture2D} from '@luma.gl/core';
import {loadImageArray} from '@loaders.gl/images';

import vs from './bitmap-layer-vertex';
import fs from './bitmap-layer-fragment';

const DEFAULT_TEXTURE_PARAMETERS = {
  [GL.TEXTURE_MIN_FILTER]: GL.LINEAR_MIPMAP_LINEAR,
  [GL.TEXTURE_MAG_FILTER]: GL.LINEAR,
  [GL.TEXTURE_WRAP_S]: GL.CLAMP_TO_EDGE,
  [GL.TEXTURE_WRAP_T]: GL.CLAMP_TO_EDGE
};

const defaultProps = {
  images: {type: 'array', value: [null], compare: true},
  bounds: {type: 'array', value: [1, 0, 0, 1], compare: true},

  desaturate: {type: 'number', min: 0, max: 1, value: 0},
  // More context: because of the blending mode we're using for ground imagery,
  // alpha is not effective when blending the bitmap layers with the base map.
  // Instead we need to manually dim/blend rgb values with a background color.
  transparentColor: {type: 'color', value: [0, 0, 0, 0]},
  tintColor: {type: 'color', value: [255, 255, 255]}
};

/*
 * @class
 * @param {object} props
 * @param {number} props.transparentColor - color to interpret transparency to
 * @param {number} props.tintColor - color bias
 */
export default class BandsBitmapLayer extends Layer {
  getShaders() {
    return super.getShaders({vs, fs, modules: [project32, picking]});
  }

  initializeState() {
    const attributeManager = this.getAttributeManager();

    attributeManager.add({
      positions: {
        size: 3,
        type: GL.DOUBLE,
        fp64: this.use64bitPositions(),
        update: this.calculatePositions,
        noAlloc: true
      }
    });

    this.setState({
      numInstances: 1,
      positions: new Float64Array(12)
    });
  }

  updateState({props, oldProps, changeFlags}) {
    // setup model first
    if (changeFlags.extensionsChanged) {
      const {gl} = this.context;
      if (this.state.model) {
        this.state.model.delete();
      }
      this.setState({model: this._getModel(gl)});
      this.getAttributeManager().invalidateAll();
    }

    // Load images
    if (!arraysEqual(props.images, oldProps.images)) {
      // const images = this.loadTextures(props.images);
      if (props.images) {
        const {gl} = this.context;
        this.setState({
          r: new Texture2D(gl, {
            data: props.images[0],
            parameters: DEFAULT_TEXTURE_PARAMETERS
          }),
          g: new Texture2D(gl, {
            data: props.images[1],
            parameters: DEFAULT_TEXTURE_PARAMETERS
          }),
          b: new Texture2D(gl, {
            data: props.images[2],
            parameters: DEFAULT_TEXTURE_PARAMETERS
          }),
        })
      }
    }

    const attributeManager = this.getAttributeManager();

    if (props.bounds !== oldProps.bounds) {
      attributeManager.invalidate('positions');
    }
  }

  finalizeState() {
    super.finalizeState();

    if (this.state.r) {
      this.state.r.delete();
    }
    if (this.state.g) {
      this.state.g.delete();
    }
    if (this.state.b) {
      this.state.b.delete();
    }
  }

  calculatePositions(attributes) {
    const {positions} = this.state;
    const {bounds} = this.props;
    // bounds as [minX, minY, maxX, maxY]
    if (Number.isFinite(bounds[0])) {
      /*
        (minX0, maxY3) ---- (maxX2, maxY3)
               |                  |
               |                  |
               |                  |
        (minX0, minY1) ---- (maxX2, minY1)
     */
      positions[0] = bounds[0];
      positions[1] = bounds[1];
      positions[2] = 0;

      positions[3] = bounds[0];
      positions[4] = bounds[3];
      positions[5] = 0;

      positions[6] = bounds[2];
      positions[7] = bounds[3];
      positions[8] = 0;

      positions[9] = bounds[2];
      positions[10] = bounds[1];
      positions[11] = 0;
    } else {
      // [[minX, minY], [minX, maxY], [maxX, maxY], [maxX, minY]]
      for (let i = 0; i < bounds.length; i++) {
        positions[i * 3 + 0] = bounds[i][0];
        positions[i * 3 + 1] = bounds[i][1];
        positions[i * 3 + 2] = bounds[i][2] || 0;
      }
    }

    attributes.value = positions;
  }

  _getModel(gl) {
    if (!gl) {
      return null;
    }

    /*
      0,0 --- 1,0
       |       |
      0,1 --- 1,1
    */
    return new Model(
      gl,
      Object.assign({}, this.getShaders(), {
        id: this.props.id,
        geometry: new Geometry({
          drawMode: GL.TRIANGLE_FAN,
          vertexCount: 4,
          attributes: {
            texCoords: new Float32Array([0, 1, 0, 0, 1, 0, 1, 1])
          }
        }),
        isInstanced: false
      })
    );
  }

  draw(opts) {
    const {uniforms} = opts;
    const {r, g, b, model} = this.state;
    const {desaturate, transparentColor, tintColor} = this.props;

    // // TODO fix zFighting
    // Render the image
    if (r && g && b && model) {
      model
        .setUniforms(
          Object.assign({}, uniforms, {
            bitmapTexture_r: r,
            bitmapTexture_g: g,
            bitmapTexture_b: b,
            desaturate,
            transparentColor: transparentColor.map(x => x / 255),
            tintColor: tintColor.slice(0, 3).map(x => x / 255)
          })
        )
        .draw();
    }
  }

  loadTextures(images) {
    if (images.every(img => img instanceof Texture2D)) {
      return images;
    } else if (images) {
      // Browser object: Image, ImageData, HTMLCanvasElement, ImageBitmap
      // Load images
      return loadImageArray(3, index => images[index])
    }
  }
}

function arraysEqual(array1, array2) {
  if (!array1 || !array2) {
    return false
  }

  return array1.length === array2.length && array1.every((value, index) => value === array2[index])
}

BandsBitmapLayer.layerName = 'BandsBitmapLayer';
BandsBitmapLayer.defaultProps = defaultProps;
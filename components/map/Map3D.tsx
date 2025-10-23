/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

'use client';

/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {useMapsLibrary} from '@vis.gl/react-google-maps';
import React, {
  ForwardedRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState
} from 'react';
import {useMap3DCameraEvents} from './useCameraEvents';
import {useCallbackRef, useDeepCompareEffect} from './hooks';

import './types';

export type Map3DProps = google.maps.maps3d.Map3DElementOptions & {
  onCameraChange?: (cameraProps: Map3DCameraProps) => void;
  children?: React.ReactNode;
};

export type Map3DCameraProps = {
  center: google.maps.LatLngAltitudeLiteral;
  range: number;
  heading: number;
  tilt: number;
  roll: number;
};

export const Map3D = forwardRef(
  (
    props: Map3DProps,
    forwardedRef: ForwardedRef<google.maps.maps3d.Map3DElement | null>
  ) => {
    useMapsLibrary('maps3d');

    const [map3DElement, map3dRef] =
      useCallbackRef<google.maps.maps3d.Map3DElement>();

    useMap3DCameraEvents(map3DElement, p => {
      if (!props.onCameraChange) return;

      props.onCameraChange(p);
    });

    const [customElementsReady, setCustomElementsReady] = useState(false);
    useEffect(() => {
      customElements.whenDefined('gmp-map-3d').then(() => {
        setCustomElementsReady(true);
      });
    }, []);

    const {center, heading, tilt, range, roll, children, onCameraChange, ...map3dOptions} = props;

    useDeepCompareEffect(() => {
      if (!map3DElement) return;

      Object.assign(map3DElement, map3dOptions);

      // Set complex properties directly on the element to avoid stringification
      if (center !== undefined) map3DElement.center = center;
      if (range !== undefined) map3DElement.range = range;
      if (heading !== undefined) map3DElement.heading = heading;
      if (tilt !== undefined) map3DElement.tilt = tilt;
      if (roll !== undefined) map3DElement.roll = roll;

    }, [map3DElement, map3dOptions, center, heading, tilt, range, roll]);

    useImperativeHandle<
      google.maps.maps3d.Map3DElement | null,
      google.maps.maps3d.Map3DElement | null
    >(forwardedRef, () => map3DElement, [map3DElement]);

    if (!customElementsReady) return null;

    return (
      <gmp-map-3d
        ref={map3dRef}
        defaultUIHidden={true}
        mode="SATELLITE">
          {children}
      </gmp-map-3d>
    );
  }
);

Map3D.displayName = 'Map3D';

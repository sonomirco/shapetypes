// tslint:disable:readonly-array

import { Point } from './point';
import { Polygon } from './polygon';
import { Polyline } from './polyline';

/**
 * Checks whether two values are equal within a set tolerance
 *
 * https://stackoverflow.com/questions/14582122/check-whether-the-number-is-nearly-equal-javascript
 * @param value1
 * @param value2
 * @param epsilon
 */
export function approximatelyEqual(
  value1: number,
  value2: number,
  epsilon: number = 0.001
): boolean {
  return Math.abs(value1 - value2) < epsilon;
}

export function isPointArray(value: any): value is Point[] {
  if (value instanceof Array) {
    if (value.length > 0) {
      if (value[0] instanceof Point) {
        return true;
      }
    }
  }
  return false;
}

export function isNumberArray(value: any): value is number[] {
  if (value instanceof Array) {
    if (value.length > 0) {
      if (typeof value[0] === 'number') {
        return true;
      }
    }
  }
  return false;
}

export function isPolylineArray(value: any): value is Polyline[] {
  if (value instanceof Array) {
    if (value.length > 0) {
      if (value[0] instanceof Polyline) {
        return true;
      }
    }
  }
  return false;
}

export function isPolygonArray(value: any): value is Polygon[] {
  if (value instanceof Array) {
    if (value.length > 0) {
      if (value[0] instanceof Polygon) {
        return true;
      }
    }
  }
  return false;
}
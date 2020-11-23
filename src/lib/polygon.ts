/* tslint:disable:readonly-array no-let */

import {
  difference as pcDifference,
  intersection as pcIntersection,
  MultiPolygon,
  Polygon as pcPolygon,
  Ring,
  union as pcUnion
} from 'polygon-clipping';
import { isPolygonArray, isPolylineArray } from './utilities';

import {
  BoundingBox,
  CurveOrientation,
  Geometry,
  Point,
  PointContainment,
  Polyline,
  shapetypesSettings,
  Transform
} from '../index';

/**
 * A polygon is a shape defined by an outer [[boundary]]. The surface of the polygon
 * may not be continous and may contain [[holes]].
 *
 * If the world's y-axis points upwards, the boundary is always in a counter-clockwise orientation. The holes are always clockwise.
 * If the world's y-axis points downwards, the boundary is always in a clockwise orientation. The holes are always counter-clockwise.
 */
export class Polygon extends Geometry {
  // -----------------------
  // STATIC
  // -----------------------

  public static fromCoords(coordinates: pcPolygon): Polygon {
    if (coordinates.length === 0) {
      throw new RangeError('Coordiante of polygon must have a length');
    } else if (coordinates.length === 1) {
      const boundary = Polyline.fromCoords(coordinates[0]);
      return new Polygon(boundary);
    } else {
      const boundary = Polyline.fromCoords(coordinates[0]);
      const holes = new Array<Polyline>();
      for (let i = 1; i < coordinates.length; i++) {
        holes.push(Polyline.fromCoords(coordinates[i]));
      }
      return new Polygon(boundary, holes);
    }
  }

  // -----------------------
  // VARS
  // -----------------------
  private readonly _boundary: Polyline;
  private readonly _holes: readonly Polyline[];

  constructor(boundary: Polyline, holes?: readonly Polyline[] | undefined) {
    super();
    if (boundary.isClosed === false) {
      throw new Error('Boundary must be closed to turn into polygon');
    }
    this._boundary = boundary.withOrientation(CurveOrientation.counterclockwise);

    if (holes === undefined) {
      this._holes = new Array<Polyline>();
    } else {
      const newHoles = new Array<Polyline>();
      for (const hole of holes) {
        if (hole.isClosed === false) {
          throw new Error('Hole must be closed to turn into polygon');
        }
        newHoles.push(hole.withOrientation(CurveOrientation.clockwise));
      }
      this._holes = newHoles;
    }
  }

  // -----------------------
  // GET
  // -----------------------

  get area(): number {
    const area = this._holes.reduce((accumulator, hole) => accumulator - hole.area, this._boundary.area);
    return area;
  }

  get boundary(): Polyline {
    return this._boundary;
  }

  get boundingBox(): BoundingBox {
    return this._boundary.boundingBox;
  }

  get holes(): readonly Polyline[] {
    return this._holes;
  }

  // -----------------------
  // PUBLIC
  // -----------------------

  /**
   * Returns the point on the polyline that is nearest to `targetPoint`.
   * @param targetPoint  The target to measure distance from.
   */
  public closestLoop(targetPoint: Point): Polyline {
    let closestLength: number | undefined;
    let closestLoop: Polyline = this._boundary;

    for (const polyline of [this.boundary, ...this.holes]) {
      const test = polyline.closestPoint(targetPoint);
      const length = targetPoint.distanceTo(test);

      if (closestLength === undefined || length < closestLength) {
        closestLength = length;
        closestLoop = polyline;
      }
    }

    return closestLoop;
  }

  /**
   * Returns the point on the polyline that is nearest to `targetPoint`.
   * @param targetPoint  The target to measure distance from.
   */
  public closestPoint(targetPoint: Point): Point {
    if (this.contains(targetPoint) === PointContainment.inside) {
      return targetPoint;
    }

    let closestLength: number | undefined;
    let closestPoint: Point = targetPoint;

    for (const polyline of [this._boundary, ...this._holes]) {
      if (closestLength !== undefined) {
        // Rather than running closest point on every polyline, quickly check to see
        // if the polyline's boundingBox is close. If it's not, there is no way the polyline
        // can be close.
        const closestBB = polyline.boundingBox.closestPoint(targetPoint, true);
        const lengthBB = targetPoint.distanceTo(closestBB);
        if (lengthBB > closestLength) {
          continue;
        }
      }
      const test = polyline.closestPoint(targetPoint);
      const length = targetPoint.distanceTo(test);

      if (closestLength === undefined || length < closestLength) {
        closestLength = length;
        closestPoint = test;
      }
    }

    return closestPoint;
  }

  /**
   * Returns the relationship between a point and a polyline.
   *
   * Note: This method only works with closed polylines. It will throw an error if applied to an open polyline.
   *
   * @param point       Point to test for containment.
   * @param tolerance   Distance the point can be from the edge of the polyline and still considered coincident.
   */
  public contains(
    point: Point,
    tolerance = shapetypesSettings.absoluteTolerance
  ): PointContainment {
    const boundaryContainment = this._boundary.contains(point, tolerance);
    if (boundaryContainment !== PointContainment.inside) {
      return boundaryContainment;
    }

    for (const hole of this._holes) {
      const holeContainment = hole.contains(point, tolerance);
      if (holeContainment === PointContainment.inside) {
        // Because we're inside a hole
        return PointContainment.outside;
      } else if (holeContainment === PointContainment.coincident) {
        return PointContainment.coincident;
      }
    }

    // If we go to here, the point is inside the boundary,
    // and not inside or on edge of a hole
    return PointContainment.inside;
  }

  public equals(otherPolygon: Polygon): boolean {
    if (this._holes.length !== otherPolygon.holes.length) {
      return false;
    }
    if (!this._boundary.equals(otherPolygon.boundary)) {
      return false;
    }

    const isEqual = this._holes.every((hole, index) => hole.equals(otherPolygon.holes[index]));
    return isEqual;
  }

  public toString(): string {
    const strings = new Array<string>();
    for (const loop of [this._boundary, ...this._holes]) {
      strings.push(loop.toString());
    }
    return '[' + strings.join(',') + ']';
  }

  // -----------------------
  // BOOLEAN
  // -----------------------

  /**
   * Joins this polygon with another polyline or polygon.
   * @param joiner: Either a polyline, polygon, or a list of the two.
   * @returns:    A polyline or polygon representing the two objects joined together.
   *              Note: may return two objects if the original objects don't overlap
   */
  public union(
    joiner: Polyline | Polygon | readonly Polyline[] | readonly Polygon[]
  ): ReadonlyArray<Polygon> {
    const result = pcUnion(this.asGeoJSON(), toMulti(joiner));
    return fromGeoJSON(result);
  }

  public intersection(
    intersector: Polyline | Polygon | readonly Polyline[] | readonly Polygon[]
  ): ReadonlyArray<Polygon> {
    const result = pcIntersection(this.asGeoJSON(), toMulti(intersector));
    return fromGeoJSON(result);
  }

  public difference(
    subtractor: Polyline | Polygon | readonly Polyline[] | readonly Polygon[]
  ): ReadonlyArray<Polygon> {
    const result = pcDifference(this.asGeoJSON(), toMulti(subtractor));
    return fromGeoJSON(result);
  }

  /**
   *  Converts polygon into specific format needed by the PolygonClipping library.
   * (see: https://github.com/mfogel/polygon-clipping/issues/76)
   */
  public asGeoJSON(): pcPolygon {
    const rings = new Array<Ring>();

    rings.push(this._boundary.asGeoJSON());

    for (const hole of this._holes) {
      rings.push(hole.asGeoJSON());
    }

    return rings;
  }

  // -----------------------
  // TRANSFORMABLE
  // -----------------------

  /**
   * Returns a copy of the polyline transformed by a [[transform]] matrix.
   *
   * ### Example
   * ```js
   *
   * import { Polyline } from 'shapetypes'
   *
   * const triangle = new Polyline([new Point(0, 0), new Point(1, 1), new Point(2, 0)], true);
   * console.log(shifted.from.toString());
   * // => [0,0]
   *
   * const tran = Transform.translate(new Vector(3,4);
   * const shifted = triangle.transform(tran);
   * console.log(shifted.from.toString());
   * // => [3,4]
   *
   * // Direct method
   * const otherShifted = triangle.translate(new Vector(3, 4));
   * console.log(otherShifted.from.toString());
   * // => [3,4]
   * ```
   *
   * Note: If you're applying the same transformation a lot of geometry,
   * creating the matrix and calling this function is faster than using the direct methods.
   *
   * @category Transform
   * @param change  A [[transform]] matrix to apply to the polyline
   */
  public transform(change: Transform): this {
    const newBoundary = this._boundary.transform(change);
    const newHoles = this._holes.map(hole => hole.transform(change));

    // @ts-ignore
    return new Polygon(newBoundary, newHoles);
  }
}

// -----------------------
// HELPERS
// -----------------------

/**
 * @ignore
 * @param input
 */
/* istanbul ignore next */
function toMulti(
  input: Polyline | Polygon | readonly Polyline[] | readonly Polygon[]
): pcPolygon | pcPolygon[] {
  if (input instanceof Polyline) {
    return [input.asGeoJSON()];
  } else if (input instanceof Polygon) {
    return input.asGeoJSON();
  } else if (isPolylineArray(input)) {
    const geometry = new Array<pcPolygon>();
    for (const polyline of input) {
      geometry.push([polyline.asGeoJSON()]);
    }
    return geometry;
  } else if (isPolygonArray(input)) {
    const geometry = new Array<pcPolygon>();
    for (const polyline of input) {
      geometry.push(polyline.asGeoJSON());
    }
    return geometry;
  }
  throw new Error("Couldn't convert geometry for boolean");
}

/**
 * Converts the results of the PolygonClipping library into an array of Polyline's and Polygons
 *
 * @ignore
 *
 * @param multi
 * @return: A list of polygons and polylines.
 *              - If the operation didn't split the original geometry into pieces, this array will have only one item in it.
 *              - If the resulting object doesn't have any hole it'll be returned as a polyline. If it has holes, it'll be returned as a polygon.
 */
function fromGeoJSON(multi: MultiPolygon): ReadonlyArray<Polygon> {
  const outputs = new Array<Polygon>();

  for (const polygon of multi) {
    if (polygon.length === 0) {
      /* istanbul ignore next */
      continue;
    } else {
      outputs.push(Polygon.fromCoords(polygon));
    }
  }
  return outputs;
}

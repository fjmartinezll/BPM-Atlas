/**
 * Shared SVG marker defs for ER diagrams using "crow's foot" notation.
 * Renders an invisible SVG with two reusable <marker> definitions:
 *  - er-one:  perpendicular bar at the "1" end
 *  - er-many: three-line fan (crow's foot) at the "N" end
 *
 * Markers use stroke="currentColor" so each edge can color its own ends
 * via CSS `color` (which inherits into the marker SVG).
 */
export function ErEdgeMarkers() {
  return (
    <svg
      width="1"
      height="1"
      style={{ position: "absolute", visibility: "hidden" }}
      aria-hidden
    >
      <defs>
        {/* "1" side — perpendicular tick. refX placed so the tick sits at line end. */}
        <marker
          id="er-one"
          viewBox="0 0 14 14"
          refX="12"
          refY="7"
          markerWidth="18"
          markerHeight="18"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <line x1="10" y1="1" x2="10" y2="13" stroke="currentColor" strokeWidth="2" fill="none" />
        </marker>
        {/* "N" side — crow's foot (three lines fanning out). */}
        <marker
          id="er-many"
          viewBox="0 0 20 20"
          refX="18"
          refY="10"
          markerWidth="22"
          markerHeight="22"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path
            d="M 18 10 L 2 1 M 18 10 L 2 10 M 18 10 L 2 19"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
        </marker>
      </defs>
    </svg>
  );
}

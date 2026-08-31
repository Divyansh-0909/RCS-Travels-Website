import Skeleton from "./Skeleton";

const road = (className, opacity = 0.48) => (
    <Skeleton
        tone="light"
        rounded="rounded-full"
        className={`absolute ${className}`}
        style={{ background: `rgba(255,255,255,${opacity})` }}
    />
);

/**
 * A placeholder for the map section itself. The broad crossing strokes suggest
 * a road network without drawing fake streets or labels that would jump when
 * the real tiles arrive.
 */
const MapSkeleton = () => (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
        {road("h-3 sm:h-4 w-[135%] top-[22%] -left-[18%] -rotate-[13deg]")}
        {road("h-2 sm:h-3 w-[120%] top-[55%] -left-[5%] rotate-[18deg]", 0.38)}
        {road("h-2 w-[88%] top-[76%] -left-[10%] -rotate-[28deg]", 0.34)}
        {road("h-2 w-[72%] top-[38%] left-[43%] rotate-[68deg]", 0.3)}
        <Skeleton
            tone="light"
            rounded="rounded-full"
            className="absolute w-12 h-12 sm:w-14 sm:h-14 top-[43%] left-[43%]"
            style={{ background: "rgba(255,255,255,0.58)" }}
        />
    </div>
);

export default MapSkeleton;

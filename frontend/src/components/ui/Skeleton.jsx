// A single shimmer placeholder block. Compose several of these to build a
// skeleton screen that mirrors the real layout it stands in for.
// `tone="dark"`  → for dark surfaces (panels, tracking page)
// `tone="light"` → for light surfaces (ride history cards on the white page)
const Skeleton = ({ className = "", tone = "dark", rounded = "rounded-lg", style }) => {
    const base = tone === "light" ? "bg-black/[0.07]" : "bg-white/[0.06]";
    const sheen = tone === "light" ? "via-white/70" : "via-white/15";

    return (
        <div
            style={style}
            aria-hidden="true"
            className={`relative overflow-hidden ${base} ${rounded} ${className}`}
        >
            <div
                className={`absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent ${sheen} to-transparent animate-skeleton-sheen motion-reduce:hidden`}
            />
        </div>
    );
};

export default Skeleton;

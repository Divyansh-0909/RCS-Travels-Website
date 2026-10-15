import cabBody from "../../assets/services/cab-body.png";
import cabDoor from "../../assets/services/cab-door.png";
import student from "../../assets/services/student.png";
import campus from "../../assets/services/campus.png";
import palm from "../../assets/services/palm.png";

// Keep the generator's RGBA files unchanged. Every layer has a reserved box,
// so image decoding cannot change the scroll animation's coordinate system.
function Cutout({ src, width, height, className, priority = false }) {
    return <img src={src} width={width} height={height} className={className}
        alt="" draggable="false" decoding="async" fetchPriority={priority ? "high" : "auto"} />;
}

export function CampusScene({ className = "" }) {
    return (
        <div className={`campus-scene ${className}`} aria-hidden="true">
            <div className="campus-palm campus-palm--back">
                <Cutout src={palm} width={1024} height={1536} />
            </div>
            <Cutout src={campus} width={1774} height={887} className="campus-building" priority />
            <div className="campus-palm campus-palm--front">
                <Cutout src={palm} width={1024} height={1536} />
            </div>
        </div>
    );
}

export function CabScene() {
    return (
        <div className="cab-scene" aria-hidden="true">
            <div className="cab-ground-shadow" />
            <div className="cab-body">
                <Cutout src={cabBody} width={1536} height={1024} priority />
            </div>
            <div className="cab-door">
                <Cutout src={cabDoor} width={1157} height={1359} />
            </div>
            <div className="cab-passenger">
                <Cutout src={student} width={1024} height={1536} priority />
            </div>
        </div>
    );
}

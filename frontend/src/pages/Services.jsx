import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useWebsiteCopy } from "../hooks/useWebsiteCopy";
import {
    SunCutout,
    OrbitCutout, StarCutout, BoltCutout,
} from "../components/services/ServicesSceneIllustrations";
import { CabScene, CampusScene } from "../components/services/ServicesCutoutScenes";
import "./Services.css";

gsap.registerPlugin(ScrollTrigger);

const rideCases = [
    { id: "campus", title: "Campus runs", context: "Your everyday, sorted." },
    { id: "airport", title: "Airport days", context: "Doorstep to departures." },
    { id: "exams", title: "Big days", context: "Exams. Interviews. New beginnings." },
    { id: "night", title: "After hours", context: "One more stop. Then home." },
    { id: "shared", title: "Better together", context: "Same direction? Share the journey." },
];

export default function Services() {
    const tr = useWebsiteCopy();
    const storyRef = useRef(null);

    useLayoutEffect(() => {
        const story = storyRef.current;
        if (!story) return undefined;
        const media = gsap.matchMedia();
        let disposed = false;

        // Lazy sections mount before App's Smoother observer. Install pins on
        // the next frame, once the scrolling root is ready.
        const frame = requestAnimationFrame(() => {
            media.add({
                desktop: "(min-width: 1000px)",
                mobile: "(max-width: 999px)",
                reduced: "(prefers-reduced-motion: reduce)",
                short: "(max-height: 759px)",
            }, (context) => {
                const { desktop, reduced, short } = context.conditions;
                if (reduced || short) return;
                const select = gsap.utils.selector(story);
                const stage = select(".services-stage")[0];
                const rider = select(".services-rider")[0];
                const content = select(".services-use-cases")[0];
                const rows = select(".services-use-case");
                const width = () => stage.clientWidth;
                const height = () => stage.clientHeight;
                const centerX = () => (width() - rider.offsetWidth) / 2;
                const centerY = () => (height() - rider.offsetHeight) / 2 + 24;
                const endScale = () => desktop ? 0.74 : Math.min(0.76, (width() >= 640 ? 430 : 310) / rider.offsetWidth);
                const endX = () => desktop
                    ? width() * 0.72 - rider.offsetWidth * endScale() / 2
                    : width() * 0.98 - rider.offsetWidth * endScale();
                const endY = () => desktop ? height() * 0.29 : 80;

                story.classList.add("services--animated");
                gsap.set(content, { autoAlpha: 0 });
                gsap.set(rows, { opacity: 0, y: 20 });
                gsap.set(rider, { transformOrigin: "0 0" });

                gsap.from(select(".services-intro__title > span"), {
                    opacity: 0, y: 24, duration: 0.65, stagger: 0.12,
                    delay: 0.12, ease: "power2.out",
                });

                // The next illustration peeks into the opening, then travels
                // from the left to the centre as the blue scene rises.
                const approach = gsap.timeline({
                    defaults: { ease: "none" },
                    scrollTrigger: {
                        id: "services-approach", trigger: stage,
                        start: "top bottom", end: "top top", scrub: true,
                        invalidateOnRefresh: true,
                    },
                });
                approach.fromTo(rider, {
                    x: () => width() * (desktop ? -0.14 : -0.38),
                    y: () => desktop ? -260 : -150, rotation: -7,
                }, { x: centerX, y: centerY, rotation: -2, duration: 1 }, 0)
                    .to(select(".services-intro__title"), { y: -65, duration: 1 }, 0)
                    .to(select(".services-campus"), { y: -30, duration: 1 }, 0)
                    .to(select(".services-intro__orbit"), { rotation: 65, y: -80, duration: 1 }, 0)
                    .fromTo(select(".cab-passenger"), { x: -18, y: -10, rotation: -2 }, {
                        x: 0, y: 0, rotation: 0, duration: 0.65, ease: "power1.inOut",
                    }, 0.2)
                    .fromTo(select(".cab-door"), { rotationY: -34, rotation: -3 }, {
                        rotationY: -8, rotation: 0, duration: 0.7, ease: "power1.inOut",
                    }, 0.1)
                    .fromTo(select(".cab-body"), { y: 2 }, { y: 0, duration: 0.5 }, 0.4);

                // Hold the scene; make space for copy, reveal the five rows,
                // then leave a reading beat before normal scrolling resumes.
                const reveal = gsap.timeline({
                    defaults: { ease: "none" },
                    scrollTrigger: {
                        id: "services-reveal", trigger: stage,
                        start: "top top", end: () => `+=${height() * 1.45}`,
                        pin: true, scrub: true, anticipatePin: 1,
                        invalidateOnRefresh: true,
                    },
                });
                reveal.fromTo(rider, {
                    x: centerX, y: centerY, scale: 1, rotation: -2,
                }, {
                    x: endX, y: endY, scale: endScale, rotation: 0,
                    duration: 0.35, immediateRender: false, ease: "power1.inOut",
                }, 0.08)
                    .fromTo(content, { autoAlpha: 0, y: 28 }, {
                        autoAlpha: 1, y: 0, duration: 0.16, ease: "power2.out",
                    }, 0.35)
                    .to(rows, { opacity: 1, y: 0, stagger: 0.065, duration: 0.14, ease: "power2.out" }, 0.43)
                    .to(select(".services-stage__orbit"), { rotation: -35, y: -35, duration: 0.8 }, 0)
                    .to(select(".services-stage__halo"), { scale: 1.12, duration: 0.8 }, 0)
                    .to({}, { duration: 0.22 });

                const ambient = gsap.timeline({ paused: true, repeat: -1, yoyo: true });
                ambient.to(select(".services-disc"), { rotation: 22, duration: 5, ease: "sine.inOut" }, 0)
                    .to(select(".services-star"), { rotation: -18, y: -8, duration: 5, ease: "sine.inOut" }, 0)
                    .to(select(".campus-palm--back"), { rotation: 2, duration: 5, ease: "sine.inOut" }, 0)
                    .to(select(".campus-palm--front"), { rotation: -2, duration: 4.5, ease: "sine.inOut" }, 0);
                ScrollTrigger.create({
                    trigger: story, start: "top bottom", end: "bottom top",
                    onToggle: (self) => self.isActive ? ambient.play() : ambient.pause(),
                    onRefresh: (self) => self.isActive ? ambient.play() : ambient.pause(),
                });
                return () => story.classList.remove("services--animated");
            }, story);
            ScrollTrigger.refresh();
        });

        document.fonts?.ready.then(() => { if (!disposed) ScrollTrigger.refresh(); });
        return () => {
            disposed = true;
            cancelAnimationFrame(frame);
            media.revert();
            story.classList.remove("services--animated");
        };
    }, []);

    return (
        <section className="services-hero" ref={storyRef} aria-labelledby="services-heading">
            <div className="services-intro">
                <div className="services-intro__grid" aria-hidden="true" />
                <div className="services-intro__meta">
                    <p>{tr("A ride for every kind of day")}</p>
                    <span aria-hidden="true">RCS / 05</span>
                </div>
                <h1 id="services-heading" className="services-intro__title">
                    <span>{tr("A ride for wherever")}</span>
                    <span className="services-title-sticker">{tr("you're headed")}</span>
                </h1>
                <SunCutout className="services-disc" />
                <StarCutout className="services-star services-intro__star" />
                <OrbitCutout className="services-intro__orbit" />
                <div className="services-campus-wrap" aria-hidden="true">
                    <div className="services-campus__sun" />
                    <CampusScene className="services-campus" />
                </div>
                <span className="services-scroll-cue" aria-hidden="true">↓</span>
            </div>
            <div className="services-journey">
                <div className="services-stage">
                    <div className="services-stage__stripes" aria-hidden="true" />
                    <div className="services-stage__halo" aria-hidden="true" />
                    <OrbitCutout className="services-stage__orbit" />
                    <div className="services-rider" aria-hidden="true">
                        <div className="services-rider__float">
                            <div className="services-rider__grid" />
                            <CabScene />
                            <StarCutout className="services-rider__star services-star" />
                            <BoltCutout className="services-rider__bolt" />
                        </div>
                    </div>
                    <div className="services-use-cases" aria-labelledby="services-use-cases-title">
                        <p className="services-use-cases__kicker">RCS / 05</p>
                        <h2 id="services-use-cases-title">{tr("A ride for every kind of day")}</h2>
                        <ol>
                            {rideCases.map((item, index) => (
                                <li className="services-use-case" key={item.id}>
                                    <span className="services-use-case__number" aria-hidden="true">0{index + 1}.</span>
                                    <span className="services-use-case__copy">
                                        <strong>{tr(item.title)}</strong>
                                        <span>{tr(item.context)}</span>
                                    </span>
                                </li>
                            ))}
                        </ol>
                    </div>
                </div>
            </div>
        </section>
    );
}

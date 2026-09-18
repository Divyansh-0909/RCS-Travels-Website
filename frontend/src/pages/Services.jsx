import { useLayoutEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useWebsiteCopy } from "../hooks/useWebsiteCopy";
import {
    CabExitIllustration,
    CampusCutout,
    SunCutout,
} from "../components/services/ServicesSceneIllustrations";
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

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const ctx = gsap.context(() => {
            const rider = story.querySelector(".services-rider-figure");
            const useCases = story.querySelector(".services-use-cases");
            const useCaseRows = story.querySelectorAll(".services-use-case");
            const headline = story.querySelector(".services-scene__headline");
            const campus = story.querySelector(".services-campus");
            const sun = story.querySelector(".services-sun");

            if (reducedMotion) {
                gsap.set([useCases, useCaseRows], { autoAlpha: 1, y: 0 });
                gsap.set(rider, { x: 0, y: 0, scale: 0.92, rotation: 0 });
                return;
            }

            const timeline = gsap.timeline({
                defaults: { ease: "none" },
                scrollTrigger: {
                    trigger: story,
                    start: "top top",
                    end: "bottom bottom",
                    scrub: 1.05,
                    invalidateOnRefresh: true,
                },
            });

            timeline
                .fromTo(
                    rider,
                    { x: 0, y: 0, scale: 1, rotation: -1.5 },
                    {
                        x: () => window.innerWidth < 768 ? window.innerWidth * 0.88 : window.innerWidth * 0.54,
                        y: () => window.innerWidth < 768 ? window.innerHeight * -0.2 : window.innerHeight * -0.31,
                        scale: () => window.innerWidth < 768 ? 0.62 : 0.84,
                        rotation: 1,
                        duration: 1,
                    },
                    0,
                )
                .to(headline, { y: -18, scale: 0.96, duration: 0.72 }, 0)
                .to(campus, { x: 42, y: 12, rotation: 1.2, duration: 1 }, 0)
                .to(sun, { x: 26, y: -16, rotation: 13, duration: 1 }, 0)
                .fromTo(
                    useCases,
                    { autoAlpha: 0, y: 54 },
                    { autoAlpha: 1, y: 0, duration: 0.2, ease: "power2.out" },
                    0.47,
                )
                .fromTo(
                    useCaseRows,
                    { autoAlpha: 0, y: 24 },
                    { autoAlpha: 1, y: 0, stagger: 0.045, duration: 0.18, ease: "power2.out" },
                    0.5,
                );
        }, story);

        return () => ctx.revert();
    }, []);

    return (
        <section className="services-hero" aria-labelledby="services-heading">
            <div className="services-story" ref={storyRef}>
                <div className="services-scene">
                    <div className="services-scene__grid" aria-hidden="true" />

                    <p className="services-scene__eyebrow">{tr("A ride for every kind of day")}</p>
                    <p className="services-scene__counter" aria-hidden="true">RCS / 05</p>

                    <h1 id="services-heading" className="services-scene__headline">
                        <span className="services-title-line services-title-line--primary">{tr("A ride for wherever")}</span>
                        <span className="services-title-line services-title-line--accent">{tr("you're headed")}</span>
                    </h1>

                    <SunCutout className="services-sun" />
                    <CampusCutout className="services-campus" />

                    <div className="services-rider-figure" aria-hidden="true">
                        <CabExitIllustration />
                    </div>

                    <div className="services-use-cases" aria-labelledby="services-use-cases-title">
                        <p className="services-use-cases__kicker">{tr("Wherever the day takes you")}</p>
                        <h2 id="services-use-cases-title">{tr("One ride. Every kind of day.")}</h2>
                        <ol>
                            {rideCases.map((item, index) => (
                                <li className="services-use-case" key={item.id}>
                                    <span className="services-use-case__number" aria-hidden="true">0{index + 1}</span>
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

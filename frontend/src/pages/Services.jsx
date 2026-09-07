import { useTranslation as useCopyLanguage } from "react-i18next";
import { websiteCopy as dc } from "../i18nCopy";
import { useRef, useState } from "react";
import campus from "../assets/services/campus.webp";
import airport from "../assets/services/airport.webp";
import exams from "../assets/services/exams.webp";
import night from "../assets/services/night.webp";
import shared from "../assets/services/shared.webp";
import "./Services.css";
import { useWebsiteCopy } from "../hooks/useWebsiteCopy";

const services = [
    { id: "campus", get "title"() { return dc("Campus runs"); }, context: "Your everyday, sorted.", image: campus, get "description"() { return dc("Plan your college commute ahead, from the first lecture to the ride home."); } },
    { id: "airport", get "title"() { return dc("Airport days"); }, context: "Doorstep to departures.", image: airport, get "description"() { return dc("Schedule your pickup or drop, with the fare shown before booking."); } },
    { id: "exams", get "title"() { return dc("Big days"); }, context: "Exams. Interviews. New beginnings.", image: exams, get "description"() { return dc("Book ahead for the mornings that matter, from exams to interviews."); } },
    { id: "night", get "title"() { return dc("After hours"); }, context: "One more stop. Then home.", image: night, get "description"() { return dc("Share your live trip link and choose a safer route when one is available."); } },
    { id: "shared", get "title"() { return dc("Better together"); }, context: "Same direction? Share the journey.", image: shared, get "description"() { return dc("Choose a shared ride and pay the lower fare when a matching co-rider joins."); } },
];

export default function Services() {
    useCopyLanguage();
    const tr = useWebsiteCopy();
    const [activeIndex, setActiveIndex] = useState(0);
    const touchStart = useRef(null);
    const service = services[activeIndex];
    const move = (step) => setActiveIndex(index => (index + step + services.length) % services.length);

    return (
        <section className="services-hero" aria-labelledby="services-heading">
            <header className="services-intro">
                <h1 id="services-heading">{tr("A ride for wherever")} <span>{tr("you're headed")}</span></h1>
            </header>
            <div className="services-carousel" role="region" aria-roledescription="carousel"
                aria-label={tr("Explore our rides")} tabIndex={0}
                onKeyDown={event => {
                    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
                        event.preventDefault();
                        move(event.key === "ArrowRight" ? 1 : -1);
                    }
                }}
                onTouchStart={event => {
                    const touch = event.touches[0];
                    touchStart.current = { x: touch.clientX, y: touch.clientY };
                }}
                onTouchEnd={event => {
                    if (!touchStart.current) return;
                    const touch = event.changedTouches[0];
                    const dx = touch.clientX - touchStart.current.x;
                    const dy = touch.clientY - touchStart.current.y;
                    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
                    touchStart.current = null;
                }}
                onTouchCancel={() => { touchStart.current = null; }}>
                <div className="services-carousel-topline">
                    <p>{tr("A ride for every kind of day")}</p>
                    <span aria-hidden="true">0{activeIndex + 1} / 0{services.length}</span>
                </div>
                <div className="services-slide-stage">
                    <button className="services-arrow services-arrow--previous" type="button"
                        aria-label={tr("Previous ride")} onClick={() => move(-1)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
                    </button>
                    <article key={service.id} className="services-slide" role="group"
                        aria-roledescription="slide" aria-label={dc("{{value0}} of {{value1}}: {{value2}}", {value0: (activeIndex + 1), value1: (services.length), value2: (service.title)})}>
                        <h2>{tr(service.title)}</h2>
                        <div className="services-slide-art">
                            <img src={service.image} alt="" width="800" height="800" decoding="async" />
                        </div>
                        <p className="services-slide-context">{tr(service.context)}</p>
                        <p className="services-slide-description">{tr(service.description)}</p>
                    </article>
                    <button className="services-arrow services-arrow--next" type="button"
                        aria-label={tr("Next ride")} onClick={() => move(1)}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
                    </button>
                </div>
                <div className="services-pagination" aria-label={tr("Choose a ride")}>
                    {services.map((item, index) => (
                        <button key={item.id} type="button" aria-label={dc("Show {{value0}}", {value0: (item.title)})}
                            aria-current={activeIndex === index ? "true" : undefined}
                            onClick={() => setActiveIndex(index)}>
                            <span />
                        </button>
                    ))}
                </div>
                <p className="services-sr-only" role="status" aria-live="polite" aria-atomic="true">
                            {tr(service.title)}. {tr("Slide")} {activeIndex + 1} {tr("of")} {services.length}.
                </p>
            </div>
        </section>
    );
}

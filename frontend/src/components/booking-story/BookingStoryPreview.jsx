import { useState } from 'react';
import { Link } from 'react-router-dom';
import BookingStory from './BookingStory';
import BrandWordmark from '../ui/BrandWordmark';

export default function BookingStoryPreview({ initialProgress = null }) {
    const [progress, setProgress] = useState(initialProgress);
    const [animate, setAnimate] = useState(true);
    return <main className="booking-illustration-preview">
        <header className="booking-preview-toolbar">
            <Link to="/dev/hero"><BrandWordmark size="text-xl" /></Link>
            <span>Booking illustration preview</span>
            <button type="button" onClick={() => setAnimate(value => !value)} aria-pressed={!animate}>{animate ? 'Disable screen fade' : 'Enable screen fade'}</button>
        </header>
        <div className="booking-preview-controls" role="group" aria-label="Preview booking steps">
            {[['1 · Trip', 0], ['2 · Choose', .26], ['3 · Confirm', .51], ['4 · Driver', .76]].map(([label, value]) => <button type="button" key={label} aria-pressed={progress === value} onClick={() => setProgress(value)}>{label}</button>)}
            <button type="button" aria-pressed={progress === null} onClick={() => setProgress(null)}>Scroll preview</button>
        </div>
        <BookingStory fixedProgress={progress} animate={animate} />
        <div className="booking-preview-notes"><p>Reference-traced SVG · four light-mode booking screens · scroll-driven step changes</p><p>Small screens and reduced motion show every illustration in reading order.</p></div>
    </main>;
}

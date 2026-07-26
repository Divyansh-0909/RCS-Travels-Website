/* Every route's <title> and meta description, in one place so the wording stays
   consistent and can be reviewed without opening a dozen page components.
   Applied by usePageMeta().

   Conventions, so new entries match the ones already here:
   - "<What you do here> | RCS Travels", Title Case, under ~60 characters.
     Past that Google truncates mid-word — Ola's home title runs 71 and Rapido's
     description 228, and both get cut off in results.
   - Descriptions are second person and lead with what the rider gets, in the
     same plain voice as the FAQ and the landing sections. 100-155 characters.
   - No city or region names. The service area will grow, and copy that has to
     be rewritten when it does is copy that quietly goes stale.
   - `noindex` marks pages behind auth or belonging to one person's account.
     They still get a title, which is what the tab, the history list, and a
     bookmark show. */

export const SITE_NAME = "RCS Travels"

/* Any path with no entry below is, by definition, a URL that doesn't exist —
   every real route is listed here, and the catch-all renders NotFound. A new
   route added before its copy is written lands here too, which is a loud enough
   signal to notice in the tab. */
export const defaultMeta = {
    title: "Page Not Found | RCS Travels",
    description: "This page doesn't exist. Head back to the home page to book a ride.",
    noindex: true,
}

export const pageMeta = {
    "/": {
        title: "Ride Days Ahead at a Fixed Fare | RCS Travels",
        description:
            "Lock in your ride and your fare up to 7 days before you travel. No surge pricing, drivers we vet ourselves, and you pay at the end of the trip.",
    },
    "/help": {
        title: "Help & Support | RCS Travels",
        description:
            "Questions about fares, drivers, or cancelling a booking? The answers are here, or message us on WhatsApp and we'll pick it up.",
    },
    "/login": {
        title: "Log In | RCS Travels",
        description:
            "Enter your phone number to pick up where you left off: book a ride, follow one that's on its way, or revisit an old trip.",
    },
    "/signup": {
        title: "Create Your Account | RCS Travels",
        description:
            "Sign up with your phone number and book your first ride in a couple of minutes. No passwords, no card details.",
    },

    /* Legal pages stay indexable on purpose. They're the pages people look for
       before trusting a service with a phone number, and the ones a payment
       gateway or a consumer forum will ask for a public URL to. */
    "/terms": {
        title: "Terms of Service | RCS Travels",
        description:
            "What you agree to when you book: how fares are fixed, when you pay, what we're responsible for, and what we expect on board.",
    },
    "/privacy": {
        title: "Privacy Policy | RCS Travels",
        description:
            "What we hold about you, exactly what your driver sees, who else it reaches, and how to download or delete all of it.",
    },
    "/refunds": {
        title: "Refunds & Cancellation | RCS Travels",
        description:
            "Cancelling is free until your driver reaches you. Here's what happens after that, and when a ride costs you nothing at all.",
    },
    "/grievance": {
        title: "Grievance Redressal | RCS Travels",
        description:
            "Something gone wrong? Reach our grievance officer, see how long we'll take to fix it, and where to escalate if we don't.",
    },

    /* Behind auth from here down — kept out of search, but the titles still do
       real work in the tab bar and browser history. */
    "/book": {
        title: "Book a Ride | RCS Travels",
        description:
            "Tell us where you're going and when, pick your vehicle, and see exactly what the trip costs before you confirm.",
        noindex: true,
    },
    "/booking": {
        title: "Your Ride | RCS Travels",
        description:
            "Watch your driver make their way to you, with their name, number, and vehicle, and call or cancel from the same place.",
        noindex: true,
    },
    "/manage-account": {
        title: "Manage Account | RCS Travels",
        description:
            "Your details, your ride history, and everything we hold about you, in one place you can edit or download.",
        noindex: true,
    },
    "/settings": {
        title: "Settings | RCS Travels",
        description:
            "Pick your language, choose which ride updates reach you, and save the places you travel to most.",
        noindex: true,
    },
    "/safety": {
        title: "Safety | RCS Travels",
        description:
            "Add an emergency contact, share a live trip with someone you trust, and reach our helpline without leaving the ride.",
        noindex: true,
    },
    "/dashboard": {
        title: "Admin Dashboard | RCS Travels",
        description: "Live fleet, bookings, and driver activity for RCS Travels staff.",
        noindex: true,
    },
    "/dev": {
        title: "Dev Preview | RCS Travels",
        description: "Development-only previews of auth-gated screens.",
        noindex: true,
    },
}

/* Exact match first, then longest matching prefix, so `/booking/:id` and
   `/dev/:view` inherit their parent's copy instead of falling through to the
   default. */
export function metaForPath(pathname) {
    const path = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
    if (pageMeta[path]) return pageMeta[path]

    const prefix = Object.keys(pageMeta)
        .filter(key => key !== "/" && path.startsWith(key + "/"))
        .sort((a, b) => b.length - a.length)[0]

    return prefix ? pageMeta[prefix] : defaultMeta
}

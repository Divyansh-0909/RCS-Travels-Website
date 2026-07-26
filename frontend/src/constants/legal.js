/* Every word of the four legal documents, kept out of the JSX so the copy can be
   edited (and handed to a lawyer) without touching layout code — same reason the
   FAQ list sits at the top of HelpPage.

   ── READ BEFORE PUBLISHING ────────────────────────────────────────────────────
   This is a DRAFT written from what the code actually does, not legal advice.
   Two things must happen before it goes live:

   1. Replace every `[TO CONFIRM: …]` marker. They are deliberately loud and they
      render on the page, so nothing ships half-filled. `grep "TO CONFIRM"` finds
      all of them.
   2. Have a lawyer review it, then set DRAFT = false to drop the banner.

   Where a clause depends on a decision only the owner can make (are we the
   carrier or an intermediary? what happens on a rider no-show?) the marker says
   so instead of guessing — a wrong guess in those places is the expensive kind.

   Facts below are pulled from the implementation, so if the implementation
   changes, this file is part of the change:
     - what a driver receives          → routes/driver.js (the accept response)
     - what deletion erases            → routes/users.js  (DELETE /me)
     - what we store about a rider     → prisma/schema.prisma (User, Booking)
     - the safer-route add-on          → constants/fares.js
     - the cancellation percentages    → HelpPage's cancellationPolicy
   Keep those five in step with these documents. */

export const DRAFT = true

export const LEGAL_UPDATED = "[TO CONFIRM: effective date — the day the lawyer signs off]"

/* One place for the details that repeat across all four documents. Every one of
   these is a fact about the business that the code cannot tell us. */
export const entity = {
    name: "[TO CONFIRM: registered business name]",
    type: "[TO CONFIRM: sole proprietorship / partnership / private limited company]",
    address: "[TO CONFIRM: full registered address with PIN code]",
    gstin: "[TO CONFIRM: GSTIN, or delete this line if not registered]",
    jurisdiction: "[TO CONFIRM: courts of <city> — usually where the business is registered]",
    grievanceOfficer: "[TO CONFIRM: Grievance Officer's full name]",
    grievanceDesignation: "[TO CONFIRM: designation, e.g. Proprietor]",
    grievanceEmail: "[TO CONFIRM: grievance email — a domain address reads better than gmail]",
    grievancePhone: "[TO CONFIRM: grievance phone number and the hours it is answered]",
}

/* ── Terms of Service ──────────────────────────────────────────────────────── */

const terms = [
    {
        heading: "Who we are",
        body: [
            `RCS Travels is a cab service run by ${entity.name}, a ${entity.type} registered at ${entity.address}. In these terms, "we", "us" and "RCS Travels" mean that business, and "you" means the person booking or taking a ride.`,
            `We arrange rides between you and independent driver-partners who own and drive their own vehicles. We are not the transport operator: we verify our driver-partners, set the fare, and take a commission on each completed ride, but the driver, not us, carries you. [TO CONFIRM: this framing decides where liability sits and must be confirmed with the lawyer before publishing. If the business owns the vehicles or employs the drivers, this clause and "Our responsibility, and its limits" below both have to be rewritten.]`,
            "By booking a ride — on this website or over WhatsApp — you agree to these terms. If you don't agree with them, please don't use the service.",
        ],
    },
    {
        heading: "Who can book",
        body: [
            "You need to be 18 or older to hold an account. Anyone younger is welcome to travel, but an adult has to make the booking and travel with them.",
        ],
        list: [
            "Use your own phone number, and one that reaches you — your driver calls it on the day.",
            "One account per phone number.",
            "Book only for yourself or for someone who knows you're booking on their behalf.",
        ],
    },
    {
        heading: "Your account",
        body: [
            "You sign in with your phone number and a one-time code we send you. There's no password to remember, which also means anyone holding your phone can reach your account — so treat your phone and the codes we send as yours alone.",
            "You also get a four-digit booking code when you sign up. It stays the same and it identifies your bookings to us and to your driver. Don't share it with anyone you wouldn't hand your booking to.",
            "Everything you tell us should be accurate. We may suspend or close an account that carries false details, that's used to book rides that never get taken, or that's used to abuse a driver-partner.",
        ],
    },
    {
        heading: "Booking a ride",
        body: [
            "You can book from 30 minutes and up to 7 days ahead of your pickup time, and on-spot too if there's a driver near you.",
        ],
        list: [
            "A booking is a request until we confirm it. Confirmation depends on a driver being available for that time and route.",
            "You can have one active ride at a time. Finish or cancel the ride you have before booking the next one.",
            "Your driver's name, phone number and vehicle number appear on your ride's tracking page about an hour before pickup.",
            "Choose a 4-seater or a 6-seater, travel alone or share the fare with co-riders on your route, and pick an outstation trip when you're leaving the city.",
            "Pickup times are the time we aim to reach you, not a promise. Traffic, weather and the road decide the rest.",
        ],
    },
    {
        heading: "Fares",
        body: [
            "You see the full fare before you confirm, and that's the fare you pay. We price by destination and vehicle rather than by meter, so it doesn't move with demand and there is no surge.",
            "Some things are added to the fare, and you'll see each of them on the fare screen before you confirm:",
        ],
        list: [
            "The safer route, if you choose it — a flat ₹150.",
            "Tolls, state permits and parking on the route.",
            "A roof carrier, if your luggage needs one.",
            "Round trips, priced as a single booking rather than two.",
        ],
        after: [
            `The fare can change after you book only if the ride itself changes: a different drop point, an extra stop, or waiting beyond the free waiting time. [TO CONFIRM: the free waiting time in minutes, and the per-minute or per-hour charge after it. The app does not calculate this today, so whatever you decide has to be told to drivers as well as written here.]`,
            "If a driver ever asks you for more than the fare on your tracking page, don't pay it — call us instead.",
        ],
    },
    {
        heading: "Paying",
        body: [
            "You pay your driver directly at the end of the trip, in cash or by UPI. Nothing is charged up front, we never ask for card details, and we don't store any payment information at all.",
            "The amount is exactly the fare shown when you booked, plus anything added during the ride under the section above. Ask your driver for a receipt if you need one, or download your ride history from Manage Account.",
        ],
    },
    {
        heading: "Shared rides",
        body: [
            "On a shared ride you travel with co-riders going the same way and each of you pays less than the solo fare. In exchange, the trip takes longer: we pick riders up in an order that suits the route, and yours may not be first.",
            "Your co-riders are strangers to you and to us beyond their own booking. Everything under \"How we expect everyone to behave\" applies to them as much as to you — if it doesn't, tell us and we'll act on it.",
        ],
    },
    {
        heading: "The safer route",
        body: [
            "On some routes you can ask for a longer, lit highway route instead of the shortest one, for a flat ₹150. It exists because the quickest way to and from the university runs through stretches that riders travelling alone at night would rather avoid.",
            "It's a route preference, not a security service. Choosing it means your driver takes the highway; it does not mean we can guarantee your safety on the road, and we don't want you relying on it as if we could. Add an emergency contact in Safety, and call us or 112 the moment something feels wrong.",
        ],
    },
    {
        heading: "Cancelling",
        body: [
            "Cancelling is free until your driver reaches your pickup point, and costs 35% of the fare after that. If your driver cancels or never arrives, you pay nothing. The full policy, including what happens when no driver can be found, is on the Refunds & Cancellation page.",
        ],
    },
    {
        heading: "How we expect everyone to behave",
        body: [
            "A ride is somebody's workplace and somebody else's journey. Both deserve the same courtesy.",
        ],
        list: [
            "Wear a seatbelt. Ask children's adults to hold them properly.",
            "No smoking, no alcohol, and no drugs in the vehicle.",
            "Nothing illegal, hazardous or live in the luggage.",
            "Don't ask a driver to break a traffic rule or carry more people than the vehicle seats.",
            "Threatening, harassing or abusing a driver ends the ride and the account.",
        ],
        after: [
            `If the vehicle is damaged or badly soiled during your ride, you'll be asked to cover the cleaning or repair. [TO CONFIRM: a flat cleaning charge, or "at actuals against a receipt"? Pick one — an unspecified charge is unenforceable and invites arguments at the roadside.]`,
        ],
    },
    {
        heading: "Our driver-partners",
        body: [
            "Every driver-partner gives us their driving licence and Aadhaar before their first ride, and we check both. We don't put a driver on the road with documents we haven't seen.",
            "They remain independent contractors who choose their own hours and drive their own vehicles. We're responsible for whom we let onto the platform and for acting when something goes wrong; we're not their employer.",
        ],
    },
    {
        heading: "Things neither of us controls",
        body: [
            "Traffic, weather, road closures, breakdowns, protests, strikes, network outages and acts of government all affect rides, and none of them are within our control or yours. When one of them delays or ends a ride, we'll help you rebook and won't charge you for a ride you didn't take.",
        ],
    },
    {
        heading: "Our responsibility, and its limits",
        body: [
            "We're responsible for running the service honestly: quoting the fare we charge, verifying our driver-partners, and answering you when something goes wrong.",
            `Where the law allows us to limit what we owe you, our liability for any one ride is limited to the fare for that ride, and we're not liable for indirect losses — a missed flight, exam, interview or connection — arising from a delayed or cancelled ride. Nothing here limits liability that cannot be limited by law, including for death or personal injury caused by negligence, or your rights under the Consumer Protection Act, 2019. [TO CONFIRM: this is the clause most worth the lawyer's time. A cab service carrying students to and from trains and flights will be tested on exactly this, and a cap the court won't enforce is worse than no cap.]`,
        ],
    },
    {
        heading: "Things left behind",
        body: [
            "Tell us as soon as you notice, with your ride date and time, and we'll contact the driver and try to get your belongings back to you. We can't promise to recover them, and we're not responsible for what's left in a vehicle.",
        ],
    },
    {
        heading: "Closing your account",
        body: [
            "You can delete your account from Manage Account whenever you like, except while a ride is live — finish or cancel that ride first. What deletion erases and what we have to keep is set out in the Privacy Policy.",
            "We may suspend or close an account for the reasons listed in these terms. Where we can, we'll tell you why.",
        ],
    },
    {
        heading: "Changes to these terms",
        body: [
            `We'll update these terms as the service changes. The date at the top always shows the current version, and we'll flag anything significant in the app before it takes effect. Rides you book after a change are covered by the version in force that day.`,
        ],
    },
    {
        heading: "Which law applies",
        body: [
            `These terms are governed by the laws of India, and the ${entity.jurisdiction} have exclusive jurisdiction over any dispute arising from them.`,
            "Before it gets that far, please use the Grievance Redressal page. Nearly everything is resolved there.",
        ],
    },
]

/* ── Privacy Policy ────────────────────────────────────────────────────────── */

const privacy = [
    {
        heading: "What this covers",
        body: [
            `This policy covers everything you do with RCS Travels — the website and the WhatsApp booking chat. ${entity.name} decides how your data is handled and is answerable for it.`,
            "It's written to be read, not to be survived. If anything here is unclear, ask us and we'll explain it.",
        ],
    },
    {
        heading: "Two things we don't do",
        body: [
            "Both of these are worth saying before the detail, because they're the questions people actually have.",
        ],
        list: [
            "We never see your payment details. You pay your driver directly in cash or by UPI, so there's no card, no wallet and no transaction of ours to store.",
            "We don't track where you are between rides. The moving vehicle on your tracking page is your driver's location, sent from their phone. We hold the pickup and drop points you typed in — not a trail of your movements.",
        ],
        after: [
            `[TO CONFIRM: the "Share my live location" toggle on the Safety page is not wired to anything yet. Either wire it and describe it here as a rider-location feature, or remove the toggle. Right now the toggle promises something this paragraph correctly denies, and that gap is exactly what a regulator reads first.]`,
        ],
    },
    {
        heading: "What we hold, and why",
        list: [
            "Your phone number — to sign you in, to send your one-time codes, to give your driver a way to reach you on the day, and to send ride updates. It's the one thing we can't run the service without.",
            "Your name, if you give it — so we can address you properly and your driver knows who they're picking up.",
            "Your gender, if you give it — to offer the safer route and any women-specific option to the riders they're meant for.",
            "Your date of birth, if you give it — to confirm you're old enough to hold an account. [TO CONFIRM: if DOB is used for anything else, say so; if it isn't used at all, the honest fix is to stop asking for it. Collecting data with no stated purpose is the thing DPDP is least forgiving about.]",
            "Your emergency contact, if you add one — held so it's there when it's needed. We don't contact them during an ordinary ride.",
            "Your pickup and drop addresses and their coordinates — to work out the route and the fare, and to get your driver to you.",
            "Your ride records — where and when you travelled, the vehicle, the fare, and whether the ride finished or was cancelled. This is what your ride history, your receipts and any fare dispute are built from.",
            "Your WhatsApp number and where you'd got to in a WhatsApp booking — so the chat can pick up where it left off.",
            "A theme preference and a sign-in session, stored in your own browser.",
            "[TO CONFIRM: server logs. The backend almost certainly records IP addresses and request paths through its host. Confirm what Render retains and for how long, then describe it here in one line — undeclared logging is the most common thing found in an audit.]",
        ],
    },
    {
        heading: "Who your data reaches",
        body: [
            "Your driver gets what they need to drive you and nothing more. When a driver accepts your ride, they receive:",
        ],
        list: [
            "your pickup and drop addresses and coordinates,",
            "the pickup time, the vehicle type and the fare,",
            "and your phone number.",
        ],
        after: [
            "They do not get your name, your gender, your date of birth, your emergency contact or your past rides.",
            "Beyond your driver, your data reaches: our own staff, through an internal dashboard used to run bookings and support; the companies that run parts of the service for us — Clerk for sign-in, Google Maps, Routes and Places for addresses and routing, the WhatsApp Business platform for messages and codes, and our database and hosting providers; and the authorities, where the law requires it of us.",
            "We do not sell your data, and we don't hand it to advertisers.",
            `[TO CONFIRM: on a shared ride, what does a co-rider see about you? If they only ever see a pickup area, say so here — riders will assume the worst otherwise.]`,
        ],
    },
    {
        heading: "How long we keep it",
        body: [
            "Your account details stay until you delete your account. One-time codes expire within minutes. An abandoned WhatsApp booking clears itself.",
            `Completed ride records outlive the account, because tax and accounting rules require us to keep records of what we billed. [TO CONFIRM: the retention period your accountant applies — commonly 8 years. State the number here rather than "as long as necessary", which tells the reader nothing.]`,
        ],
    },
    {
        heading: "What you can do with your data",
        body: [
            "All of this is in Manage Account, and none of it needs you to ask us first:",
        ],
        list: [
            "See and correct your profile — name, gender, date of birth, emergency contact.",
            "Download everything we hold about you, profile and full ride history, as a PDF.",
            "Delete your account.",
        ],
        after: [
            "You can also withdraw consent for anything optional by clearing that field, and you can complain to our Grievance Officer, or to the Data Protection Board of India, if you think we've mishandled your data.",
        ],
    },
    {
        heading: "What deleting your account actually does",
        body: [
            "It's worth being exact about this, because \"delete\" is a word a lot of services stretch.",
            "When you delete your account we erase your name, gender, date of birth, emergency contact and WhatsApp number, retire your phone number and booking code so nothing links back to you, and delete your sign-in with Clerk. You can't sign in again, and we can't restore it.",
            `Your completed ride records stay, for the tax reason above, without your profile attached to them. [TO CONFIRM: this sentence is currently not quite true — the phone number saved on each booking is not cleared when an account is deleted, so those records remain linked to you. Clear it in the deletion path (routes/users.js, DELETE /me) and this paragraph becomes accurate. Until that's fixed, this page is describing something the code doesn't do.]`,
            "You can't delete your account while a ride is live. Finish or cancel it first.",
        ],
    },
    {
        heading: "Children",
        body: [
            "Accounts are for adults. We don't knowingly collect anything about children, and if you tell us we have, we'll delete it.",
        ],
    },
    {
        heading: "Keeping it safe",
        body: [
            "Traffic to us is encrypted, one-time codes are stored hashed rather than in the clear, and access to rider data is limited to the staff who need it to do support.",
            "No service can promise it will never be breached. If one ever affects your data, we'll tell you and the authorities as the law requires, and we'll tell you what to do about it.",
        ],
    },
    {
        heading: "Changes to this policy",
        body: [
            "When what we collect or who we share it with changes, this page changes with it, and the date at the top moves. Significant changes get flagged in the app rather than quietly published.",
        ],
    },
]

/* ── Refunds & Cancellation ────────────────────────────────────────────────── */

const refunds = [
    {
        heading: "Start here: nothing is prepaid",
        body: [
            "You pay your driver at the end of the trip, in cash or by UPI. Nothing is collected when you book. So in almost every case there's nothing to refund — a cancelled ride is simply a ride you never pay for.",
            "The exceptions are below.",
        ],
    },
    {
        heading: "Cancelling before your driver reaches you",
        body: [
            "Free, every time, no reason needed. That covers a ride that's still pending, one that's confirmed for later, and one where the driver is on the way.",
        ],
    },
    {
        heading: "Cancelling after your driver reaches you",
        body: [
            "Once your driver is at the pickup point, cancelling costs 35% of the fare. Your driver has already spent the fuel and the time to get to you, and that's what this covers.",
            `[TO CONFIRM: how this is actually collected. Nothing is prepaid, so there's no payment to deduct it from. Is it paid to the driver on the spot, added to your next ride, or waived in practice? The policy can't be published without an answer, and whatever it is, drivers need to be told the same thing.]`,
        ],
    },
    {
        heading: "If your driver cancels or doesn't arrive",
        body: [
            "You pay nothing, and we'll find you another ride. Tell us and we'll do it straight away rather than leaving you to rebook.",
        ],
    },
    {
        heading: "If we can't find a driver",
        body: [
            "Sometimes a search ends without a driver, particularly late at night or far out. You'll see that on your booking, you're charged nothing, and you're free to book again for another time.",
        ],
    },
    {
        heading: "If you're charged the wrong fare",
        body: [
            "The fare on your tracking page is the fare. If a driver charged you more than that, or you paid for a ride that never happened, tell us with the date and time of the ride and we'll look at it against our own record of that booking.",
            `Where you've overpaid, we return the difference by UPI to the number you booked with. [TO CONFIRM: the timeline you're willing to commit to — 7 working days is the usual promise. Say a number; "as soon as possible" is what people complain about.]`,
        ],
    },
    {
        heading: "If you don't turn up",
        body: [
            `[TO CONFIRM: what happens when a driver waits at the pickup point and the rider never appears. Treated as a post-arrival cancellation at 35%? Free the first time? This case comes up constantly and drivers will ask, so decide it before publishing rather than at the roadside.]`,
        ],
    },
    {
        heading: "How to cancel",
        body: [
            "Use the cancel option on your ride's tracking page, or call us and we'll do it for you. Cancelling by telling the driver isn't enough on its own — the booking stays open in our system until it's cancelled there.",
        ],
    },
]

/* ── Grievance Redressal ───────────────────────────────────────────────────── */

const grievance = [
    {
        heading: "Try support first",
        body: [
            "Most problems — a fare that looks wrong, a driver who didn't arrive, something left in a vehicle — are sorted the same day by calling or messaging us. Start there. This page is for when that hasn't worked, or when what happened is serious enough to be put on record.",
        ],
    },
    {
        heading: "If something happened during a ride, don't wait",
        body: [
            "For anything involving your safety, call 112 first and us immediately after. Complaints have a process and a timeline; an incident in progress doesn't get one.",
        ],
    },
    {
        heading: "Our Grievance Officer",
        body: [
            "Under the Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021, we name a person who is answerable for complaints. They are:",
        ],
        list: [
            `Name — ${entity.grievanceOfficer}`,
            `Designation — ${entity.grievanceDesignation}`,
            `Email — ${entity.grievanceEmail}`,
            `Phone — ${entity.grievancePhone}`,
            `Address — ${entity.address}`,
        ],
        after: [
            "The same officer handles complaints about your personal data.",
        ],
    },
    {
        heading: "What we do, and by when",
        list: [
            "We acknowledge your complaint within 48 hours of receiving it.",
            "We resolve it within 30 days, and sooner where we can.",
            "We tell you the outcome, and what we did about it, on the number or email you complained from.",
        ],
    },
    {
        heading: "What to send us",
        body: [
            "The more of this you include, the faster it moves:",
        ],
        list: [
            "the phone number your account is registered with,",
            "the date and time of the ride, and where you were going,",
            "your driver's name or vehicle number, if you have it,",
            "what happened, and what you'd like us to do about it.",
        ],
    },
    {
        heading: "If we haven't resolved it",
        body: [
            "You don't have to stop with us. If you're not satisfied with our answer, or 30 days have passed without one, you can take it further:",
        ],
        list: [
            "the National Consumer Helpline on 1915, or consumerhelpline.gov.in,",
            "the consumer commission for your district,",
            "the Data Protection Board of India, for a complaint about your personal data,",
            "[TO CONFIRM: the state transport authority to name here, if the business holds an aggregator licence under the Motor Vehicles Aggregator Guidelines. If it does, that licence also requires a 24×7 control-room number, which belongs on this page.]",
        ],
    },
]

/* ── The documents, in footer order ────────────────────────────────────────── */

/* Keyed by the paths the footer already links to. Add a key here and the tab
   rail, the routes and the page meta all need the same key — see LegalPage.jsx
   and constants/pageMeta.js. */
export const legalDocs = {
    "/terms": {
        tab: "Terms",
        title: "Terms of Service",
        standfirst: "What you're agreeing to when you book a ride with us, in the plainest words we could find for it.",
        sections: terms,
    },
    "/privacy": {
        tab: "Privacy",
        title: "Privacy Policy",
        standfirst: "What we hold about you, who gets to see it, how long we keep it, and how to get rid of it.",
        sections: privacy,
    },
    "/refunds": {
        tab: "Refunds",
        title: "Refunds & Cancellation",
        standfirst: "When cancelling is free, when it isn't, and what happens when a ride falls through.",
        sections: refunds,
    },
    "/grievance": {
        tab: "Grievance",
        title: "Grievance Redressal",
        standfirst: "Who to reach when something has gone wrong, how long we'll take, and where to go if we don't fix it.",
        sections: grievance,
    },
}

export const legalPaths = Object.keys(legalDocs)

/* Stable ids so a section can be linked to directly — the way a lawyer or a
   support reply cites one: /terms#fares */
export const sectionId = (heading) =>
    heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

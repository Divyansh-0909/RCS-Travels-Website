/* Operational legal drafts, not legal advice. Do not remove this banner or any
   TO CONFIRM marker before lawyer review and product/compliance reconciliation. */
export const DRAFT = true;
export const LEGAL_UPDATED = "[TO CONFIRM: effective date after lawyer review]";

export const entity = {
  name: "[TO CONFIRM: registered business name]",
  type: "[TO CONFIRM: legal form]",
  address: "[TO CONFIRM: registered address with PIN code]",
  grievanceOfficer: "[TO CONFIRM: grievance officer name and designation]",
  grievanceEmail: "[TO CONFIRM: grievance email]",
  grievancePhone: "[TO CONFIRM: grievance phone and service hours]",
};

const riderTerms = [
  { heading: "About these terms", body: [
    "RCS Travels is operated by " + entity.name + ", a " + entity.type + " at " + entity.address + ". These terms apply when you use our website, WhatsApp booking flow, or ride services.",
    "[TO CONFIRM: LAUNCH BLOCKER — RCS Travels’ role, UP aggregator licence and compliance position. UP Motor Vehicle (Aggregator and Delivery Services Provider) Rules, 2026 are reported as operational from 22 May 2026 through upmyfleet.com. Do not represent any licence, training, control-room, tracking, panic-button or insurance compliance unless verified.]",
  ] },
  { heading: "Who may use the service", body: [
    "You must provide accurate account and booking information, keep your phone number under your control, and protect OTPs and other verification codes. You are responsible for activity carried out through your account unless you promptly report suspected misuse.",
    "[TO CONFIRM: minimum rider account age and any rules for minors or bookings made for another person.]",
  ] },
  { heading: "Bookings and fares", body: [
    "A booking request is not a guaranteed ride. A booking is confirmed only when the service shows it as confirmed or assigned. Driver availability, traffic, road conditions, safety restrictions and events outside reasonable control may affect pickup or completion.",
    "We show the applicable fare or fare basis before confirmation where the product supports it. Tolls, parking, waiting, cleaning, damage or other charges must not be added unless the product and applicable law allow them and they are disclosed to you. [TO CONFIRM: final waiting, toll, parking, cleaning and damage-charge rules.]",
  ] },
  { heading: "How payment works", body: [
    "Ride Now rides are paid to the driver at the end of the trip, using the payment method offered for that ride. They are not prepaid through our platform.",
    "Scheduled rides currently require a 15% advance through Razorpay. The remaining fare is payable as shown for the booking. Payment-provider terms may also apply to the payment service itself.",
  ] },
  { heading: "Cancellation", body: [
    "Ride Now has no prepaid cancellation charge. For scheduled rides, the cancellation quote returned by our server is authoritative. If it changes before submission, we show the new quote and ask you to confirm it.",
    "Current product behaviour: no scheduled-ride cancellation amount is retained when no driver is assigned, the assigned driver has no fresh platform location, the driver is farther than 500 metres from pickup, or the driver cancels. It is retained once a fresh assigned-driver location is within 500 metres of pickup, or the ride reaches the corresponding arrival status.",
    "[TO CONFIRM: LAUNCH BLOCKER — reported final UP Rules limit passenger cancellation charges to 10% of fare capped at ₹100. The current 15% advance-retention behaviour appears capable of exceeding that limit. Reconcile the product, refund flow and legal rule before publication or launch.]",
  ] },
  { heading: "Safe and respectful travel", list: [
    "Use accurate contact, pickup and destination details, and keep your verification codes private.",
    "Follow seatbelt, vehicle-capacity and road-safety rules. Do not carry unlawful, hazardous or dangerous items.",
    "Treat drivers, co-riders and support staff respectfully. Threats, harassment, discrimination, abuse or unsafe conduct may end a ride or restrict an account.",
  ] },
  { heading: "Safety and emergencies", body: [
    "RCS Travels is not an emergency-response service. For an immediate emergency or threat to life or safety, call 112 or the appropriate public emergency service first, then report the incident to us when it is safe to do so.",
    "Do not rely on in-app status, location or support channels as a substitute for police, ambulance, fire or other emergency services.",
  ] },
  { heading: "Account restrictions and termination", body: [
    "We may restrict, suspend or close an account where reasonably necessary for safety, fraud prevention, repeated misuse, non-payment, unlawful conduct, material breach of these terms, or a legal or regulatory requirement. Where appropriate, we may ask for information before taking or reviewing action.",
    "You may stop using the service at any time. Account closure does not remove payment, record-keeping, dispute or legal obligations that arose before closure.",
  ] },
  { heading: "Third-party services", body: [
    "The service uses third-party providers for functions such as authentication, maps, payments, messaging and notifications. Their services may be governed by their own terms and privacy notices. RCS Travels remains responsible for its own obligations under applicable law.",
  ] },
  { heading: "Responsibility and statutory rights", body: [
    "Nothing in these terms excludes or limits rights or remedies that cannot lawfully be excluded, including applicable consumer rights. To the extent permitted by law, each party remains responsible for loss caused by its own unlawful conduct, fraud, wilful misconduct or breach of duty.",
    "[TO CONFIRM: final limitation-of-liability and indemnity language after counsel reviews the operating model, insurance and licence position.]",
  ] },
  { heading: "Changes and disputes", body: [
    "We may update these terms when the service, law or operating model changes. Material changes should be shown with an updated effective date and, where required, a fresh notice or consent before they apply.",
    "Raise booking or account disputes through the grievance process first so the service records can be reviewed. [TO CONFIRM: governing law, courts/jurisdiction and whether mediation or arbitration will be used.]",
  ] },
  { heading: "Questions and complaints", body: [
    "Contact support promptly with the booking date, registered phone number and a description of the issue. Nothing in these terms removes rights that cannot be excluded under applicable law.",
  ] },
];

const riderPrivacy = [
  { heading: "Scope and purpose", body: [
    "This policy explains how " + entity.name + " handles rider data for RCS Travels. We use it to run bookings, match rides, take scheduled advances, provide support, prevent fraud and abuse, and meet legal obligations. We do not sell personal data.",
  ] },
  { heading: "Where data comes from", body: [
    "We receive data from you, from your device and use of the service, from driver-partners during a booking, from payment and authentication providers, and from support or safety interactions. We may also receive information when another person books a ride for you or lists you as an emergency contact.",
  ] },
  { heading: "Rider data we collect", list: [
    "Name, phone number, gender, date of birth, emergency-contact details and WhatsApp contact information where you choose to use it.",
    "Saved places and their coordinates, pickup and drop details, bookings, ride status, complaints and support records.",
    "Scheduled-ride advance, payment status, payment references and refund records. Payment credentials are handled by the payment provider, not collected from you by a driver.",
    "Device, browser, push-notification and technical log data needed to operate and secure the service.",
  ] },
  { heading: "Location and permissions", body: [
    "Location is used when needed for pickup, destination, saved-place, route and trip functions. Depending on your device and the feature you use, this may come from a location you enter, a map selection, or device location permission.",
    "You can manage device permissions in your operating-system settings, but some booking or safety features may not work correctly without the permissions they need.",
  ] },
  { heading: "How we use rider data", list: [
    "Create and secure accounts, verify phone numbers and prevent duplicate, fraudulent or abusive use.",
    "Create bookings, estimate routes and fares, match drivers, provide trip status and complete payment or refund workflows.",
    "Provide customer support, investigate complaints, enforce service rules and improve reliability and safety.",
    "Comply with tax, accounting, transport, consumer-protection, court, law-enforcement or other legal requirements where applicable.",
  ] },
  { heading: "Providers and sharing", body: [
    "We share the minimum data needed with driver-partners to complete a booking and with providers that operate the service. If you create a trip-share link, anyone who receives that link may see your first name, pickup and drop addresses and coordinates, scheduled time, driver name, photo and vehicle details, and live driver location while the trip is active. The current link expires after 12 hours and stops showing live driver coordinates once the ride ends; treat the link as sensitive and share it only with people you trust.",
  ], list: [
    "Authentication providers for account access and verification.",
    "Google Maps, Routes and Places for place search, route and trip functions.",
    "Razorpay for scheduled-ride advances and related refunds.",
    "WhatsApp/Meta for WhatsApp flows, Firebase for push notifications, and storage or database providers acting on our instructions.",
  ] },
  { heading: "Safety, legal requests and business changes", body: [
    "We may disclose information where reasonably necessary to protect riders, drivers or others, investigate fraud or abuse, comply with a lawful request, or establish or defend legal claims. We should check the validity and scope of requests before disclosing data where the law allows.",
    "If the business is reorganised, financed, sold or transferred, relevant data may move with the affected service subject to applicable law and appropriate safeguards.",
  ] },
  { heading: "Security", body: [
    "We use administrative, technical and access controls intended to protect personal data against unauthorised access, alteration, disclosure or loss. No internet, device or storage system can be guaranteed completely secure, so report suspected account or data misuse promptly.",
  ] },
  { heading: "Retention and requests", body: [
    "We keep data only as long as reasonably needed for bookings, support, security, tax or other legal obligations, disputes and fraud prevention. Backup copies may expire on their normal schedule.",
    "You may ask us to correct account information, request access, or request deletion where applicable. Legal, security, fraud-prevention and record-keeping requirements may limit a request.",
  ] },
  { heading: "Children and other people", body: [
    "Do not give us another person’s personal data unless you are authorised to do so and the disclosure is appropriate for the booking or safety purpose. [TO CONFIRM: rider age/minor policy and any verifiable parental-consent flow required by the final product and applicable privacy law.]",
  ] },
  { heading: "India privacy framework", body: [
    "We are preparing this notice to support the Digital Personal Data Protection Act, 2023 and other applicable Indian privacy requirements. As of 13 September 2026, substantive DPDP obligations are mostly scheduled to phase in from May 2027; this does not state that every DPDP obligation is already in force.",
    "[TO CONFIRM: controller/contact details and final privacy notice after lawyer review.]",
  ] },
  { heading: "Policy changes and contact", body: [
    "If this policy changes materially, we should update the effective date and provide any notice or consent required by law. Privacy questions and requests can be raised through the grievance contact listed on this site.",
  ] },
];

const riderRefunds = [
  { heading: "Ride Now", body: ["Ride Now is paid at the end of the trip to the driver. There is no prepaid Ride Now cancellation amount to refund."] },
  { heading: "Scheduled-ride advance", body: ["Scheduled rides currently collect a 15% Razorpay advance. The server calculates the cancellation quote and settlement; the app shows that result for your confirmation."] },
  { heading: "When the advance is not retained", body: ["Cancellation is free when no driver is assigned, the driver has no fresh platform location, the driver’s fresh location is farther than 500 metres from pickup, or the driver cancels. Any paid advance follows the booking’s refund flow."] },
  { heading: "When the advance is retained", body: ["The current product retains the paid advance once an assigned driver’s fresh location is within 500 metres of pickup, or the booking reaches the corresponding arrival status. The server’s location and status record decide the quote."] },
  { heading: "Before publication", body: ["[TO CONFIRM: LAUNCH BLOCKER — reconcile the current 15% retention with the reported UP cancellation limit of 10% of fare capped at ₹100. This operational description is not a statement that the current rule is lawful or final.]"] },
  { heading: "Refund processing", body: ["Where a refund is due, we initiate it through the applicable payment flow. The time for the amount to appear can also depend on Razorpay, the bank, card network or payment method. [TO CONFIRM: refund-initiation target and the customer-facing settlement window the business can reliably support.]"] },
  { heading: "Payment issues", body: ["If proximity or status changes before cancellation is submitted, the server may return a changed amount and will request confirmation. For an incorrect charge, duplicate payment, failed payment or refund issue, contact support with booking details and the payment reference."] },
  { heading: "Your legal rights", body: ["This policy does not reduce any refund, compensation or consumer remedy available under applicable law. If a statutory rule gives you a better outcome than this draft operational policy, the statutory rule controls."] },
];

const riderGrievance = [
  { heading: "Urgent safety", body: ["For an emergency or immediate safety risk, call 112 first. Then contact us with the booking details when you can."] },
  { heading: "What you can raise", body: ["You may contact us about bookings, fares, payments, cancellations, refunds, driver conduct, safety, account access, privacy requests or other service concerns."] },
  { heading: "Contact and complaint details", body: ["Our grievance contact is " + entity.grievanceOfficer + "."], list: [
    "Email: " + entity.grievanceEmail, "Phone: " + entity.grievancePhone, "Address: " + entity.address,
  ], after: ["Include your registered phone number, booking date and time, relevant vehicle or driver details, what happened, and the outcome you seek. This contact also receives privacy requests."] },
  { heading: "Review", body: ["We will review information available for the booking, payment, account and support history and respond through a suitable contact channel. We may ask for additional information where it is reasonably needed to investigate the concern. [TO CONFIRM: acknowledgement and resolution timelines the business can commit to.]"] },
  { heading: "Further options", body: [
    "The Consumer Protection Act, 2019 and Consumer Protection (E-Commerce) Rules, 2020 may be relevant to consumer complaints. You may use available consumer-redressal channels, including the National Consumer Helpline at https://consumerhelpline.gov.in/ and the appropriate consumer commission, where applicable.",
    "[TO CONFIRM: applicable UP transport authority and escalation route after confirming licence status. Whether the IT Rules apply depends on the facts; this page does not assert intermediary classification.]",
  ] },
];

const driverTerms = [
  { heading: "Driver-partner relationship", body: [
    "These terms apply when you register or use the RCS Travels driver app. You must provide accurate information, keep required documents valid, and follow applicable road, transport and safety requirements.",
    "[TO CONFIRM: driver-partner relationship, aggregator classification, UP licence status, final contract terms, effective version and acceptance-record mechanism. Do not claim compliance with reported UP Rules on 40-hour induction, tracking, panic/control-room, health cover ₹5 lakh, or term/accident cover ₹10 lakh unless verified.]",
  ] },
  { heading: "Account eligibility and security", body: [
    "Use only your own approved driver account and keep your phone, OTPs and login credentials secure. Do not let another person drive through your account or use a vehicle that has not been approved for the ride.",
    "You must remain legally eligible to drive and provide the service. Tell us promptly if a licence, permit, vehicle document, insurance policy or other eligibility fact expires, is suspended, becomes inaccurate or can no longer be relied on.",
  ] },
  { heading: "Documents and vehicle information", list: [
    "Driving licence, vehicle registration certificate, insurance, tax, fitness certificate and permit, where applicable.",
    "PUC/CNG documents and vehicle photographs, where applicable.",
    "Driver profile and contact information needed to verify, operate and support your account.",
  ] },
  { heading: "Ride offers and service", body: [
    "Ride offers, pickup details and other trip information are provided through the app. [TO CONFIRM: whether and when drivers may freely accept or reject ride offers under the final operating model and applicable UP Rules.]",
    "Once you accept a ride, proceed to the correct pickup, keep trip status accurate, use reasonable care, and complete or cancel the ride only through supported flows unless an emergency makes that impracticable.",
  ] },
  { heading: "Location, offers and conduct", body: [
    "The app uses your live location to show availability, match and manage rides, and apply operational safety rules. Keep location services and account information accurate while online or completing a ride.",
    "Drive lawfully and safely, use the vehicle registered for the ride, respect riders and do not seek extra money, ask a rider to cancel, misrepresent your identity or vehicle, or behave abusively or inappropriately.",
  ] },
  { heading: "Fares, payments and taxes", body: [
    "Collect or receive only the fare and payment amounts shown or authorised for the booking. Do not create off-platform surcharges or ask a rider to pay a different amount to avoid platform rules.",
    "[TO CONFIRM: driver fare share, RCS commission/service fee, payout method, settlement cycle, deductions, taxes/TDS/GST treatment and any minimum fare-share obligations under the final UP Rules.]",
  ] },
  { heading: "Driver cancellations", body: [
    "You may self-cancel only while a ride is assigned or en route. A cancelled Ride Now ride returns to matching; a scheduled ride is re-offered.",
    "Each successful self-cancellation is counted once. In a rolling 30-day period, starting with the third self-cancellation, the commission-free benefit is removed and the restriction on earning another benefit is set to 30 days from the latest qualifying self-cancellation; further cancellations while the rolling count remains at least three can extend that date. A fifth self-cancellation suspends the account and withdraws pending offers.",
  ] },
  { heading: "Complaints and account action", body: [
    "Each submitted customer conduct complaint is currently recorded against the driver account. At three recorded complaints, the current system applies a ₹200 fine. At five, it automatically suspends the account and withdraws pending offers; only an administrator may reinstate the account. These actions currently use the recorded complaint count without a separate pre-sanction evidence review.",
    "[TO CONFIRM: complaint validation standard, notice to the driver, evidence review, appeal/reconsideration process, refund of an incorrect fine, and whether these thresholds comply with the final driver agreement and applicable law.]",
  ] },
  { heading: "Safety and incidents", body: [
    "For an immediate emergency, call 112 or the appropriate public emergency service first. Report accidents, threats, serious disputes and material safety incidents to support when it is safe to do so, and cooperate with lawful incident or insurance processes.",
    "[TO CONFIRM: legally required driver induction/training, medical or police checks, control-room/SOS workflow, vehicle tracking, insurance cover and accident-response procedure before publication.]",
  ] },
  { heading: "Suspension, review and exit", body: [
    "We may temporarily restrict offers or suspend access where reasonably necessary for safety, suspected fraud, invalid documents, repeated policy breaches, a serious complaint, non-compliance with law, or a regulator or court requirement. Where appropriate, the driver should have a channel to submit relevant information for review.",
    "You may stop using the driver app subject to outstanding rides, settlements, records, disputes and legal obligations. [TO CONFIRM: driver termination notice, appeal rights, deactivation criteria and any mandatory regulatory procedure.]",
  ] },
  { heading: "Responsibility and disputes", body: [
    "Each party remains responsible for its own unlawful conduct, fraud, wilful misconduct and duties that cannot be excluded by law. [TO CONFIRM: final representations, indemnity, limitation-of-liability, governing-law, jurisdiction and dispute-resolution clauses after counsel confirms the driver relationship and insurance position.]",
  ] },
];

const driverPrivacy = [
  { heading: "Scope", body: ["This notice explains how " + entity.name + " handles personal data about driver-partners and their vehicles when they apply for, access or use the RCS Travels driver app."] },
  { heading: "Data we collect", list: [
    "Profile, contact and verification information, plus driving licence, RC, insurance, tax, fitness, permit, PUC/CNG records and vehicle photos where applicable.",
    "Live and recent location, speed, bearing and location timestamps where the app provides them, plus ride offers, booking and trip records, cancellation history, complaint and support records.",
    "Device, app, push-notification and technical log information needed to operate, secure and improve the app.",
  ] },
  { heading: "Where data comes from", body: ["We receive data from you and your device, riders and booking activity, document-verification or authentication flows, payment or support providers, and lawful safety or compliance interactions."] },
  { heading: "How we use and share it", body: ["We use this data to verify eligibility, match and manage rides, provide navigation and rider-facing trip information, prevent fraud and misuse, resolve complaints, make payments and meet legal obligations."], list: [
    "Riders receive only the details needed for their booked ride.",
    "Google Maps, Routes and Places may process location and trip data for mapping and routing.",
    "Firebase may process push-notification data; WhatsApp/Meta may process messages sent through a WhatsApp flow.",
    "Authentication, storage and database providers may process data on our instructions.",
  ] },
  { heading: "Location while using the driver app", body: [
    "When you are online, available, assigned, en route or on a trip, the app may use frequent or background location as needed for matching, pickup, trip status, routing, cancellation rules, safety and operational records. [TO CONFIRM: exact background-location behaviour on iOS/Android and the final just-in-time permission wording.]",
  ] },
  { heading: "Safety, compliance and legal disclosure", body: ["We may use or disclose relevant records to investigate fraud, safety incidents or complaints, verify legal eligibility, comply with transport or tax obligations, answer lawful requests, or establish or defend legal claims."] },
  { heading: "Security", body: ["We use access controls and technical and administrative measures intended to protect driver data and documents. No system is completely secure, so report suspected account compromise, document misuse or unauthorised access promptly."] },
  { heading: "Retention and requests", body: ["We retain data only as reasonably needed for operations, safety, tax or other legal requirements, dispute handling and fraud prevention. You may request access, correction or deletion where applicable, subject to those requirements and technical backup schedules."] },
  { heading: "India privacy framework", body: ["We are preparing this policy to support the DPDP Act, 2023 and other applicable requirements. As of 13 September 2026, substantive DPDP obligations are mostly scheduled to phase in from May 2027; this does not claim every DPDP obligation is already in force. [TO CONFIRM: controller/contact details and final privacy notice after lawyer review.]"] },
  { heading: "Changes and contact", body: ["Material changes should be reflected through an updated effective date and any notice or consent required by law. Driver privacy questions and requests can be raised through the driver grievance contact."] },
];

const driverPayments = [
  { heading: "What this page covers", body: ["This page describes payment-related rules currently supported in the driver app. It does not create a driver marketplace deposit, a 12% fee or a 10% fee; those are not live terms for driver-partners."] },
  { heading: "Ride fares", body: ["Drivers must use the fare and payment status shown or authorised for the booking and must not impose an undisclosed off-platform surcharge. [TO CONFIRM: fare calculation, toll/parking/waiting handling, cash/online payment methods and any permitted adjustments.]"] },
  { heading: "Scheduled rides", body: ["A customer currently pays a 15% Razorpay advance for a scheduled ride. The service records the advance and its final disposition against the booking. [TO CONFIRM: reconcile this behaviour with the reported UP passenger cancellation cap before launch.]"] },
  { heading: "Customer cancellation", body: ["The server determines a scheduled-rider cancellation quote. Drivers must not ask customers to make off-platform changes to that result."] },
  { heading: "Driver earnings and deductions", body: ["[TO CONFIRM: driver settlement timing, payment method, commission/service-fee terms, cancellation allocation, taxes/TDS/GST, adjustments and any UP fare-share compliance. Do not claim the reported 80%/60% minimum split unless verified.]"] },
  { heading: "Corrections and disputes", body: ["If a booking’s payment, cancellation, settlement or status looks wrong, contact support with the booking reference and relevant payment details. We should correct verified calculation or processing errors and provide a review route for disputed deductions."] },
];

const driverGrievance = [
  { heading: "Urgent safety", body: ["For an immediate emergency or safety risk, call 112 first. Then report the booking and incident to support when it is safe to do so."] },
  { heading: "What you can raise", body: ["Driver-partners may raise concerns about onboarding, documents, ride allocation, fares, settlement, cancellations, fines, complaints, suspension, safety, privacy or account access."] },
  { heading: "How to raise a concern", body: ["Contact " + entity.grievanceOfficer + " with your driver account phone number, booking details, documents or screenshots that help, and the outcome you seek."], list: [
    "Email: " + entity.grievanceEmail, "Phone: " + entity.grievancePhone, "Address: " + entity.address,
  ] },
  { heading: "Review and escalation", body: ["We will review relevant ride, account, payment, complaint and support records and respond through a suitable contact channel. Drivers should have a reasonable opportunity to provide relevant information when a complaint, fine or suspension is disputed. [TO CONFIRM: acknowledgement and resolution timelines, formal appeal/reconsideration process, UP transport authority and escalation route after confirming licence status. Whether the IT Rules apply depends on the facts; this page does not assert intermediary classification.]"] },
];

export const legalDocs = {
  "/terms": { tab: "Terms", title: "Terms of Service", standfirst: "The rules for booking and taking a ride with RCS Travels.", sections: riderTerms },
  "/privacy": { tab: "Privacy", title: "Privacy Policy", standfirst: "What rider data we use, why, and who may process it for the service.", sections: riderPrivacy },
  "/refunds": { tab: "Refunds", title: "Refunds & Cancellation", standfirst: "The scheduled-ride advance and server-authoritative cancellation rule.", sections: riderRefunds },
  "/grievance": { tab: "Grievance", title: "Grievance Redressal", standfirst: "How riders can raise and escalate a concern.", sections: riderGrievance },
  "/driver-terms": { tab: "Driver terms", title: "Driver Terms", standfirst: "Rules for driver-partners using the RCS Travels driver app.", sections: driverTerms },
  "/driver-privacy": { tab: "Driver privacy", title: "Driver Privacy Policy", standfirst: "How we use driver-partner, vehicle, location and device data.", sections: driverPrivacy },
  "/driver-payments": { tab: "Driver payments", title: "Driver Payments", standfirst: "Payment and cancellation rules currently supported for drivers.", sections: driverPayments },
  "/driver-grievance": { tab: "Driver grievance", title: "Driver Grievance", standfirst: "How driver-partners can raise a concern.", sections: driverGrievance },
};

export const legalPaths = Object.keys(legalDocs);
export const sectionId = (heading) => heading.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

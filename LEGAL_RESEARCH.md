# RCS Travels legal research and launch checklist

**Research date:** 13 September 2026  
**Scope:** RCS Travels customer website and captain/driver app in India, with the current product centered in Uttar Pradesh/NCR.  
**Status:** Working compliance research for product implementation. The public legal copy remains a draft until the unresolved business facts below are confirmed and an Indian transport/privacy lawyer reviews the final text.

## Executive findings

The existing customer legal pages were useful scaffolding, but they were not ready to publish. They contained unresolved entity/grievance placeholders, a payment description that contradicted the live 15% scheduled-ride advance flow, a privacy notice that did not describe much of the data the product actually processes, and an IT Rules grievance statement that assumed a legal classification that may not apply to every part of the service.

The driver app also linked to the same rider-facing documents. That is not enough for a ride-hailing platform. The driver relationship needs its own terms, privacy notice, payment/cancellation rules, and grievance process because the platform processes driver identity/vehicle documents, live location, suspension/cancellation events and other partner data that riders never provide.

The regulatory position in Uttar Pradesh has also moved beyond the earlier central-only research. Final **Uttar Pradesh Motor Vehicle (Aggregator and Delivery Services Provider) Rules, 2026** were notified on 22 May 2026, and the Government of Uttar Pradesh now operates the **UP Motor Vehicle Aggregator and Delivery Service Provider (MVADSP) / UP My Fleet portal** as the State licensing and compliance system. The portal currently shows an eligibility check of operating more than 25 vehicles through a digital platform, a five-year licence, VAHAN/SARATHI integration, and continuing compliance monitoring. RCS must confirm its exact licence position with the Transport Department before any public document says it is a licensed aggregator.

There is also a direct product-policy conflict that needs to be resolved before launch: reporting on the final UP Rules states that a passenger cancellation charge is limited to **10% of the fare, capped at ₹100**, whereas the current RCS scheduled-ride flow can retain the entire **15% advance** once the driver is within the product's 500-metre threshold. The legal copy should describe the current implementation while it remains a draft, but RCS should not publish or rely on that 15% forfeiture rule until counsel confirms it or the product is changed to the statutory cap.

## Documents RCS should maintain

### Customer-facing

1. Terms of Service.
2. Privacy Policy / privacy notice.
3. Payments, refunds and cancellation policy.
4. Grievance and support policy.
5. Safety and emergency information once the actual emergency support, insurance, control-room and incident-response arrangements are confirmed.

### Driver/captain-facing

1. Driver Partner Terms / partner agreement.
2. Driver Privacy Notice.
3. Driver Payments, Deductions and Cancellation Policy.
4. Driver Grievance, Suspension and Appeal Policy.
5. Safety, conduct and zero-tolerance policy once operational procedures are approved.
6. A versioned acknowledgement/acceptance record for the driver agreement and future material changes.

### Internal operational documents

1. Personal-data retention schedule.
2. Data-breach and incident-response procedure.
3. Driver onboarding/re-verification SOP.
4. Safety escalation SOP and emergency contact/control-room procedure if required by the applicable licence/rules.
5. Complaint investigation and appeal SOP.
6. Licence/permit/insurance compliance register for each operating state.

## India law and regulation relevant to this product

### 1. Motor Vehicles Act and aggregator regulation

MoRTH issued the **Motor Vehicle Aggregator Guidelines, 2025** on 1 July 2025 as the current central model under section 93 of the Motor Vehicles Act. The framework covers aggregator licensing, driver agreements, onboarding, safety, fare transparency, cancellations, grievance handling, insurance, vehicle/driver compliance and app/platform obligations.

For RCS, the central guidelines are only part of the picture. State rules and licences control actual operation. Uttar Pradesh published draft aggregator/delivery rules in March 2026 and has since operationalised a State licensing scheme through the official **UP My Fleet** portal. The portal currently describes:

- an aggregator/delivery-provider licensing process;
- an eligibility check for digital platforms operating more than 25 vehicles;
- company registration, GST/PAN, bank-guarantee and compliance-officer information;
- a five-year licence;
- vehicle/driver onboarding through VAHAN and SARATHI integration;
- continuing safety, electrification and compliance monitoring.

Contemporary reporting on the final notification also identifies material operating requirements including a five-year licence, driver health cover of at least ₹5 lakh, driver term/accident cover of ₹10 lakh, a minimum 80% driver share where the driver owns the vehicle (60% for an aggregator-owned vehicle), 40-hour induction training, vehicle tracking/panic-button and control-room requirements, and the 10%/₹100 cancellation-charge cap. These details should be checked against the final Gazette text and the licence conditions used for RCS before being converted into production promises or contractual obligations.

RCS should not claim that the central Guidelines alone authorise operations in Uttar Pradesh. Before launch, counsel/management should confirm whether the current fleet/association model falls within the UP Rules, whether the >25-vehicle threshold applies to the planned operation, and what licence/permit filings are required.

If RCS serves Delhi/NCT, a separate Delhi compliance analysis is required. A Uttar Pradesh licence should not be assumed to authorise Delhi or Haryana operations.

### 2. Consumer Protection Act and E-Commerce Rules

The **Consumer Protection Act, 2019** and **Consumer Protection (E-Commerce) Rules, 2020** are relevant to an online service that lets consumers book and pay for rides. Customer-facing information should be accurate and easy to access, including the legal entity, address/contact channels, fare and compulsory charges, payment method, cancellation/refund conditions, service limitations and grievance process.

This is why the product legal copy must match the server behaviour exactly. A policy that says "nothing is charged up front" while the product takes a scheduled-ride advance creates a direct consumer-protection risk.

### 3. Data protection: current and upcoming position

The **Digital Personal Data Protection Act, 2023** and **Digital Personal Data Protection Rules, 2025** use phased commencement. As of 13 September 2026, the framework is not yet fully in force. A large part of the substantive data-fiduciary/notice/rights regime is scheduled to commence in May 2027. The privacy copy should therefore be **DPDP-ready** without falsely saying that every DPDP obligation is already legally enforceable today.

Until the corresponding repeal/transition takes effect, the Information Technology Act/SPDI framework remains relevant to sensitive personal data and security practices. RCS should keep a clear privacy policy, purpose limitation, reasonable safeguards, controlled disclosure, correction/withdrawal mechanisms and a grievance route.

The product currently processes substantially more information than the old privacy copy described, including:

- rider name, phone, optional demographic/profile fields, emergency contact and WhatsApp contact;
- pickup/drop addresses and coordinates, saved places and ride history;
- booking codes, fares, cancellation/refund status and payment-provider identifiers;
- complaints and support records;
- driver profile and push-notification identifiers;
- driver live latitude/longitude, speed/bearing/timestamps where used by the tracking flow;
- driver/vehicle compliance documents such as driving licence, RC, insurance, tax, fitness, permit, pollution/CNG records and vehicle photographs where applicable;
- authentication, maps/routes/places, payment, messaging, push-notification, database/storage and hosting service-provider processing.

The final privacy notice should identify the actual production vendors after the storage/database migration is settled. The codebase currently contains mixed Supabase/Google Cloud storage references, so the draft should not hard-code an uncertain storage provider.

### 4. IT Intermediary Rules

The **Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules, 2021** should not automatically be presented as the legal basis for every RCS grievance. Whether RCS is an "intermediary" for a particular function is fact-specific. If RCS hosts/transmits third-party content such as reviews, messages, images or other user content, counsel should confirm the extent to which intermediary due-diligence and grievance timelines apply.

The public grievance policy should therefore promise a service level RCS can actually meet and separately state that statutory shorter timelines will be followed where applicable, instead of making an unconditional classification claim.

### 5. Payments and refunds

The current product uses a mixed payment model:

- **Ride Now:** paid to the driver at the end of the trip by the available completion methods shown in the product.
- **Scheduled rides:** a **15% advance** is collected through Razorpay before confirmation/completion of the booking flow.

The product stores payment/order/refund identifiers needed to reconcile the transaction, but raw card credentials should remain with the regulated payment provider and should not be described as being stored by RCS unless that ever changes.

The cancellation decision is server-authoritative. For a scheduled ride, the current implementation retains the 15% advance when the assigned driver has reached pickup or has a fresh location within 500 metres. It treats the cancellation as free/refundable when no chargeable proximity can be established, including when the driver has no sufficiently fresh location or is farther than the threshold. Driver cancellation is not treated as a customer charge. **This current 15% retention rule requires change or specific legal confirmation because the final UP Rules are reported to cap passenger cancellation charges at 10% of fare, up to ₹100.**

The policy should not promise a refund settlement time until the owner chooses a supported, operationally realistic timeline and verifies it against Razorpay/UPI settlement behaviour.

## What Ola, Uber and Rapido have in common with RCS

Current public India policies reviewed on 13 September 2026:

- **Ola:** India Terms (effective 15 October 2025) and India Privacy Policy.
- **Uber:** India general terms (last modified 12 August 2026), rider privacy notice (updated 1 September 2026), and India driver/fleet partner services agreement.
- **Rapido:** customer terms, privacy policy, Captain terms and safety material available on its 2026 website.

Common patterns that are relevant to RCS:

| Topic | Ola / Uber / Rapido pattern | RCS implication |
| --- | --- | --- |
| Platform role | Platforms define whether they are an aggregator, technology/SaaS platform or intermediary and separate the transport relationship from the app relationship. | RCS must confirm its real legal/business model and state licence position before finalising the "independent driver" clause. |
| Separate partner terms | Uber and Rapido maintain driver/captain-specific terms in addition to rider terms. | Driver app should not reuse the rider documents. |
| Location and trip data | Rider/driver location, trip and device data are described specifically. | RCS privacy notices must describe live driver tracking and pickup/drop coordinates. |
| Driver/customer data sharing | Limited identity/contact/vehicle/trip data is shared so a ride can be performed and supported. | State what the assigned driver sees and what the rider sees. |
| Payment processors | Policies distinguish the platform/payment provider and describe payment/refund rules. | Explain Razorpay advance collection and avoid saying RCS stores raw card data. |
| Cancellation | Fee conditions are disclosed in product/policy and usually include a review/support route. | Keep the 500m server rule aligned with the cancellation quote the user sees. |
| Safety and conduct | Identity, vehicle information, incident reporting and account suspension are common. | Do not promise SOS/police/24x7 control-room functions until they actually exist. |
| Suspension/deactivation | Fraud, safety, document expiry and repeated conduct/cancellation issues can lead to suspension. | Driver rules should disclose the product's implemented 3/5 cancellation thresholds and complaint consequences, with an appeal/grievance route. |
| Liability/disputes | Large platforms use detailed limits, indemnities and arbitration provisions. | RCS should not copy a ₹1,000 cap, Bengaluru arbitration seat or another platform's boilerplate; these need owner/counsel decisions. |

## Product-specific rules that legal copy must track

### Customer cancellation

- Ride Now currently has no prepaid cancellation amount to retain.
- Scheduled rides use a 15% advance.
- The cancellation quote is computed by the server from the current booking/driver state.
- An assigned driver's fresh location within 500m, or a reached-at-pickup state, can make the scheduled advance non-refundable under the current product rule.
- A missing/stale driver location is treated conservatively by the current server and does not create the proximity charge.
- The UI/server can require reconfirmation if the cancellation amount changes between quote and confirmation.

### Driver cancellation and conduct

- Drivers can cancel assigned/en-route rides through the current driver flow; the ride is re-offered rather than automatically cancelled for the rider.
- **3 driver self-cancellations in a rolling 30-day period** currently remove the commission-free benefit for 30 days.
- **5 driver self-cancellations in a rolling 30-day period** currently suspend the driver and withdraw active offers.
- The current complaint service applies a **₹200 fine at 3 conduct complaints** and **suspension at 5 complaints**.

These rules belong in driver-facing terms/policy because they materially affect access and earnings. Before public launch, RCS should also define an investigation/appeal process so an automated threshold is not the only explanation given to a driver.

### Driver marketplace preview

The driver-app repository contains preview/product-spec values for marketplace deposits and cancellation/fee percentages, but the marketplace backend/payment settlement is not yet implemented. Those preview values must **not** be described in the live legal documents as active contractual charges until the feature is actually launched and reviewed.

## Publication blockers / owner and lawyer decisions

Do not set the legal-document `DRAFT` flag to `false` until all of the following are resolved:

1. Registered legal name and entity type.
2. Registered/operational address and GST details, if applicable.
3. Exact Uttar Pradesh aggregator licence/applicability position under the current State scheme.
4. Any other state/NCR licence coverage.
5. Grievance Officer name, designation, email, phone and support hours.
6. Customer-care and safety/escalation phone numbers that are actually staffed.
7. Passenger/driver insurance policy details and any legally required cover.
8. Whether drivers are independent partners, employees, fleet contractors or a mixed model.
9. Driver fare share, RCS commission/service-fee model and settlement schedule.
10. Refund initiation/settlement timeline.
11. Waiting-time and cleaning/damage-charge rules.
12. Exact production storage/database/analytics vendors and retention periods.
13. Driver complaint investigation, notice and appeal process. The current backend applies the ₹200 fine at three recorded complaints and suspension at five from the complaint count itself, without a separate pre-sanction evidence-review step.
14. Governing-law jurisdiction and any arbitration/mediation clause.
15. Final lawyer review of every customer and driver document.
16. Reconcile the scheduled-ride 15% advance forfeiture with the UP 2026 passenger-cancellation cap before the policy is published or enforced as a cancellation charge.
17. Publish a final effective version of customer and driver terms and record acceptance/version information before signup copy says a user or driver has agreed to them; the current routes remain explicit drafts and must not be treated as operative contracts.
18. Reconcile trip-sharing disclosures and controls before launch: a generated share link exposes rider first name, pickup/drop addresses and coordinates, scheduled time, driver identity/photo/vehicle and live driver location while active, while the Safety-page automatic emergency-contact sharing toggle currently has no backend implementation.
19. Align the driver cancellation policy with the backend rule that each further cancellation while the rolling count remains at least three can reset the commission-free-benefit restriction to 30 days from that latest cancellation.

## Source list

Primary/official sources:

- MoRTH, Motor Vehicle Aggregator Guidelines 2025: https://morth.nic.in/sites/default/files/circulars_document/MV-Aggregators-Guidelines-2025%20-%20English%20and%20Hindi.pdf
- Parivahan mirror of the 2025 Guidelines: https://parivahan.gov.in/sites/default/files/NOTIFICATION%26ADVISORY/MV-Aggregators-Guidelines-2025%20-%20English%20and%20Hindi.pdf
- Government of Uttar Pradesh draft Rules notification dated 13 March 2026: https://upidadv.up.gov.in/upload/PublicationRequest/183241/SachivalyaLKO130326Notification639090236220551079.pdf
- Government of Uttar Pradesh, UP MVADSP / UP My Fleet portal: https://www.upmyfleet.com/
- MeitY, Digital Personal Data Protection Act 2023: https://www.meity.gov.in/static/uploads/2024/02/Digital-Personal-Data-Protection-Act-2023.pdf
- MeitY, DPDP commencement notification dated 13 November 2025: https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf
- MeitY, Digital Personal Data Protection Rules 2025: https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf
- Department of Consumer Affairs, Consumer Protection legislation: https://consumeraffairs.nic.in/acts-and-rules/consumer-protection/consumer-protection
- MeitY, SPDI Rules 2011: https://www.meity.gov.in/sites/upload_files/dit/files/RNUS_CyberLaw_15411.pdf
- MeitY, Information Technology (Intermediary Guidelines and Digital Media Ethics Code) Rules 2021, consolidated/updated publication: https://meity.gov.in/writereaddata/files/IT%20Intermediary%20Rules%2C%202021%20updated%20on%2028.10.2022.pdf

Company policy sources used for comparison:

- Ola India Terms: https://olawebcdn.com/v1/docs/htmls/india-tnc-website.html
- Ola India Privacy Policy: https://olawebcdn.com/v1/docs/htmls/india-privacy-policy.html?v=1
- Uber India Terms: https://www.uber.com/in/en/legal/general-terms-of-use/
- Uber rider privacy notice: https://www.uber.com/global/en/privacy-notice-riders-order-recipients/
- Uber India driver/fleet services agreement: https://www.uber.com/in/en/legal/india-earner-subscription-model-terms-and-conditions/
- Rapido Customer Terms: https://www.rapido.bike/CustomerTerms
- Rapido Privacy Policy: https://www.rapido.bike/Privacy
- Rapido Captain Terms: https://www.rapido.bike/CaptainTerms
- Rapido Safety Guidelines: https://rapido.bike/RapidoSafetyGuidelines.pdf

Secondary cross-check for the final Uttar Pradesh notification metadata (22 May 2026, notification no. 5/2026/470/XXX-4-2026/30-4099(099)/72-2021-1404987): https://complinity.com/legal-update/-the-uttar-pradesh-motor-vehicle-aggregator-and-delivery-services-provider-rules-2026-25508/

Additional current reporting used to cross-check operational provisions of the final UP Rules while the official portal was treated as the primary live licensing source:

- Hindustan Times, 29 June 2026: https://www.hindustantimes.com/cities/lucknow-news/up-makes-licenses-compulsory-for-app-based-cab-delivery-operators-101782668672102.html

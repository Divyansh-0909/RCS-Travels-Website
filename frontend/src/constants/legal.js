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

export const LEGAL_UPDATED = "[TO CONFIRM: effective date, the day the lawyer signs off]"

/* One place for the details that repeat across all four documents. Every one of
   these is a fact about the business that the code cannot tell us. */
export const entity = {
    name: "[TO CONFIRM: registered business name]",
    type: "[TO CONFIRM: sole proprietorship / partnership / private limited company]",
    address: "[TO CONFIRM: full registered address with PIN code]",
    gstin: "[TO CONFIRM: GSTIN, or delete this line if not registered]",
    jurisdiction: "[TO CONFIRM: courts of <city>, usually where the business is registered]",
    grievanceOfficer: "[TO CONFIRM: Grievance Officer's full name]",
    grievanceDesignation: "[TO CONFIRM: designation, e.g. Proprietor]",
    grievanceEmail: "[TO CONFIRM: grievance email; a domain address reads better than gmail]",
    grievancePhone: "[TO CONFIRM: grievance phone number and the hours it is answered]",
}

/* ── Terms of Service ──────────────────────────────────────────────────────── */

const terms = [
    {
        heading: "Who we are",
        body: [
            `RCS Travels is a cab service run by ${entity.name}, a ${entity.type} registered at ${entity.address}. In these terms, "we", "us" and "RCS Travels" mean that business, and "you" means the person booking or taking a ride.`,
            `We arrange rides between you and independent driver-partners who own and drive their own vehicles. We are not the transport operator: we verify our driver-partners, set the fare, and take a commission on each completed ride, but the driver, not us, carries you. [TO CONFIRM: this framing decides where liability sits and must be confirmed with the lawyer before publishing. If the business owns the vehicles or employs the drivers, this clause and "Our responsibility, and its limits" below both have to be rewritten.]`,
            "By booking a ride, whether on this website or over WhatsApp, you agree to these terms. If you don't agree with them, please don't use the service.",
        ],
    },
    {
        heading: "Who can book",
        body: [
            "You need to be 18 or older to hold an account. Anyone younger is welcome to travel, but an adult has to make the booking and travel with them.",
        ],
        list: [
            "Use your own phone number, and one that reaches you. Your driver calls it on the day.",
            "One account per phone number.",
            "Book only for yourself or for someone who knows you're booking on their behalf.",
        ],
    },
    {
        heading: "Your account",
        body: [
            "You sign in with your phone number and a one-time code we send you. There's no password to remember, which also means anyone holding your phone can reach your account, so treat your phone and the codes we send as yours alone.",
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
            "The safer route, if you choose it: a flat ₹150.",
            "Tolls, state permits and parking on the route.",
            "A roof carrier, if your luggage needs one.",
            "Round trips, priced as a single booking rather than two.",
        ],
        after: [
            `The fare can change after you book only if the ride itself changes: a different drop point, an extra stop, or waiting beyond the free waiting time. [TO CONFIRM: the free waiting time in minutes, and the per-minute or per-hour charge after it. The app does not calculate this today, so whatever you decide has to be told to drivers as well as written here.]`,
            "If a driver ever asks you for more than the fare on your tracking page, don't pay it. Call us instead.",
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
            "Your co-riders are strangers to you and to us beyond their own booking. Everything under \"How we expect everyone to behave\" applies to them as much as to you. If it doesn't, tell us and we'll act on it.",
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
            `If the vehicle is damaged or badly soiled during your ride, you'll be asked to cover the cleaning or repair. [TO CONFIRM: a flat cleaning charge, or "at actuals against a receipt"? Pick one; an unspecified charge is unenforceable and invites arguments at the roadside.]`,
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
            `Where the law allows us to limit what we owe you, our liability for any one ride is limited to the fare for that ride, and we're not liable for indirect losses, such as a missed flight, exam, interview or connection, arising from a delayed or cancelled ride. Nothing here limits liability that cannot be limited by law, including for death or personal injury caused by negligence, or your rights under the Consumer Protection Act, 2019. [TO CONFIRM: this is the clause most worth the lawyer's time. A cab service carrying students to and from trains and flights will be tested on exactly this, and a cap the court won't enforce is worse than no cap.]`,
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
            "You can delete your account from Manage Account whenever you like, except while a ride is live. Finish or cancel that ride first. What deletion erases and what we have to keep is set out in the Privacy Policy.",
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

/* Generated with the TermsFeed Privacy Policy Generator on July 28, 2026 and
   converted from its HTML into the section shape LegalPage renders. The nested
   sub-lists (cookie types, retention periods) are flattened into prose because
   the renderer draws one flat list per section. */

const privacy = [
    {
        heading: "Introduction",
        body: [
            "This Privacy Policy describes Our policies and procedures on the collection, use and disclosure of Your information when You use the Service and tells You about Your privacy rights and how the law protects You.",
            "We use Your Personal Data to provide and improve the Service. We collect, use, and disclose Your information as described in this Privacy Policy and, where required by applicable law, only where We have a valid legal basis to do so, including Your consent (where consent is required). This Privacy Policy has been created with the help of the TermsFeed Privacy Policy Generator (https://www.termsfeed.com/privacy-policy-generator/).",
        ],
    },
    {
        heading: "Interpretation and Definitions",
        body: [
            "The words whose initial letters are capitalized have meanings defined under the following conditions. The following definitions shall have the same meaning regardless of whether they appear in singular or in plural.",
            "For the purposes of this Privacy Policy:",
        ],
        list: [
            "Account means a unique account created for You to access Our Service or parts of Our Service.",
            `Affiliate means an entity that controls, is controlled by, or is under common control with a party, where "control" means ownership of 50% or more of the shares, equity interest or other securities entitled to vote for election of directors or other managing authority.`,
            `Company (referred to as either "the Company", "We", "Us" or "Our" in this Privacy Policy) refers to R C S Travels, Ramgopal Enclave Colony, G T Road, Dadri, Gautam Buddh Nagar, Uttar Pradesh 203207.`,
            "Cookies are small files that are placed on Your computer, mobile device or any other device by a website, containing the details of Your browsing history on that website, among its many uses.",
            "Country/State refers to: Uttar Pradesh, India.",
            "Device means any device that can access the Service, such as a computer, a cell phone or a digital tablet.",
            `Personal Data (or "Personal Information") is any information that relates to an identified or identifiable individual. We use "Personal Data" and "Personal Information" interchangeably unless a law uses a specific term.`,
            "Service refers to the Website.",
            "Service Provider means any natural or legal person who processes the data on behalf of the Company. It refers to third-party companies or individuals employed by the Company to facilitate the Service, to provide the Service on behalf of the Company, to perform services related to the Service or to assist the Company in analyzing how the Service is used.",
            "Usage Data refers to data collected automatically, either generated by the use of the Service or from the Service infrastructure itself (for example, the duration of a page visit).",
            "User means any individual who accesses or uses the Service.",
            "Website refers to RCS Travels, accessible from https://www.rcstravels.co.in/",
            "You means the individual accessing or using the Service, or the company, or other legal entity on behalf of which such individual is accessing or using the Service, as applicable.",
        ],
    },
    {
        heading: "Personal Data",
        body: [
            "While using Our Service, We may ask You to provide Us with certain personally identifiable information that can be used to contact or identify You. Personally identifiable information may include, but is not limited to:",
        ],
        list: [
            "First name and last name",
            "Phone number",
            "Address, State, Province, ZIP/Postal code, City",
        ],
    },
    {
        heading: "Usage Data",
        body: [
            "Usage Data is collected automatically when using the Service.",
            "Usage Data may include information such as Your Device's Internet Protocol address (e.g. IP address), browser type, browser version, the pages of Our Service that You visit, the time and date of Your visit, the time spent on those pages, unique device identifiers and other diagnostic data.",
            "When You access the Service by or through a mobile device, We may collect certain information automatically, including, but not limited to, the type of mobile device You use, Your mobile device's unique ID, the IP address of Your mobile device, Your mobile operating system, the type of mobile Internet browser You use, unique device identifiers and other diagnostic data.",
            "We may also collect information that Your browser sends whenever You visit Our Service or when You access the Service by or through a mobile device.",
        ],
    },
    {
        heading: "Tracking Technologies and Cookies",
        body: [
            "We use Cookies and similar tracking technologies to track the activity on Our Service and store certain information. Tracking technologies We use include beacons, tags, and scripts to collect and track information and to improve and analyze Our Service. The technologies We use may include:",
        ],
        list: [
            "Cookies or Browser Cookies. A cookie is a small file placed on Your Device. You can instruct Your browser to refuse all Cookies or to indicate when a Cookie is being sent. However, if You do not accept Cookies, You may not be able to use some parts of Our Service.",
            "Web Beacons. Certain sections of Our Service and Our emails may contain small electronic files known as web beacons (also referred to as clear gifs, pixel tags, and single-pixel gifs) that permit the Company, for example, to count users who have visited those pages or opened an email and for other related website statistics (for example, recording the popularity of a certain section and verifying system and server integrity).",
        ],
        after: [
            `Cookies can be "Persistent" or "Session" Cookies. Persistent Cookies remain on Your personal computer or mobile device when You go offline, while Session Cookies are deleted as soon as You close Your web browser.`,
            "Where required by law, We use non-essential cookies (such as analytics, advertising, and remarketing cookies) only with Your consent. You can withdraw or change Your consent at any time using Our cookie preferences tool (if available) or through Your browser/device settings. Withdrawing consent does not affect the lawfulness of processing based on consent before its withdrawal.",
            "We use both Session and Persistent Cookies for the purposes set out below:",
            "Necessary / Essential Cookies (Session Cookies, administered by Us). Purpose: These Cookies are essential to provide You with services available through the Website and to enable You to use some of its features. They help to authenticate users and prevent fraudulent use of user accounts. Without these Cookies, the services that You have asked for cannot be provided, and We only use these Cookies to provide You with those services.",
            "Cookies Policy / Notice Acceptance Cookies (Persistent Cookies, administered by Us). Purpose: These Cookies identify whether users have accepted the use of cookies on the Website.",
            "Functionality Cookies (Persistent Cookies, administered by Us). Purpose: These Cookies allow Us to remember choices You make when You use the Website, such as remembering Your Account login details or language preference. The purpose of these Cookies is to provide You with a more personal experience and to avoid You having to re-enter Your preferences every time You use the Website.",
            "For more information about the cookies We use and Your choices regarding cookies, please visit the Cookies section of Our Privacy Policy.",
        ],
    },
    {
        heading: "Use of Your Personal Data",
        body: [
            "The Company may use Personal Data for the following purposes:",
        ],
        list: [
            "To provide and maintain Our Service, including to monitor the usage of Our Service.",
            "To manage Your Account: to manage Your registration as a user of the Service. The Personal Data You provide can give You access to different functionalities of the Service that are available to You as a registered user.",
            "For the performance of a contract: the development, compliance and undertaking of the purchase contract for the products, items or services You have purchased or of any other contract with Us through the Service.",
            "To contact You: To contact You by email, telephone calls, SMS, or other equivalent forms of electronic communication, such as a mobile application's push notifications regarding updates or informative communications related to the functionalities, products or contracted services, including the security updates, when necessary or reasonable for their implementation.",
            "To provide You with news, special offers, and general information about other goods, services and events which We offer that are similar to those that You have already purchased or inquired about. We send such marketing communications only where permitted by applicable law: where prior consent is required (for example, under the laws applicable in the EEA and the UK), We will send them only with Your consent; otherwise, We may send them until You opt out. You may opt out or withdraw Your consent at any time by using the unsubscribe link in any marketing email We send or by contacting Us.",
            "To manage Your requests: To attend and manage Your requests to Us.",
            "For business transfers: We may use Your Personal Data to evaluate or conduct a merger, divestiture, restructuring, reorganization, dissolution, or other sale or transfer of some or all of Our assets, whether as a going concern or as part of bankruptcy, liquidation, or similar proceeding, in which Personal Data held by Us about Our Service users is among the assets transferred.",
            "For other purposes: We may use Your information for other purposes, such as data analysis, identifying usage trends, determining the effectiveness of Our promotional campaigns, and evaluating and improving Our Service, products, services, marketing and Your experience.",
        ],
    },
    {
        heading: "Sharing Your Personal Data",
        body: [
            "We may share Your Personal Data in the following situations:",
        ],
        list: [
            "With Service Providers: We may share Your Personal Data with Service Providers to monitor and analyze the use of Our Service, and to contact You.",
            "For business transfers: We may share or transfer Your Personal Data in connection with, or during negotiations of, any merger, sale of Company assets, financing, or acquisition of all or a portion of Our business to another company.",
            "With Affiliates: We may share Your Personal Data with Our affiliates, in which case We will require those affiliates to honor this Privacy Policy. Affiliates include Our parent company and any other subsidiaries, joint venture partners or other companies that We control or that are under common control with Us.",
            "With business partners: We may share Your Personal Data with Our business partners to offer You certain products, services or promotions. Business partners may use this information for their own purposes, as described in their own privacy policies.",
            "With other users: If Our Service offers public areas, when You share Personal Data or otherwise interact in the public areas with other users, such information may be viewed by all users and may be publicly distributed outside the Service.",
            "With Your consent: We may disclose Your Personal Data for any other purpose with Your consent.",
        ],
    },
    {
        heading: "Retention of Your Personal Data",
        body: [
            "The Company will retain Your Personal Data only for as long as is necessary for the purposes set out in this Privacy Policy. We will retain and use Your Personal Data to the extent necessary to comply with Our legal obligations (for example, if We are required to retain Your data to comply with applicable laws), resolve disputes, and enforce Our legal agreements and policies.",
            `Where possible, We apply shorter retention periods and/or reduce identifiability by deleting, aggregating, or anonymizing data. Unless otherwise stated, the retention periods below are maximum periods ("up to") and We may delete or anonymize data sooner when it is no longer needed for the relevant purpose. We apply different retention periods to different categories of Personal Data based on the purpose of processing and legal obligations:`,
        ],
        list: [
            "Account Information — User Accounts: retained for the duration of Your Account relationship plus up to 24 months after account closure to handle any post-termination issues or resolve disputes.",
            "Usage Data — Website analytics data (cookies, IP addresses, device identifiers): up to 24 months from the date of collection, which allows us to analyze trends while respecting privacy principles.",
            "Usage Data — Server logs (IP addresses, access times): up to 24 months for security monitoring and troubleshooting purposes.",
        ],
        after: [
            "Usage Data is retained in accordance with the retention periods described above, and may be retained longer only where necessary for security, fraud prevention, or legal compliance.",
            "We may retain Personal Data beyond the periods stated above for different reasons. Legal obligation: We are required by law to retain specific data (e.g., financial records for tax authorities). Legal claims: Data is necessary to establish, exercise, or defend legal claims. Your explicit request: You ask Us to retain specific information. Technical limitations: Data exists in backup systems that are scheduled for routine deletion.",
            "You may request information about how long We will retain Your Personal Data by contacting Us.",
            "When retention periods expire, We securely delete or anonymize Personal Data according to the following procedures. Deletion: Personal Data is removed from Our systems and no longer actively processed. Backup retention: Residual copies may remain in encrypted backups for a limited period consistent with Our backup retention schedule and are not restored except where necessary for security, disaster recovery, or legal compliance. Anonymization: In some cases, We convert Personal Data into anonymous statistical data that cannot be linked back to You. This anonymized data may be retained indefinitely for research and analytics.",
        ],
    },
    {
        heading: "Transfer of Your Personal Data",
        body: [
            "Your information, including Personal Data, is processed at the Company's operating offices and in any other places where the parties involved in the processing are located. This means that this information may be transferred to — and maintained on — computers located outside of Your state, province, country or other governmental jurisdiction where the data protection laws may differ from those of Your jurisdiction.",
            "Where required by applicable law, We will ensure that international transfers of Your Personal Data are subject to appropriate safeguards and, where relevant, supplementary measures. The Company will take all steps reasonably necessary to ensure that Your data is treated securely and in accordance with this Privacy Policy and no transfer of Your Personal Data will take place to an organization or a country unless there are adequate controls in place, including the security of Your data and other personal information.",
        ],
    },
    {
        heading: "Delete Your Personal Data",
        body: [
            "You have the right to delete or request that We assist in deleting the Personal Data that We have collected about You.",
            "Our Service may give You the ability to delete certain information about You from within the Service.",
            "You may update, amend, or delete Your information at any time by signing in to Your Account, if You have one, and visiting the account settings section that allows You to manage Your personal information. You may also contact Us to request access to, correct, or delete any Personal Data that You have provided to Us.",
            "Please note, however, that We may need to retain certain information when We have a legal obligation or lawful basis to do so.",
        ],
    },
    {
        heading: "Disclosure of Your Personal Data",
        body: [
            "Business Transactions. If the Company is involved in a merger, acquisition or asset sale, Your Personal Data may be transferred. We will provide notice before Your Personal Data is transferred and becomes subject to a different Privacy Policy.",
            "Law Enforcement. Under certain circumstances, the Company may disclose Your Personal Data if required to do so by law or in response to valid requests by public authorities (e.g. a court or a government agency).",
            "Other Legal Requirements. The Company may disclose Your Personal Data in the good-faith belief that such action is necessary to:",
        ],
        list: [
            "Comply with a legal obligation",
            "Protect and defend the rights or property of the Company",
            "Prevent or investigate possible wrongdoing in connection with the Service",
            "Protect the personal safety of Users of the Service or the public",
            "Protect against legal liability",
        ],
    },
    {
        heading: "Security of Your Personal Data",
        body: [
            "The security of Your Personal Data is important to Us, but remember that no method of transmission over the Internet, or method of electronic storage, is 100% secure. While We strive to use commercially reasonable means to protect Your Personal Data, We cannot guarantee its absolute security.",
        ],
    },
    {
        heading: "Service Providers We use",
        body: [
            "The Service Providers We use may have access to Your Personal Data. These third-party vendors collect, store, use, process and transfer information about Your activity on Our Service in accordance with their Privacy Policies.",
            "We may use third-party Service Providers to maintain and improve Our Service.",
        ],
        list: [
            "Google Places: a service that returns information about places using HTTP requests. It is operated by Google. Google Places service may collect information from You and from Your Device for security purposes. The information gathered by Google Places is held in accordance with the Privacy Policy of Google: https://www.google.com/intl/en/policies/privacy/",
            "Clerk: their Privacy Policy can be viewed at https://clerk.com/legal/privacy",
            "WhatsApp Business Platform: their Privacy Policy can be viewed at https://www.whatsapp.com/legal/business-app-privacy-policy",
        ],
    },
    {
        heading: "Children's and Minors' Privacy",
        body: [
            "The Service is not directed to, and We do not knowingly collect Personal Information from, anyone under the age of 16.",
            "If You are a parent or guardian and You believe Your child has provided Us with Personal Information, please contact Us. If We become aware that We have collected Personal Information from anyone under the age of 16, We will take steps to remove that information from Our servers as soon as reasonably possible.",
            "Some countries and states set a higher age at which an individual can consent to the processing of their own Personal Information. Where We rely on consent as a legal basis and the law applicable to a User sets an age higher than 16, We may require the consent of that User's parent or guardian before We collect and use their Personal Information.",
        ],
    },
    {
        heading: "Links to Other Websites",
        body: [
            "Our Service may contain links to other websites that are not operated by Us. If You click on a third-party link, You will be directed to that third party's site. We strongly advise You to review the Privacy Policy of every site You visit.",
            "We have no control over and assume no responsibility for the content, privacy policies or practices of any third-party sites or services.",
        ],
    },
    {
        heading: "Changes to this Privacy Policy",
        body: [
            "We may update Our Privacy Policy from time to time. We will notify You of any changes by posting the new Privacy Policy on this page.",
            `We will let You know via email and/or a prominent notice on Our Service, prior to the change becoming effective and update the "Last updated" date at the top of this Privacy Policy.`,
            "You are advised to review this Privacy Policy periodically for any changes. Changes to this Privacy Policy are effective when they are posted on this page.",
        ],
    },
    {
        heading: "Contact Us",
        body: [
            "If You have any questions about this Privacy Policy, You can contact Us:",
        ],
        list: [
            "By email: rcstravels.business@gmail.com",
            "By phone: 8586088085",
        ],
    },
]

/* ── Refunds & Cancellation ────────────────────────────────────────────────── */

const refunds = [
    {
        heading: "Start here: nothing is prepaid",
        body: [
            "You pay your driver at the end of the trip, in cash or by UPI. Nothing is collected when you book. So in almost every case there's nothing to refund. A cancelled ride is simply a ride you never pay for.",
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
            `Where you've overpaid, we return the difference by UPI to the number you booked with. [TO CONFIRM: the timeline you're willing to commit to; 7 working days is the usual promise. Say a number; "as soon as possible" is what people complain about.]`,
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
            "Use the cancel option on your ride's tracking page, or call us and we'll do it for you. Cancelling by telling the driver isn't enough on its own. The booking stays open in our system until it's cancelled there.",
        ],
    },
]

/* ── Grievance Redressal ───────────────────────────────────────────────────── */

const grievance = [
    {
        heading: "Try support first",
        body: [
            "Most problems, such as a fare that looks wrong, a driver who didn't arrive, or something left in a vehicle, are sorted the same day by calling or messaging us. Start there. This page is for when that hasn't worked, or when what happened is serious enough to be put on record.",
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
            `Name: ${entity.grievanceOfficer}`,
            `Designation: ${entity.grievanceDesignation}`,
            `Email: ${entity.grievanceEmail}`,
            `Phone: ${entity.grievancePhone}`,
            `Address: ${entity.address}`,
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

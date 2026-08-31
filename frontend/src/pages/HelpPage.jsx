import { useState } from "react"
import Icon from '@mdi/react';
import { mdiPhone, mdiWhatsapp, mdiEmailOutline, mdiChevronDown } from '@mdi/js';
import AccountLayout from "../components/ui/AccountLayout";
import SettingRow from "../components/ui/SettingRow";
import CircleIconButton from "../components/ui/CircleIconButton";
import { supportPhoneDisplay, supportEmail, callSupport, emailSupport, openSupportWhatsApp } from "../constants/support";

const items = ["FAQ", "Contact Us", "Cancellation"]

const faqs = [
    {
        q: "How do I book a ride?",
        a: "Book right from the home page: choose your pickup and drop, a date, time, and vehicle. You'll see the full fare before you confirm. You can also book by messaging us on WhatsApp.",
    },
    {
        q: "How far in advance can I book?",
        a: "Anywhere from 30 minutes up to 7 days before pickup. Need a cab right now? On-spot bookings work too, subject to driver availability nearby.",
    },
    {
        q: "When will I get my driver's details?",
        a: "About an hour before your pickup time. Your driver's name, phone number, and vehicle number will appear on your ride's tracking page, and you can call them directly from there.",
    },
    {
        q: "Which vehicles can I choose from?",
        a: "A 4-seater for everyday trips or a 6-seater when you're travelling with family or luggage. Fares for both are shown before you confirm.",
    },
    {
        q: "Do you offer outstation or shared rides?",
        a: "Yes, both. Sharing is an option in the booking form — split the fare with co-riders on the same route. Outstation trips are priced by the day rather than by the route, so they're arranged with us directly; see the Outstation page for how they work.",
    },
    {
        q: "How do I track my ride?",
        a: "Once your booking is confirmed you'll land on the tracking page, where you can watch your driver arrive live and follow the trip in real time.",
    },
    {
        q: "How do I pay?",
        a: "Pay the driver directly at the end of your ride, in cash or by UPI, whichever you prefer. The amount is exactly the fare you saw when booking.",
    },
    {
        q: "Can I cancel a booking?",
        a: "Yes, from your ride's tracking page or by calling us. Cancellation is free while your driver is more than 500 metres from pickup. For a scheduled ride, the paid 15% advance is retained once the driver is within 500 metres. See the Cancellation tab for the full policy.",
    },
]

const contacts = [
    ["Call us", "Talk to us about a booking or an ongoing ride.", supportPhoneDisplay(), mdiPhone, callSupport],
    ["WhatsApp us", "Chat with us. You can even book your ride right from WhatsApp.", supportPhoneDisplay(), mdiWhatsapp, () => openSupportWhatsApp()],
    ["Email us", "For feedback, complaints, or anything that can wait a little.", supportEmail(), mdiEmailOutline, emailSupport],
]

const cancellationPolicy = [
    ["Before your driver is nearby", "Cancellation is free while no driver is assigned or your driver is more than 500 metres from pickup."],
    ["When your driver is nearby", "Once your driver's current location is within 500 metres of pickup, cancelling a scheduled ride retains the paid 15% advance for the driver's time and fuel."],
    ["How to cancel", "Use the cancel option on your ride's tracking page, or call us and we'll do it for you."],
]

const HelpPage = () => {
    const [selected, setSelected] = useState(0)
    const [openFaq, setOpenFaq] = useState(null)

    return (
        <AccountLayout items={items} selected={selected} onSelect={(i) => { setSelected(i); setOpenFaq(null) }} title="Help">
            <ul className="flex flex-col items-start gap-4 justify-start w-full overflow-y-auto min-h-0 pb-6">
                {selected === 0 && faqs.map(({ q, a }, i) => (
                    <li
                        key={q}
                        onClick={() => setOpenFaq(openFaq === i ? null : i)}
                        className="font-normal w-full select-none cursor-pointer py-5 px-6 rounded-3xl flex flex-col bg-pastel-primary text-[var(--text-foreground)] transition-opacity duration-200 hover:opacity-80"
                    >
                        <div className="w-full flex justify-between items-center gap-3">
                            <h4 className="text-lg font-medium">{q}</h4>
                            <Icon path={mdiChevronDown} size={1} className={`shrink-0 text-[var(--background-primary)]/60 transition-transform duration-300 ${openFaq === i ? "rotate-180" : ""}`} />
                        </div>
                        <div className={`grid transition-[grid-template-rows] duration-300 ${openFaq === i ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                            <div className="overflow-hidden">
                                <p className={`text-base text-[var(--background-primary)]/60 pt-2 pr-8 transition-opacity duration-300 ${openFaq === i ? "opacity-100" : "opacity-0"}`}>{a}</p>
                            </div>
                        </div>
                    </li>
                ))}
                {selected === 0 && (
                    <p className="text-sm text-[var(--background-primary)]/50 px-2">Didn't find your answer? <span onClick={() => setSelected(1)} className="cursor-pointer underline underline-offset-2 hover:text-[var(--background-primary)] transition-color duration-300">Contact us</span>, we're happy to help.</p>
                )}

                {selected === 1 && contacts.map(([title, desc, value, icon, onClick]) => (
                    <SettingRow key={title} tone="bg-pastel-teal" trailing={<CircleIconButton icon={icon} size={0.85} onClick={onClick} />}>
                        <h4 className="text-lg font-medium">{title}</h4>
                        <p className="text-base text-[var(--background-primary)]/50">{desc}</p>
                        <p className="text-sm text-[var(--background-primary)]/70 pt-1">{value}</p>
                    </SettingRow>
                ))}

                {selected === 2 && cancellationPolicy.map(([title, desc]) => (
                    <SettingRow key={title} tone="bg-pastel-sand">
                        <h4 className="text-lg font-medium">{title}</h4>
                        <p className="text-base text-[var(--background-primary)]/50">{desc}</p>
                    </SettingRow>
                ))}
                {selected === 2 && (
                    <p className="text-sm text-[var(--background-primary)]/50 px-2">If your driver cancels or doesn't show up, you're never charged, and we'll help you rebook right away.</p>
                )}
            </ul>
        </AccountLayout>
    )
}

export default HelpPage

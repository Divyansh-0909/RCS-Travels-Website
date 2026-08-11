import { useCallback, useEffect, useRef, useState } from "react";

// Pulls the OTP off the clipboard so the boxes fill themselves.
//
// The code arrives over WhatsApp (see sendOtpWhatsApp in
// backend/services/notification.js), and neither autofill path the browser
// offers can read it: iOS's autocomplete="one-time-code" and Chrome's WebOTP
// are both wired to SMS only. What the WhatsApp authentication template does
// give us is a "Copy code" button — one tap and the code is on the clipboard.
// This hook is the other half of that tap.
//
// Reading the clipboard needs permission. Chrome asks once per origin and
// remembers the answer, so the two halves split like this: `paste` runs inside
// a real click, which is where the prompt is allowed to appear, and covers the
// first visit; the effect below covers every visit after it, filling the boxes
// on its own as soon as the tab is looked at again. Safari and Firefox never
// grant standing permission, so there the tap stays the whole story.

// Exactly `length` digits with no digit either side, so "code 123456 expires in
// 5 min" yields the code and a longer run of digits yields nothing. Written
// without lookbehind, which Safari only learned in 16.4.
const extractCode = (text, length) => {
    const match = String(text ?? "").match(new RegExp(`(?:\\D|^)(\\d{${length}})(?:\\D|$)`));
    return match?.[1] ?? null;
};

export function useOtpClipboard({ enabled, length = 6, onCode }) {
    const [supported] = useState(
        () => typeof navigator !== "undefined" && Boolean(navigator.clipboard?.readText)
    );

    // Read through refs so the effect below doesn't tear down and re-run — and
    // re-read the clipboard — every time the page re-renders with a new closure.
    const onCodeRef = useRef(onCode);
    onCodeRef.current = onCode;

    // A code that has already been through the boxes once. Verification failing
    // clears them, which re-enables this hook; without the guard it would put
    // the same rejected code straight back and the user would sit there
    // pressing Confirm on it. A deliberate paste ignores the guard.
    const filled = useRef(null);

    const fill = useCallback(async (auto) => {
        try {
            const code = extractCode(await navigator.clipboard.readText(), length);
            if (!code || (auto && code === filled.current)) return false;
            filled.current = code;
            onCodeRef.current?.(code);
            return true;
        } catch {
            // Denied, dismissed, or the document wasn't focused. There is
            // nothing to report: the boxes are still there to type into.
            return false;
        }
    }, [length]);

    const paste = useCallback(() => fill(false), [fill]);

    useEffect(() => {
        if (!enabled || !supported) return;

        let cancelled = false;

        const fillIfAllowed = async () => {
            // readText() rejects on an unfocused document, and a background tab
            // has no business reading the clipboard anyway.
            if (document.visibilityState !== "visible" || !document.hasFocus()) return;
            try {
                const status = await navigator.permissions?.query({ name: "clipboard-read" });
                // Only when the user has already said yes. Prompting is `paste`'s
                // job, where a click explains what the browser is asking about.
                if (status?.state !== "granted") return;
            } catch {
                // Firefox and Safari don't expose the permission at all — leave
                // the clipboard alone and let the button do the work.
                return;
            }
            if (!cancelled) fill(true);
        };

        fillIfAllowed();
        window.addEventListener("focus", fillIfAllowed);
        document.addEventListener("visibilitychange", fillIfAllowed);
        return () => {
            cancelled = true;
            window.removeEventListener("focus", fillIfAllowed);
            document.removeEventListener("visibilitychange", fillIfAllowed);
        };
    }, [enabled, supported, fill]);

    return { supported, paste };
}

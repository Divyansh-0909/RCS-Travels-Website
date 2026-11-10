// Shared geometry and normal chrome; callers keep their existing validation copy.
export const fieldWidth = "w-[86vw] max-w-full sm:w-[377px]";
export const fieldGeometry = "h-12 min-h-12 w-full min-w-0 rounded-xl border px-4 py-2.5 text-base font-medium leading-6 outline-none transition-colors duration-150 motion-reduce:transition-none";
export const fieldSurface = "bg-[var(--input-background)] text-[var(--text)] placeholder:text-[var(--input-placeholder)]";
export const fieldBorder = "border-[var(--input-border)] focus:border-primary";
export const fieldClass = `${fieldGeometry} ${fieldSurface} ${fieldBorder}`;
export const textareaClass = `min-h-24 w-full min-w-0 resize-y rounded-xl border px-4 py-3 text-base leading-6 outline-none transition-colors duration-150 motion-reduce:transition-none ${fieldSurface} ${fieldBorder}`;

import { forwardRef } from "react";
import Icon from "@mdi/react";

// The auth back-button face is 40px. Floating sheet controls use a 36px face;
// both retain a 44px native target rather than shrinking their hit area.
const IconButton = forwardRef(function IconButton({ icon, size = 1, ariaLabel, compact = false, children, className = "", faceClassName = "bg-[var(--input-background)] text-[var(--text)]", ...props }, ref) {
  return (
    <button type="button" {...props} ref={ref} aria-label={ariaLabel ?? props["aria-label"]} data-size="icon" className={`rcs-icon-button group size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 outline-none focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed disabled:opacity-50 ${className}`}>
      <span data-icon-face className={`grid ${compact === "mobile" ? "size-10 max-sm:size-9" : compact ? "size-9" : "size-10"} shrink-0 place-items-center rounded-full transition-opacity duration-150 group-hover:opacity-80 group-active:opacity-70 motion-reduce:transition-none ${faceClassName}`}>
        {icon ? <Icon path={icon} size={size} aria-hidden="true" /> : children}
      </span>
    </button>
  );
});
export default IconButton;

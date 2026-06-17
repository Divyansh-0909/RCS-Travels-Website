import { useNavigate } from "react-router-dom";
import { useCallback } from "react";

export function useViewNavigate() {
  const navigate = useNavigate();

  return useCallback(
    (to, options) => {
      // Delta navigations like navigate(-1) don't take options.
      if (typeof to === "number") return navigate(to);
      return navigate(to, { viewTransition: true, ...options });
    },
    [navigate]
  );
}

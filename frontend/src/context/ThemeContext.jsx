import { createContext, useContext, useEffect, useState } from "react";

export const ThemeContext = createContext();

const THEME_STORAGE_KEY = "rcs.website.theme";
const preferences = new Set(["system", "light", "dark"]);

const systemTheme = () => window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

const initialPreference = () => {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (preferences.has(saved)) return saved;

  // One-time migration from the former boolean preference.
  const legacy = localStorage.getItem("darkMode");
  if (legacy === "true") return "dark";
  if (legacy === "false") return "light";
  return "system";
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(initialPreference);
  const [system, setSystem] = useState(systemTheme);
  const resolvedTheme = theme === "system" ? system : theme;
  const darkMode = resolvedTheme === "dark";

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setSystem(mediaQuery.matches ? "dark" : "light");
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, resolvedTheme, darkMode, setDarkMode: (value) => setTheme(value ? "dark" : "light") }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);

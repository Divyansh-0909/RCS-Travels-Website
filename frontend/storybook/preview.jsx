import React, { useEffect } from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, useTheme } from '../src/context/ThemeContext';
import '../src/i18n';
import '../src/index.css';

function ThemeSurface({ theme, children }) {
  const { setTheme, resolvedTheme } = useTheme();
  useEffect(() => { setTheme(theme); }, [theme, setTheme]);
  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);
  return <main className="min-h-screen bg-canvas text-ink p-6">{children}</main>;
}
export default {
  globalTypes: { theme: { description: 'Existing application theme', toolbar: { icon: 'circlehollow', items: ['light', 'dark'], dynamicTitle: true } } },
  initialGlobals: { theme: 'light' },
  parameters: { layout: 'fullscreen', a11y: { test: 'error', manual: true }, chromatic: { disableSnapshot: false } },
  decorators: [(Story, context) => <MemoryRouter><ThemeProvider><ThemeSurface theme={context.globals.theme}><Story /></ThemeSurface></ThemeProvider></MemoryRouter>],
};

window.__p07Intents = [];
if (new URLSearchParams(location.search).get('p07-text') === '200') document.documentElement.style.fontSize = '32px';
window.__p07Intent = value => { window.__p07Intents.push(String(value)); return null; };
window.open = value => window.__p07Intent(value);
try { Object.defineProperty(navigator, 'share', { configurable: true, value: async value => window.__p07Intent(JSON.stringify(value)) }); } catch {}
try { Object.defineProperty(navigator.clipboard, 'writeText', { configurable: true, value: async value => window.__p07Intent('clipboard:' + value) }); } catch {}
try { Object.defineProperty(navigator.geolocation, 'getCurrentPosition', { configurable: true, value: (_ok, fail) => fail?.({ code: 1, message: 'P07 fixture: location disabled' }) }); } catch {}
document.addEventListener('click', event => { const link = event.target.closest?.('a'); if (link && /^(?:https?:|tel:|mailto:|whatsapp:)/.test(link.href) && !link.href.startsWith(location.origin + '/')) { event.preventDefault(); window.__p07Intent(link.href); } }, true);
document.title = 'P07 — Synthetic tracking audit';

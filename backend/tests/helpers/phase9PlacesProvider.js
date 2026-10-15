export const syntheticPlaces = [
  { id: 'phase9-pickup', address: 'Synthetic Delhi pickup', lat: 28.6129, lng: 77.2295 },
  { id: 'phase9-drop', address: 'Synthetic Delhi drop', lat: 28.6315, lng: 77.2167 },
];

// Substitute external HTTP only. Real Google DTO parsing, pricing and signed
// quotes continue through the application's protected/service paths.
export function installPhase9PlacesProvider() {
  const original = globalThis.fetch;
  const observations = [];
  globalThis.fetch = async (input, options = {}) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) return original(input, options);
    let data;
    if (url.href === 'https://routes.googleapis.com/directions/v2:computeRoutes') {
      data = { routes: [{ distanceMeters: 4200, duration: '1080s', staticDuration: '1080s',
        polyline: { encodedPolyline: 'shsmDkakvMgwBnqA' }, legs: [{ duration: '1080s', distanceMeters: 4200 }] }] };
    } else if (url.href === 'https://places.googleapis.com/v1/places:autocomplete') {
      const query = JSON.parse(options.body).input.toLowerCase();
      data = { suggestions: syntheticPlaces.filter(place => place.address.toLowerCase().includes(query)).map(place => ({
        placePrediction: { placeId: place.id, text: { text: place.address },
          structuredFormat: { mainText: { text: place.address }, secondaryText: { text: 'Synthetic fixture' } } },
      })) };
    } else if (url.origin === 'https://places.googleapis.com' && url.pathname.startsWith('/v1/places/')) {
      const place = syntheticPlaces.find(row => row.id === url.pathname.split('/').at(-1));
      if (!place) throw new Error('Unknown synthetic place');
      data = { id: place.id, formattedAddress: place.address, location: { latitude: place.lat, longitude: place.lng } };
    } else throw new Error('External UI provider transport denied');
    observations.push({ url: url.href, method: options.method ?? 'GET', body: options.body ? JSON.parse(options.body) : null, response: data });
    return Response.json(data);
  };
  return { observations, restore() { globalThis.fetch = original; } };
}

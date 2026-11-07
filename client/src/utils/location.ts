/**
 * Calle y ciudad donde está el usuario, para anotarlo en el gasto. Nunca falla:
 * sin permiso, sin GPS o si tarda demasiado devuelve ''.
 */
export const getCurrentLocationName = async (): Promise<string> => {
  try {
    const getPosition = () => new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('No geolocation'));
      navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000, maximumAge: 0 });
    });
    // Timeout propio: iOS a veces ignora el de getCurrentPosition
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Geolocalización expirada')), 4000));
    const pos = await Promise.race([getPosition(), timeout]);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.coords.latitude}&lon=${pos.coords.longitude}`,
      { signal: controller.signal }
    );
    clearTimeout(timeoutId);
    if (!res.ok) return '';
    const data = await res.json();
    return data.address?.road
      ? `${data.address.road}, ${data.address.city || data.address.town || ''}`
      : data.display_name || '';
  } catch (e) {
    console.log('No se pudo obtener localización', e);
    return '';
  }
};

import { Capacitor } from '@capacitor/core';

export type Coordinates = { lat: number; lng: number };

export const DEFAULT_MAP_CENTER: Coordinates = { lat: -23.5613, lng: -46.6565 };

async function getNativeCoordinates(): Promise<Coordinates> {
  const { Geolocation } = await import('@capacitor/geolocation');
  let permissions = await Geolocation.checkPermissions();

  if (
    permissions.location === 'prompt' ||
    permissions.location === 'prompt-with-rationale' ||
    permissions.coarseLocation === 'prompt' ||
    permissions.coarseLocation === 'prompt-with-rationale'
  ) {
    permissions = await Geolocation.requestPermissions();
  }

  if (permissions.location === 'denied' && permissions.coarseLocation === 'denied') {
    throw new Error('Permissão de localização negada.');
  }

  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: true,
    timeout: 10_000,
    maximumAge: 0,
  });

  return { lat: position.coords.latitude, lng: position.coords.longitude };
}

function getBrowserCoordinates(): Promise<Coordinates> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalização não disponível neste dispositivo.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      reject,
      { enableHighAccuracy: true, timeout: 8_000, maximumAge: 0 }
    );
  });
}

export async function getCurrentCoordinates(): Promise<Coordinates> {
  return Capacitor.isNativePlatform() ? getNativeCoordinates() : getBrowserCoordinates();
}

export async function reverseGeocodeCoordinates(coords: Coordinates) {
  const query = new URLSearchParams({
    format: 'jsonv2',
    lat: String(coords.lat),
    lon: String(coords.lng),
    addressdetails: '1',
    'accept-language': 'pt-BR',
  });
  const response = await fetch(`https://nominatim.openstreetmap.org/reverse?${query}`);
  if (!response.ok) throw new Error('Não foi possível consultar o endereço.');
  const data = await response.json() as { address?: Record<string, string> };
  const address = data.address ?? {};

  return {
    street: address.road || address.pedestrian || address.residential || '',
    city: address.city || address.town || address.village || address.municipality || '',
    district: address.suburb || address.neighbourhood || address.city_district || '',
  };
}

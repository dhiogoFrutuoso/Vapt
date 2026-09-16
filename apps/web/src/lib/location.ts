import { Capacitor } from '@capacitor/core';
import type { PermissionStatus } from '@capacitor/geolocation';

export type Coordinates = { lat: number; lng: number };
export type LocationFailureReason = 'permission-denied' | 'services-disabled' | 'unavailable';

export class LocationFailure extends Error {
  constructor(public readonly reason: LocationFailureReason, message: string) {
    super(message);
    this.name = 'LocationFailure';
  }
}

export const DEFAULT_MAP_CENTER: Coordinates = { lat: -23.5613, lng: -46.6565 };

async function getNativeCoordinates(): Promise<Coordinates> {
  const { Geolocation } = await import('@capacitor/geolocation');
  let permissions: PermissionStatus;

  try {
    permissions = await Geolocation.checkPermissions();
  } catch {
    throw new LocationFailure(
      'services-disabled',
      'Ative a localização (GPS) do aparelho e toque novamente.'
    );
  }

  const granted = () =>
    permissions.location === 'granted' || permissions.coarseLocation === 'granted';

  if (!granted()) {
    try {
      permissions = await Geolocation.requestPermissions({
        permissions: ['location', 'coarseLocation'],
      });
    } catch {
      throw new LocationFailure(
        'services-disabled',
        'Ative a localização (GPS) do aparelho e toque novamente.'
      );
    }
  }

  if (!granted()) {
    throw new LocationFailure(
      'permission-denied',
      'Permita o acesso à localização nas configurações do Android e toque novamente.'
    );
  }

  try {
    const position = await Geolocation.getCurrentPosition({
      enableHighAccuracy: permissions.location === 'granted',
      timeout: 15_000,
      maximumAge: 0,
    });

    return { lat: position.coords.latitude, lng: position.coords.longitude };
  } catch {
    throw new LocationFailure(
      'unavailable',
      'Não foi possível obter a posição atual. Vá para um local aberto, ative o GPS e tente novamente.'
    );
  }
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

export function isNativeLocationPlatform(): boolean {
  return Capacitor.isNativePlatform();
}

export function getLocationFailureMessage(error: unknown): string {
  return error instanceof LocationFailure
    ? error.message
    : 'Não foi possível obter sua posição atual. Verifique a localização do aparelho e tente novamente.';
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

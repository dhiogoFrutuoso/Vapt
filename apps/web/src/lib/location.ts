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

function withTimeout<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('location timeout')), milliseconds);
    operation.then(
      (value) => { window.clearTimeout(timer); resolve(value); },
      (error) => { window.clearTimeout(timer); reject(error); }
    );
  });
}

async function getNativeCoordinates(): Promise<Coordinates> {
  const { Geolocation } = await import('@capacitor/geolocation');
  if (!Capacitor.isPluginAvailable('Geolocation')) {
    throw new LocationFailure('unavailable', 'A localização nativa não está disponível nesta instalação. Atualize o APK e tente novamente.');
  }
  let permissions: PermissionStatus | undefined;

  try {
    permissions = await Geolocation.checkPermissions();
  } catch {
    // O plugin também rejeita checkPermissions quando não consegue ler o serviço
    // do sistema. getCurrentPosition solicita a permissão nativa por conta própria.
    // Não confundir esta falha com GPS desligado antes de tentar a captura.
  }

  const granted = () => permissions?.location === 'granted' || permissions?.coarseLocation === 'granted';

  if (permissions && !granted()) {
    try {
      permissions = await Geolocation.requestPermissions({
        permissions: ['location', 'coarseLocation'],
      });
    } catch {
      // A tentativa direta abaixo ainda aciona o diálogo nativo do Android.
    }
  }

  if (permissions && !granted() && permissions.location === 'denied' && permissions.coarseLocation === 'denied') {
    throw new LocationFailure(
      'permission-denied',
      'Permita o acesso à localização nas configurações do Android e toque novamente.'
    );
  }

  let lastError: unknown;
  const accuracyAttempts = permissions?.location === 'granted' || permissions == null ? [true, false] : [false];
  for (const highAccuracy of accuracyAttempts) {
    try {
      // O timeout do plugin é ignorado no Android 6.x; esta proteção evita
      // deixar o usuário preso indefinidamente enquanto busca satélites.
      const position = await withTimeout(
        Geolocation.getCurrentPosition({ enableHighAccuracy: highAccuracy, timeout: 12_000, maximumAge: 5_000 }),
        highAccuracy ? 15_000 : 10_000
      );
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
      lastError = new Error('location unavailable');
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
      if (/permission|denied|not authorized/.test(message)) {
        throw new LocationFailure('permission-denied', 'Permita o acesso à localização para o Vapt nas configurações do Android.');
      }
      if (/location services are not enabled|location disabled/.test(message)) {
        throw new LocationFailure('services-disabled', 'Ative a localização geral do Android e tente novamente. A permissão do Vapt sozinha não liga o serviço do aparelho.');
      }
      if (/not implemented|not available on android/.test(message)) {
        throw new LocationFailure('unavailable', 'O plugin de localização não está presente neste APK. Instale a versão atualizada do aplicativo.');
      }
    }
  }
  const message = lastError instanceof Error ? lastError.message.toLowerCase() : String(lastError).toLowerCase();
  throw new LocationFailure('unavailable', /google play services/.test(message)
    ? 'Os serviços de localização do Google não estão disponíveis neste aparelho. Informe o endereço manualmente ou ajuste o pino no mapa.'
    : 'Não foi possível obter a posição atual. Tente novamente em local aberto ou ajuste o pino no mapa.');
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

import { useState, useRef, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import { LocateFixed } from 'lucide-react';
import { getCurrentCoordinates, getLocationFailureMessage, type Coordinates } from '../../lib/location';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Corrigir ícone padrão do Leaflet no React
import iconRetina from 'leaflet/dist/images/marker-icon-2x.png';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import shadowUrl from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;

L.Icon.Default.mergeOptions({
  iconRetinaUrl: iconRetina,
  iconUrl: iconUrl,
  shadowUrl: shadowUrl,
});

type Props = {
  initialCenter: { lat: number; lng: number };
  onConfirm: (coords: { lat: number; lng: number }) => void;
  onCancel: () => void;
};

function MapPosition({ center, revision, onSelect }: { center: Coordinates; revision: number; onSelect: (coords: Coordinates) => void }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    map.setView([center.lat, center.lng], 17, { animate: false });
  }, [map, center.lat, center.lng, revision]);
  useMapEvents({ click: e => onSelect({ lat: e.latlng.lat, lng: e.latlng.lng }) });
  return null;
}

export function MapPicker({ initialCenter, onConfirm, onCancel }: Props) {
  const [position, setPosition] = useState(initialCenter);
  const [center, setCenter] = useState(initialCenter);
  const [revision, setRevision] = useState(0);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  const markerRef = useRef<L.Marker>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    setPosition(initialCenter);
    setCenter(initialCenter);
  }, [initialCenter.lat, initialCenter.lng]);

  async function locate() {
    setLocating(true);
    setError(null);
    try {
      const coords = await getCurrentCoordinates();
      if (!alive.current) return;
      setPosition(coords);
      setCenter(coords);
      setRevision(value => value + 1);
    } catch (cause) {
      if (alive.current) setError(getLocationFailureMessage(cause));
    } finally {
      if (alive.current) setLocating(false);
    }
  }

  const eventHandlers = useMemo(
    () => ({
      dragend() {
        const marker = markerRef.current;
        if (marker != null) {
          const latLng = marker.getLatLng();
          setPosition({ lat: latLng.lat, lng: latLng.lng });
        }
      },
    }),
    []
  );

  return (
    <div className="map-picker-modal">
      <div className="map-picker-header">
        <h3>Confirme sua localização</h3>
        <p>O pino começa na posição informada pelo aparelho. Ajuste-o até a entrada do endereço, se precisar.</p>
        <button type="button" className="phone__sheet-btn map-picker-locate" disabled={locating} onClick={() => void locate()}>
          <LocateFixed size={18} aria-hidden="true" />{locating ? 'Buscando sua posição…' : 'Minha localização'}
        </button>
        {error && <p role="alert">{error}</p>}
      </div>

      <div className="map-picker-body">
        <MapContainer
          center={[initialCenter.lat, initialCenter.lng]}
          zoom={17}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%', zIndex: 1 }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapPosition center={center} revision={revision} onSelect={setPosition} />
          <Marker
            draggable={true}
            eventHandlers={eventHandlers}
            position={[position.lat, position.lng]}
            ref={markerRef}
            alt="Local de entrega selecionado"
          />
        </MapContainer>
      </div>

      <div className="map-picker-footer">
        <button type="button" className="btn btn--ghost" onClick={onCancel} style={{ flex: 1 }}>
          Cancelar
        </button>
        <button type="button" className="btn btn--primary" disabled={locating} onClick={() => onConfirm(position)} style={{ flex: 1 }}>
          Confirmar Localização
        </button>
      </div>
    </div>
  );
}

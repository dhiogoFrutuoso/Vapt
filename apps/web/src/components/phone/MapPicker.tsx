import { useState, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
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

export function MapPicker({ initialCenter, onConfirm, onCancel }: Props) {
  const [position, setPosition] = useState(initialCenter);
  const markerRef = useRef<L.Marker>(null);

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

  function MapClickHandler() {
    useMapEvents({
      click(e) {
        setPosition({ lat: e.latlng.lat, lng: e.latlng.lng });
      },
    });
    return null;
  }

  return (
    <div className="map-picker-modal">
      <div className="map-picker-header">
        <h3>Ajuste sua localização</h3>
        <p>Aproxime o mapa e arraste o pino exatamente para cima da sua casa</p>
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
          <MapClickHandler />
          <Marker
            draggable={true}
            eventHandlers={eventHandlers}
            position={[position.lat, position.lng]}
            ref={markerRef}
          />
        </MapContainer>
      </div>

      <div className="map-picker-footer">
        <button type="button" className="btn btn--ghost" onClick={onCancel} style={{ flex: 1 }}>
          Cancelar
        </button>
        <button type="button" className="btn btn--primary" onClick={() => onConfirm(position)} style={{ flex: 1 }}>
          Confirmar Localização
        </button>
      </div>
    </div>
  );
}

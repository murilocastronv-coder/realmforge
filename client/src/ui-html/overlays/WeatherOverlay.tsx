import { useComputed } from '@preact/signals';
import { currentWeather } from '../../store/GameStore';

export function WeatherOverlay() {
  const weather = useComputed(() => currentWeather.value);

  const w = weather.value;
  if (w.weather === 'clear') return null;

  const overlayStyle: Record<string, string> = {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    zIndex: '5',
    transition: 'opacity 2s ease',
  };

  if (w.weather === 'rain' || w.weather === 'storm') {
    return (
      <div style={overlayStyle} class="weather-rain">
        <div
          style={{
            position: 'absolute',
            inset: '0',
            background: `linear-gradient(180deg, transparent, rgba(100,130,200,${w.intensity * 0.15}))`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '0',
            backgroundImage: `repeating-linear-gradient(
              180deg,
              transparent,
              transparent 10px,
              rgba(180,200,255,${w.intensity * 0.08}) 10px,
              transparent 20px
            )`,
            backgroundSize: '4px 20px',
            animation: 'rain-fall 0.3s linear infinite',
          }}
        />
        <style>{`
          @keyframes rain-fall {
            from { background-position: 0 0; }
            to { background-position: 0 20px; }
          }
        `}</style>
      </div>
    );
  }

  if (w.weather === 'fog') {
    return (
      <div style={overlayStyle}>
        <div
          style={{
            position: 'absolute',
            inset: '0',
            background: `radial-gradient(ellipse at center, rgba(180,190,200,${w.intensity * 0.3}) 0%, transparent 70%)`,
          }}
        />
      </div>
    );
  }

  if (w.weather === 'snow') {
    return (
      <div style={overlayStyle} class="weather-snow">
        <div
          style={{
            position: 'absolute',
            inset: '0',
            background: `linear-gradient(180deg, transparent, rgba(200,210,230,${w.intensity * 0.1}))`,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '0',
            backgroundImage: `radial-gradient(2px 2px at 20% 30%, rgba(255,255,255,${w.intensity * 0.6}), transparent),
              radial-gradient(2px 2px at 60% 70%, rgba(255,255,255,${w.intensity * 0.5}), transparent),
              radial-gradient(1px 1px at 40% 50%, rgba(255,255,255,${w.intensity * 0.4}), transparent)`,
            backgroundSize: '200px 200px, 150px 150px, 100px 100px',
            animation: 'snow-fall 3s linear infinite',
          }}
        />
        <style>{`
          @keyframes snow-fall {
            from { background-position: 0 0, 0 0, 0 0; }
            to { background-position: 50px 200px, -30px 150px, 20px 100px; }
          }
        `}</style>
      </div>
    );
  }

  if (w.weather === 'cloudy') {
    return (
      <div style={overlayStyle}>
        <div
          style={{
            position: 'absolute',
            inset: '0',
            background: `rgba(50,60,70,${w.intensity * 0.15})`,
          }}
        />
      </div>
    );
  }

  return null;
}

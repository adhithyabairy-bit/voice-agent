'use client';

// ============================================================
// WaveformOrb — Animated voice orb for hero & demo sections
// Pure CSS animations, no canvas required.
// ============================================================

interface WaveformOrbProps {
  /** Size of the central orb in px (default 96) */
  size?: number;
  /** Whether the orb is in "active" (pulsing bars) mode */
  active?: boolean;
  /** Optional extra className */
  className?: string;
}

const BAR_HEIGHTS = [18, 28, 38, 46, 38, 28, 18]; // symmetric waveform shape

export function WaveformOrb({ size = 96, active = true, className = '' }: WaveformOrbProps) {
  return (
    <div
      className={`relative flex items-center justify-center select-none ${className}`}
      style={{ width: size * 2.8, height: size * 2.8 }}
      role="img"
      aria-label="Voice activity waveform"
    >
      {/* Outermost ambient ring */}
      <div
        className="absolute rounded-full animate-orb-ring"
        style={{
          width: size * 2.6,
          height: size * 2.6,
          background: 'radial-gradient(circle, rgba(255,90,31,0.08) 0%, transparent 70%)',
          animationDelay: '0s',
          animationDuration: '2.8s',
        }}
      />

      {/* Mid ring */}
      <div
        className="absolute rounded-full animate-orb-ring"
        style={{
          width: size * 2.0,
          height: size * 2.0,
          background: 'radial-gradient(circle, rgba(255,176,32,0.10) 0%, transparent 70%)',
          animationDelay: '0.7s',
          animationDuration: '2.8s',
        }}
      />

      {/* Inner glow ring */}
      <div
        className="absolute rounded-full animate-orb-ring"
        style={{
          width: size * 1.4,
          height: size * 1.4,
          background: 'radial-gradient(circle, rgba(255,90,31,0.15) 0%, transparent 70%)',
          animationDelay: '1.4s',
          animationDuration: '2.8s',
        }}
      />

      {/* Central orb */}
      <div
        className="relative rounded-full flex items-center justify-center animate-orb-pulse z-10"
        style={{
          width: size,
          height: size,
          background: 'linear-gradient(135deg, #FF5A1F 0%, #FFB020 100%)',
          boxShadow: '0 0 40px rgba(255, 90, 31, 0.5), 0 0 80px rgba(255, 176, 32, 0.2)',
        }}
      >
        {/* Waveform bars inside orb */}
        <div className="flex items-end justify-center gap-[3px]" style={{ height: size * 0.5 }}>
          {BAR_HEIGHTS.map((h, i) => (
            <div
              key={i}
              className={`rounded-full ${active ? 'orb-bar' : ''}`}
              style={{
                width: Math.max(3, size * 0.04),
                height: active ? h * (size / 96) : (h * 0.4) * (size / 96),
                background: 'rgba(255, 255, 255, 0.9)',
                minHeight: 3,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

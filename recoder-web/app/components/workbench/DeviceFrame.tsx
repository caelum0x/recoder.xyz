import { memo } from 'react';
import type { DeviceFrameStyle } from '~/lib/stores/preview-device';

interface DeviceFrameProps {
  frameStyle: DeviceFrameStyle;
  width: number;
  height: number;
  color?: 'black' | 'silver' | 'gold' | 'space-gray';
  showFrame?: boolean;
  children: React.ReactNode;
}

const BEZEL_COLORS: Record<string, string> = {
  black: '#1a1a1a',
  silver: '#c0c0c0',
  gold: '#d4af87',
  'space-gray': '#2d2d2d',
};

/**
 * DeviceFrame renders a CSS-based device bezel around children (typically a preview iframe).
 * Supports iPhone (Dynamic Island, Notch, Home Button), Android (Punch Hole, Pill), and Tablet frames.
 */
export const DeviceFrame = memo(function DeviceFrame({
  frameStyle,
  width,
  height,
  color = 'black',
  showFrame = true,
  children,
}: DeviceFrameProps) {
  if (!showFrame || frameStyle === 'none') {
    return (
      <div
        style={{
          width: `${width}px`,
          height: `${height}px`,
          border: '1px solid var(--bolt-elements-borderColor)',
          borderRadius: '4px',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {children}
      </div>
    );
  }

  const bezelColor = BEZEL_COLORS[color] || BEZEL_COLORS.black;

  switch (frameStyle) {
    case 'iphone-dynamic-island':
      return (
        <IPhoneDynamicIslandFrame width={width} height={height} bezelColor={bezelColor}>
          {children}
        </IPhoneDynamicIslandFrame>
      );
    case 'iphone-notch':
      return (
        <IPhoneNotchFrame width={width} height={height} bezelColor={bezelColor}>
          {children}
        </IPhoneNotchFrame>
      );
    case 'iphone-home-button':
      return (
        <IPhoneHomeButtonFrame width={width} height={height} bezelColor={bezelColor}>
          {children}
        </IPhoneHomeButtonFrame>
      );
    case 'android-punch-hole':
      return (
        <AndroidPunchHoleFrame width={width} height={height} bezelColor={bezelColor}>
          {children}
        </AndroidPunchHoleFrame>
      );
    case 'android-pill':
      return (
        <AndroidPillFrame width={width} height={height} bezelColor={bezelColor}>
          {children}
        </AndroidPillFrame>
      );
    case 'tablet':
      return (
        <TabletFrame width={width} height={height} bezelColor={bezelColor}>
          {children}
        </TabletFrame>
      );
    default:
      return (
        <div
          style={{
            width: `${width}px`,
            height: `${height}px`,
            border: '1px solid var(--bolt-elements-borderColor)',
            borderRadius: '4px',
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {children}
        </div>
      );
  }
});

// ---------------------------------------------------------------------------
// Shared types for internal frame components
// ---------------------------------------------------------------------------

interface FrameInternalProps {
  width: number;
  height: number;
  bezelColor: string;
  children: React.ReactNode;
}

// ---------------------------------------------------------------------------
// iPhone Dynamic Island
// ---------------------------------------------------------------------------

function IPhoneDynamicIslandFrame({ width, height, bezelColor, children }: FrameInternalProps) {
  const bezel = 12;
  const outerRadius = 50;
  const innerRadius = 40;
  const outerWidth = width + bezel * 2;
  const outerHeight = height + bezel * 2;

  return (
    <div
      style={{
        position: 'relative',
        width: `${outerWidth}px`,
        height: `${outerHeight}px`,
        backgroundColor: bezelColor,
        borderRadius: `${outerRadius}px`,
        border: '2px solid #000',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset, 0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      {/* Screen area */}
      <div
        style={{
          position: 'absolute',
          top: `${bezel}px`,
          left: `${bezel}px`,
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: `${innerRadius}px`,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        {children}
      </div>

      {/* Dynamic Island */}
      <div
        style={{
          position: 'absolute',
          top: `${bezel + 11}px`,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '126px',
          height: '37px',
          backgroundColor: '#000',
          borderRadius: '20px',
          zIndex: 10,
        }}
      />

      {/* Home indicator bar */}
      <div
        style={{
          position: 'absolute',
          bottom: `${bezel + 8}px`,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '134px',
          height: '5px',
          backgroundColor: 'rgba(255,255,255,0.3)',
          borderRadius: '3px',
          zIndex: 10,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// iPhone Notch
// ---------------------------------------------------------------------------

function IPhoneNotchFrame({ width, height, bezelColor, children }: FrameInternalProps) {
  const bezel = 12;
  const outerRadius = 50;
  const innerRadius = 40;
  const outerWidth = width + bezel * 2;
  const outerHeight = height + bezel * 2;
  const notchWidth = 210;
  const notchHeight = 30;

  return (
    <div
      style={{
        position: 'relative',
        width: `${outerWidth}px`,
        height: `${outerHeight}px`,
        backgroundColor: bezelColor,
        borderRadius: `${outerRadius}px`,
        border: '2px solid #000',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset, 0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      {/* Screen area */}
      <div
        style={{
          position: 'absolute',
          top: `${bezel}px`,
          left: `${bezel}px`,
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: `${innerRadius}px`,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        {children}
      </div>

      {/* Notch */}
      <div
        style={{
          position: 'absolute',
          top: `${bezel}px`,
          left: '50%',
          transform: 'translateX(-50%)',
          width: `${notchWidth}px`,
          height: `${notchHeight}px`,
          backgroundColor: bezelColor,
          borderRadius: '0 0 20px 20px',
          zIndex: 10,
        }}
      />

      {/* Home indicator bar */}
      <div
        style={{
          position: 'absolute',
          bottom: `${bezel + 8}px`,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '134px',
          height: '5px',
          backgroundColor: 'rgba(255,255,255,0.3)',
          borderRadius: '3px',
          zIndex: 10,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// iPhone Home Button
// ---------------------------------------------------------------------------

function IPhoneHomeButtonFrame({ width, height, bezelColor, children }: FrameInternalProps) {
  const sideBezel = 14;
  const topBezel = 80;
  const bottomBezel = 80;
  const outerRadius = 44;
  const innerRadius = 6;
  const outerWidth = width + sideBezel * 2;
  const outerHeight = height + topBezel + bottomBezel;

  return (
    <div
      style={{
        position: 'relative',
        width: `${outerWidth}px`,
        height: `${outerHeight}px`,
        backgroundColor: bezelColor,
        borderRadius: `${outerRadius}px`,
        border: '2px solid #000',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset, 0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      {/* Speaker grille */}
      <div
        style={{
          position: 'absolute',
          top: '32px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '60px',
          height: '6px',
          backgroundColor: '#111',
          borderRadius: '3px',
          border: '1px solid rgba(255,255,255,0.05)',
        }}
      />

      {/* Front camera */}
      <div
        style={{
          position: 'absolute',
          top: '26px',
          left: '50%',
          transform: 'translateX(-50%) translateX(48px)',
          width: '12px',
          height: '12px',
          backgroundColor: '#0a0a1a',
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.05)',
        }}
      />

      {/* Screen area */}
      <div
        style={{
          position: 'absolute',
          top: `${topBezel}px`,
          left: `${sideBezel}px`,
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: `${innerRadius}px`,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        {children}
      </div>

      {/* Home button */}
      <div
        style={{
          position: 'absolute',
          bottom: `${(bottomBezel - 58) / 2}px`,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '58px',
          height: '58px',
          borderRadius: '50%',
          backgroundColor: bezelColor,
          border: '2px solid #444',
          boxShadow: '0 0 0 1px rgba(255,255,255,0.06) inset',
        }}
      >
        {/* Home button inner square (Touch ID ring) */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            width: '20px',
            height: '20px',
            borderRadius: '4px',
            border: '1px solid #555',
          }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Android Punch Hole
// ---------------------------------------------------------------------------

function AndroidPunchHoleFrame({ width, height, bezelColor, children }: FrameInternalProps) {
  const bezel = 8;
  const outerRadius = 28;
  const innerRadius = 20;
  const outerWidth = width + bezel * 2;
  const outerHeight = height + bezel * 2;

  return (
    <div
      style={{
        position: 'relative',
        width: `${outerWidth}px`,
        height: `${outerHeight}px`,
        backgroundColor: bezelColor,
        borderRadius: `${outerRadius}px`,
        border: '2px solid #000',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset, 0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      {/* Screen area */}
      <div
        style={{
          position: 'absolute',
          top: `${bezel}px`,
          left: `${bezel}px`,
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: `${innerRadius}px`,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        {children}
      </div>

      {/* Punch hole camera */}
      <div
        style={{
          position: 'absolute',
          top: `${bezel + 10}px`,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '12px',
          height: '12px',
          backgroundColor: '#0a0a1a',
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.08)',
          zIndex: 10,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Android Pill (with navigation pill bar)
// ---------------------------------------------------------------------------

function AndroidPillFrame({ width, height, bezelColor, children }: FrameInternalProps) {
  const bezel = 8;
  const outerRadius = 28;
  const innerRadius = 20;
  const outerWidth = width + bezel * 2;
  const outerHeight = height + bezel * 2;

  return (
    <div
      style={{
        position: 'relative',
        width: `${outerWidth}px`,
        height: `${outerHeight}px`,
        backgroundColor: bezelColor,
        borderRadius: `${outerRadius}px`,
        border: '2px solid #000',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset, 0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      {/* Screen area */}
      <div
        style={{
          position: 'absolute',
          top: `${bezel}px`,
          left: `${bezel}px`,
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: `${innerRadius}px`,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        {children}
      </div>

      {/* Punch hole camera */}
      <div
        style={{
          position: 'absolute',
          top: `${bezel + 10}px`,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '12px',
          height: '12px',
          backgroundColor: '#0a0a1a',
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.08)',
          zIndex: 10,
        }}
      />

      {/* Navigation pill bar at bottom */}
      <div
        style={{
          position: 'absolute',
          bottom: `${bezel + 8}px`,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '100px',
          height: '4px',
          backgroundColor: 'rgba(255,255,255,0.35)',
          borderRadius: '2px',
          zIndex: 10,
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tablet
// ---------------------------------------------------------------------------

function TabletFrame({ width, height, bezelColor, children }: FrameInternalProps) {
  const bezel = 15;
  const outerRadius = 20;
  const innerRadius = 8;
  const outerWidth = width + bezel * 2;
  const outerHeight = height + bezel * 2;

  return (
    <div
      style={{
        position: 'relative',
        width: `${outerWidth}px`,
        height: `${outerHeight}px`,
        backgroundColor: bezelColor,
        borderRadius: `${outerRadius}px`,
        border: '2px solid #000',
        boxShadow: '0 0 0 1px rgba(255,255,255,0.08) inset, 0 4px 20px rgba(0,0,0,0.4)',
      }}
    >
      {/* Front camera */}
      <div
        style={{
          position: 'absolute',
          top: `${(bezel - 6) / 2}px`,
          left: '50%',
          transform: 'translateX(-50%)',
          width: '6px',
          height: '6px',
          backgroundColor: '#0a0a1a',
          borderRadius: '50%',
          border: '1px solid rgba(255,255,255,0.05)',
          zIndex: 10,
        }}
      />

      {/* Screen area */}
      <div
        style={{
          position: 'absolute',
          top: `${bezel}px`,
          left: `${bezel}px`,
          width: `${width}px`,
          height: `${height}px`,
          borderRadius: `${innerRadius}px`,
          overflow: 'hidden',
          backgroundColor: '#000',
        }}
      >
        {children}
      </div>
    </div>
  );
}

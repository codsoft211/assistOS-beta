import { useEffect, useRef } from "react";

interface GeometricBackgroundProps {
  intensity?: 'low' | 'medium' | 'high';
  particleCount?: number;
}

export function GeometricBackground({ intensity = 'medium', particleCount = 20 }: GeometricBackgroundProps) {
  const canvasRef = useRef<HTMLDivElement>(null);

  const densityMap = {
    low: 15,
    medium: 25,
    high: 40
  };

  const nodeCount = densityMap[intensity];

  // Generate random particles with CSS variables for animation
  const particles = Array.from({ length: particleCount }, (_, i) => {
    const isBlue = i % 3 === 0;
    const left = Math.random() * 100;
    const top = Math.random() * 100;
    const tx = (Math.random() - 0.5) * 200;
    const ty = (Math.random() - 0.5) * 200;
    const delay = Math.random() * 15;

    return {
      id: i,
      className: isBlue ? 'particle blue' : 'particle',
      style: {
        left: `${left}%`,
        top: `${top}%`,
        '--tx': `${tx}px`,
        '--ty': `${ty}px`,
        animationDelay: `${delay}s`
      } as React.CSSProperties
    };
  });

  // Generate glowing nodes
  const nodes = Array.from({ length: Math.floor(nodeCount / 2) }, (_, i) => {
    const isBlue = i % 2 === 0;
    const left = Math.random() * 100;
    const top = Math.random() * 100;
    const delay = Math.random() * 5;

    return {
      id: i,
      className: isBlue ? 'glow-node blue' : 'glow-node',
      style: {
        left: `${left}%`,
        top: `${top}%`,
        animationDelay: `${delay}s`
      } as React.CSSProperties
    };
  });

  return (
    <div className="geometric-bg" ref={canvasRef}>
      {/* Gradient overlay */}
      <div className="gradient-overlay" />

      {/* SVG Geometric Mesh */}
      <svg
        className="absolute inset-0 w-full h-full opacity-20"
        style={{ mixBlendMode: 'screen' }}
      >
        <defs>
          <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: '#7C3AED', stopOpacity: 0.6 }} />
            <stop offset="50%" style={{ stopColor: '#3B82F6', stopOpacity: 0.4 }} />
            <stop offset="100%" style={{ stopColor: '#7C3AED', stopOpacity: 0.2 }} />
          </linearGradient>
        </defs>

        {/* Generate connected lines forming mesh */}
        {Array.from({ length: nodeCount }).map((_, i) => {
          const x1 = (i * 100) / nodeCount + (Math.random() * 20);
          const y1 = Math.random() * 100;
          const x2 = ((i + 1) * 100) / nodeCount + (Math.random() * 20);
          const y2 = Math.random() * 100;

          return (
            <g key={i}>
              <line
                x1={`${x1}%`}
                y1={`${y1}%`}
                x2={`${x2}%`}
                y2={`${y2}%`}
                stroke="url(#lineGradient)"
                strokeWidth="1"
                opacity="0.3"
              >
                <animate
                  attributeName="opacity"
                  values="0.2;0.5;0.2"
                  dur={`${8 + Math.random() * 4}s`}
                  repeatCount="indefinite"
                />
              </line>
              
              {/* Vertical connections */}
              {i < nodeCount - 5 && (
                <line
                  x1={`${x1}%`}
                  y1={`${y1}%`}
                  x2={`${((i + 5) * 100) / nodeCount}%`}
                  y2={`${Math.random() * 100}%`}
                  stroke="url(#lineGradient)"
                  strokeWidth="0.5"
                  opacity="0.2"
                >
                  <animate
                    attributeName="opacity"
                    values="0.1;0.3;0.1"
                    dur={`${10 + Math.random() * 5}s`}
                    repeatCount="indefinite"
                  />
                </line>
              )}
            </g>
          );
        })}
      </svg>

      {/* Floating particles */}
      {particles.map(particle => (
        <div
          key={particle.id}
          className={particle.className}
          style={particle.style}
        />
      ))}

      {/* Glowing nodes */}
      {nodes.map(node => (
        <div
          key={node.id}
          className={node.className}
          style={node.style}
        />
      ))}
    </div>
  );
}

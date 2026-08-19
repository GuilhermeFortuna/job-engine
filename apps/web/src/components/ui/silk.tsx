"use client";

import { Color, Mesh, Program, Renderer, Triangle } from "ogl";
import { useEffect, useRef } from "react";

const VERT = `#version 300 es
in vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `#version 300 es
precision highp float;

in vec2 vUv;
out vec4 fragColor;

uniform float uTime;
uniform vec3 uColor;
uniform float uSpeed;
uniform float uScale;
uniform float uRotation;
uniform float uNoiseIntensity;

const float e = 2.71828182845904523536;

float noise(vec2 texCoord) {
  float G = e;
  vec2 r = (G * sin(G * texCoord));
  return fract(r.x * r.y * (1.0 + texCoord.x));
}

vec2 rotateUvs(vec2 uv, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  mat2 rot = mat2(c, -s, s, c);
  return rot * uv;
}

void main() {
  float rnd = noise(gl_FragCoord.xy);
  vec2 uv = rotateUvs(vUv * uScale, uRotation);
  vec2 tex = uv * uScale;
  float tOffset = uSpeed * uTime;

  tex.y += 0.04 * sin(3.2 * tex.x - tOffset);

  float pattern = 0.62 +
                  0.38 * sin(2.4 * (tex.x + tex.y +
                                   cos(1.6 * tex.x + 2.2 * tex.y) +
                                   0.02 * tOffset) +
                           sin(6.0 * (tex.x + tex.y - 0.1 * tOffset)));

  vec4 col = vec4(uColor, 1.0) * vec4(pattern) - rnd / 15.0 * uNoiseIntensity;
  col.a = 1.0;
  fragColor = col;
}
`;

export interface SilkProps {
  speed?: number;
  scale?: number;
  color?: string;
  noiseIntensity?: number;
  rotation?: number;
  className?: string;
}

function hexToRgb(hex: string) {
  const c = new Color(hex);
  return [c.r, c.g, c.b] as const;
}

export function Silk({
  speed = 0.4,
  scale = 1.15,
  color = "#141416",
  noiseIntensity = 0.06,
  rotation = -0.12,
  className,
}: SilkProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({ speed, scale, color, noiseIntensity, rotation });

  useEffect(() => {
    propsRef.current = { speed, scale, color, noiseIntensity, rotation };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const renderer = new Renderer({
      alpha: false,
      antialias: true,
      dpr: Math.min(window.devicePixelRatio, 2),
    });
    const gl = renderer.gl;
    if (!gl) {
      return;
    }
    gl.canvas.style.width = "100%";
    gl.canvas.style.height = "100%";
    gl.canvas.style.display = "block";
    gl.canvas.style.pointerEvents = "none";

    const geometry = new Triangle(gl);
    const initial = propsRef.current;
    const program = new Program(gl, {
      vertex: VERT,
      fragment: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uSpeed: { value: initial.speed },
        uScale: { value: initial.scale },
        uRotation: { value: initial.rotation },
        uNoiseIntensity: { value: initial.noiseIntensity },
        uColor: { value: hexToRgb(initial.color) },
      },
    });

    const mesh = new Mesh(gl, { geometry, program });
    container.appendChild(gl.canvas);

    function resize() {
      if (!container) {
        return;
      }
      renderer.setSize(container.offsetWidth, container.offsetHeight);
    }

    window.addEventListener("resize", resize);
    resize();

    let frame = 0;
    const tick = (t: number) => {
      frame = requestAnimationFrame(tick);
      const current = propsRef.current;
      program.uniforms.uTime.value = t * 0.001;
      program.uniforms.uSpeed.value = current.speed;
      program.uniforms.uScale.value = current.scale;
      program.uniforms.uRotation.value = current.rotation;
      program.uniforms.uNoiseIntensity.value = current.noiseIntensity;
      program.uniforms.uColor.value = hexToRgb(current.color);
      renderer.render({ scene: mesh });
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      gl.canvas.remove();
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return <div ref={containerRef} className={className ?? "h-full w-full"} />;
}

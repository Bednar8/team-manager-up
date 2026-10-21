import { useEffect, useRef } from "react";
import "./home.css";

function routeCurve(width: number, height: number) {
  const x = width / 2;
  const sway = Math.min(22, width * 0.28);
  const round = (value: number) => Math.round(value * 10) / 10;
  return [
    `M ${round(x)} 0`,
    `C ${round(x + sway)} ${round(height * 0.22)}, ${round(x - sway)} ${round(height * 0.4)}, ${round(x)} ${round(height * 0.52)}`,
    `C ${round(x + sway)} ${round(height * 0.7)}, ${round(x - sway)} ${round(height * 0.86)}, ${round(x)} ${round(height)}`,
  ].join(" ");
}

function shift(node: HTMLElement | null, x: number, y: number) {
  if (!node) return;
  node.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
}

function clearShift(node: HTMLElement | null) {
  if (!node) return;
  node.style.transform = "";
}

export default function RouteScene() {
  const sceneRef = useRef<HTMLDivElement>(null);
  const sunRef = useRef<HTMLDivElement>(null);
  const hillsFarRef = useRef<HTMLDivElement>(null);
  const hillsNearRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const polaroidRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    const hero = scene?.closest("[data-home-hero]");
    const route = document.getElementById("home-route");
    const rail = document.getElementById("home-route-rail");
    const dashed = document.getElementById("home-route-dashed");
    const reveal = document.getElementById("home-route-reveal");
    const cards = Array.from(document.querySelectorAll(".home-waypoint"));
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const fine = window.matchMedia("(pointer: fine)");

    const layers = [sunRef.current, hillsFarRef.current, hillsNearRef.current, trackRef.current, polaroidRef.current];
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let frame = 0;
    let onScreen = true;

    const apply = () => {
      const x = current.x;
      const y = current.y;
      shift(sunRef.current, x * 10, y * 6);
      shift(hillsFarRef.current, x * 18, y * 8);
      shift(hillsNearRef.current, x * 28, y * 12);
      shift(trackRef.current, x * 36, y * 14);
      shift(polaroidRef.current, x * -24, y * -16);
    };

    const resetLayers = () => {
      current.x = 0;
      current.y = 0;
      target.x = 0;
      target.y = 0;
      for (const layer of layers) clearShift(layer);
    };

    const step = () => {
      current.x += (target.x - current.x) * 0.08;
      current.y += (target.y - current.y) * 0.08;
      apply();
      const settled = Math.abs(target.x - current.x) < 0.002 && Math.abs(target.y - current.y) < 0.002;
      if (settled) {
        frame = 0;
        return;
      }
      frame = requestAnimationFrame(step);
    };

    const kick = () => {
      if (motion.matches || frame) return;
      frame = requestAnimationFrame(step);
    };

    const layoutRail = () => {
      if (!(rail instanceof SVGSVGElement)) return;
      if (!(dashed instanceof SVGPathElement) || !(reveal instanceof SVGPathElement)) return;
      const { width, height } = rail.getBoundingClientRect();
      if (width < 2 || height < 2) return;
      const w = Math.round(width);
      const h = Math.round(height);
      rail.setAttribute("viewBox", `0 0 ${w} ${h}`);
      const d = routeCurve(w, h);
      dashed.setAttribute("d", d);
      reveal.setAttribute("d", d);
    };

    const updateRoute = () => {
      if (!(route instanceof HTMLElement) || !(reveal instanceof SVGPathElement) || motion.matches) return;
      const rect = route.getBoundingClientRect();
      const start = window.innerHeight * 0.92;
      const distance = Math.max(rect.height * 0.8, 1);
      const progress = Math.min(1, Math.max(0, (start - rect.top) / distance));
      reveal.style.strokeDashoffset = String(1 - progress);
    };

    const syncMotion = () => {
      document.documentElement.classList.toggle("home-motion", !motion.matches);
      if (motion.matches) {
        if (frame) cancelAnimationFrame(frame);
        frame = 0;
        resetLayers();
        if (reveal instanceof SVGPathElement) reveal.style.strokeDashoffset = "";
        for (const card of cards) card.classList.add("is-in");
        return;
      }
      updateRoute();
    };

    let scrollTick = 0;
    const onScroll = () => {
      if (scrollTick) return;
      scrollTick = requestAnimationFrame(() => {
        scrollTick = 0;
        updateHero();
        updateRoute();
      });
    };

    const onResize = () => {
      layoutRail();
      updateHero();
      updateRoute();
    };

    const onPointer = (event: PointerEvent) => {
      if (!(hero instanceof HTMLElement) || motion.matches || !fine.matches) return;
      const rect = hero.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      target.x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      target.y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      kick();
    };

    const onLeave = () => {
      target.x = 0;
      target.y = 0;
      kick();
    };

    const cardObserver = new IntersectionObserver(
      (entries) => {
        if (motion.matches) return;
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add("is-in");
          cardObserver.unobserve(entry.target);
        }
      },
      { threshold: 0.28, rootMargin: "0px 0px -8% 0px" },
    );

    const updateHero = () => {
      if (!(hero instanceof HTMLElement)) return;
      const rect = hero.getBoundingClientRect();
      onScreen = rect.bottom > 0 && rect.top < window.innerHeight;
      scene?.classList.toggle("is-off", !onScreen);
      if (!onScreen) {
        target.x = 0;
        target.y = 0;
        kick();
      }
    };

    layoutRail();
    updateHero();
    syncMotion();
    if (!motion.matches) {
      for (const card of cards) cardObserver.observe(card);
    }
    if (hero instanceof HTMLElement) {
      hero.addEventListener("pointermove", onPointer);
      hero.addEventListener("pointerleave", onLeave);
    }
    const resizeObserver = new ResizeObserver(onResize);
    if (route instanceof HTMLElement) resizeObserver.observe(route);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    motion.addEventListener("change", syncMotion);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (scrollTick) cancelAnimationFrame(scrollTick);
      if (hero instanceof HTMLElement) {
        hero.removeEventListener("pointermove", onPointer);
        hero.removeEventListener("pointerleave", onLeave);
      }
      resizeObserver.disconnect();
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      cardObserver.disconnect();
      motion.removeEventListener("change", syncMotion);
    };
  }, []);

  return (
    <div className="home-scene" ref={sceneRef} aria-hidden="true">
      <div className="home-sun" ref={sunRef} />
      <div className="home-hills home-hills--far" ref={hillsFarRef}>
        <svg viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path d="M0 190 C 180 120, 320 210, 520 160 C 760 100, 900 200, 1120 150 C 1280 110, 1360 160, 1440 130 L1440 320 L0 320 Z" />
        </svg>
      </div>
      <div className="home-hills home-hills--near" ref={hillsNearRef}>
        <svg viewBox="0 0 1440 320" preserveAspectRatio="none">
          <path d="M0 210 C 220 160, 380 250, 600 200 C 860 140, 1020 240, 1260 190 C 1360 170, 1400 180, 1440 165 L1440 320 L0 320 Z" />
        </svg>
      </div>
      <div className="home-track-rig" ref={trackRef}>
        <div className="home-track-perspective">
          <div className="home-track">
            <div className="home-track__lane" />
            <div className="home-track__lane home-track__lane--inner" />
            <div className="home-track__turf" />
            <div className="home-track__start" />
            <div className="home-runner">
              <div className="home-runner__figure">
                <svg viewBox="0 0 64 64">
                  <ellipse cx="32" cy="60" rx="14" ry="3" fill="oklch(0.28 0.05 40 / 0.4)" />
                  <circle cx="40" cy="10" r="6" fill="currentColor" />
                  <path
                    d="M36 17 C 30 24, 28 30, 30 38"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                  <path
                    d="M32 24 L18 20 M33 26 L48 32"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  <path
                    d="M30 38 L18 52 M30 38 L46 54"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="home-polaroid" ref={polaroidRef}>
        <div className="home-polaroid__card">
          <div className="home-polaroid__screen">
            <p className="home-polaroid__app">Poranny bieg</p>
            <p className="home-polaroid__readout">
              <strong>5,2 km</strong>
              <span>· 28:14</span>
            </p>
            <svg className="home-polaroid__spark" viewBox="0 0 160 40" fill="none">
              <path
                d="M2 32 C 18 30, 24 22, 38 24 C 54 26, 60 14, 76 16 C 94 18, 100 10, 116 12 C 132 14, 140 6, 158 4"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
              />
            </svg>
          </div>
          <p className="home-polaroid__caption">zrzut z aplikacji</p>
        </div>
      </div>
      <div className="home-hero__fade" />
    </div>
  );
}

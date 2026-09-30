import { useEffect, useRef } from 'react';

// Cards on the ring: product photos where we have them, icons for merch (no photos yet)
const CARDS = [
  { title: 'Ghaslet The Classic', img: '/img/products/ghaslet-classic.png', tone: 'red' },
  { title: 'Ghaslet Tamarind Blaze', img: '/img/products/ghaslet-tamarind-blaze.png', tone: 'red' },
  { title: 'Ghaslet Tingle Berry', img: '/img/products/ghaslet-tingle-berry.png', tone: 'red' },
  { title: 'Friends of Capiche T-Shirt', icon: 'fa-shirt', tone: 'cyan' },
  { title: 'Ghaslet Gates of Hell', img: '/img/products/ghaslet-gates-of-hell.png', tone: 'red' },
  { title: 'Ghaslet Truffle Bomb', img: '/img/products/ghaslet-truffle-bomb.png', tone: 'red' },
  { title: 'Capiche Jacket', icon: 'fa-vest', tone: 'cyan' },
  { title: 'Chilli Crisp', img: '/img/products/chilli-crisp-label.png', tone: 'yellow' },
  { title: 'Chilli Crisp', img: '/img/products/chilli-crisp-front.png', tone: 'yellow' },
  { title: 'Capiche Pendant', icon: 'fa-gem', tone: 'cyan' },
];

const WORDS = ['Wear.', 'The', 'Vibe.'];
const clamp = (v) => Math.max(0, Math.min(1, v));

// Sticky, scroll-driven 3D carousel: while the tall section scrolls by, the stage stays
// pinned, the ring flies in from the distance, tilts and spins a full turn around the
// "WEAR. THE. VIBE." headline.
export default function Ring3D({ speed = 36 }) {
  const sectionRef = useRef(null);
  const ringRef = useRef(null);
  const wordRefs = useRef([]);

  useEffect(() => {
    const section = sectionRef.current;
    const ring = ringRef.current;
    let raf = 0;
    let live = false;
    const update = () => {
      raf = 0;
      if (!live) return;
      const r = section.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = clamp(-r.top / (r.height - vh)); // 0..1 while the stage is pinned
      const enter = clamp(p / 0.25); // fly-in during the first quarter
      const ease = 1 - Math.pow(1 - enter, 3);
      const z = -900 * (1 - ease);
      const tilt = -18 + 12 * Math.sin(p * Math.PI);
      ring.style.transform = `translateZ(${z}px) rotateX(${tilt}deg) rotateY(${p * -360}deg)`;
      wordRefs.current.forEach((w, i) => {
        const t = clamp((p - 0.12 - i * 0.14) / 0.12);
        w.style.opacity = t.toFixed(3);
        w.style.transform = `translateY(${(1 - t) * 60}px) scale(${0.6 + 0.4 * t})`;
      });
    };
    const onScroll = () => {
      if (live && !raf) raf = requestAnimationFrame(update);
    };
    // Only animate while the section is on screen
    const io = new IntersectionObserver(([entry]) => {
      live = entry.isIntersecting;
      section.classList.toggle('rg-live', live);
      if (live) onScroll();
    });
    io.observe(section);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  const step = 360 / CARDS.length;

  return (
    <section className="ring3d" ref={sectionRef} aria-hidden="true">
      <div className="rg-sticky">
        <div className="rg-glow"></div>
        <div className="rg-stage">
          <div className="rg-spin" style={{ animationDuration: `${Math.min(120, Math.max(8, Number(speed) || 36))}s` }}>
            <div className="rg-ring" ref={ringRef}>
              {CARDS.map((c, i) => (
                <div
                  className={'rg-card rg-' + c.tone}
                  key={i}
                  style={{ transform: `rotateY(${i * step}deg) translateZ(var(--radius))` }}
                >
                  {c.img ? <img src={c.img} alt="" /> : <i className={'fas ' + c.icon}></i>}
                  <span>{c.title}</span>
                </div>
              ))}
            </div>
          </div>
          <h3 className="rg-words">
            {WORDS.map((w, i) => (
              <span key={w} ref={(el) => (wordRefs.current[i] = el)}>{w}</span>
            ))}
          </h3>
        </div>
      </div>
    </section>
  );
}

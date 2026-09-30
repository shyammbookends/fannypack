import { Fragment, useEffect, useRef } from 'react';

const RIBBONS = [
  {
    cls: 'rb-red',
    icon: 'fa-pepper-hot',
    words: ['Ghaslet', 'The Classic', 'Tamarind Blaze', 'Tingle Berry', 'Gates of Hell', 'Truffle Bomb'],
  },
  {
    cls: 'rb-yellow',
    icon: 'fa-fire-flame-curved',
    words: ['Chilli Crisp', 'Crunchy', 'Spicy', 'Addictive', 'Bold Crunch', 'Big Flavour'],
  },
];

// Two crossing ribbons that scroll sideways forever and tilt / slide in 3D
// as the band moves through the viewport (scroll position -> CSS var --p, -1..1).
export default function Ribbons3D() {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    let raf = 0;
    let live = false;
    const update = () => {
      raf = 0;
      if (!live) return;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const p = (r.top + r.height / 2 - vh / 2) / vh;
      el.style.setProperty('--p', Math.max(-1, Math.min(1, p)).toFixed(3));
    };
    const onScroll = () => {
      if (live && !raf) raf = requestAnimationFrame(update);
    };
    // Only animate while the band is on screen
    const io = new IntersectionObserver(([entry]) => {
      live = entry.isIntersecting;
      el.classList.toggle('rb-live', live);
      if (live) onScroll();
    });
    io.observe(el);
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      io.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="ribbons3d" ref={ref} aria-hidden="true">
      {RIBBONS.map((rb) => (
        <div className={'rb ' + rb.cls} key={rb.cls}>
          <div className="rb-track">
            {/* content twice so the loop is seamless */}
            {[0, 1].map((copy) => (
              <Fragment key={copy}>
                {rb.words.map((w) => (
                  <span className="rb-item" key={copy + w}>
                    {w}
                    <i className={'fas ' + rb.icon}></i>
                  </span>
                ))}
              </Fragment>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

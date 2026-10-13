import { useEffect, useRef, useState } from 'react';

/* NUMBER COUNTER ANIMATION - counts up once the user scrolls past the hero.
   Uses an IntersectionObserver instead of reading layout on every scroll event. */
export default function Counter({ num, suf }) {
  const [val, setVal] = useState(num);
  const ref = useRef(null);

  useEffect(() => {
    const hero = document.getElementById('hero');
    if (!hero || typeof IntersectionObserver === 'undefined') return;
    let iv;
    let started = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        // the hero is almost out of view: play the count-up once
        if (started || entry.intersectionRatio > 0.35 || window.scrollY < 50) return;
        started = true;
        io.disconnect();
        let n = 0;
        const step = Math.max(1, Math.ceil(num / 55));
        setVal(0);
        iv = setInterval(() => {
          n = Math.min(num, n + step);
          setVal(n);
          if (n >= num) clearInterval(iv);
        }, 1400 / 55);
      },
      { threshold: [0, 0.35, 0.6, 1] }
    );
    io.observe(hero);
    return () => {
      io.disconnect();
      clearInterval(iv);
    };
  }, [num]);

  return <span className="snum" ref={ref}>{val}<em>{suf}</em></span>;
}

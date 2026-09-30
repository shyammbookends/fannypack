import { useEffect, useState } from 'react';

/* NUMBER COUNTER ANIMATION - starts once the user scrolls past the hero */
export default function Counter({ num, suf }) {
  const [val, setVal] = useState(num);

  useEffect(() => {
    let iv;
    const onScroll = () => {
      const hero = document.getElementById('hero');
      if (hero && window.scrollY > hero.offsetHeight - 300) {
        window.removeEventListener('scroll', onScroll);
        let start = 0;
        const step = Math.ceil(num / 55);
        setVal(0);
        iv = setInterval(() => {
          start += step;
          if (start >= num) {
            start = num;
            clearInterval(iv);
          }
          setVal(start);
        }, 1400 / 55);
      }
    };
    window.addEventListener('scroll', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      clearInterval(iv);
    };
  }, [num]);

  return <span className="snum">{val}<em>{suf}</em></span>;
}

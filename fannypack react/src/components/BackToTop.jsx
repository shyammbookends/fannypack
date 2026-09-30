import { useEffect, useState } from 'react';

export default function BackToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 300);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <button id="btt" className={show ? 'show' : ''} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
      <i className="fas fa-chevron-up"></i>
    </button>
  );
}

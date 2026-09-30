// Touch/pointer tilt for cards: writes the pointer position into CSS vars that
// mobile.css turns into a 3D tilt, glare and parallax. Desktop CSS ignores them.
//   --rx / --ry : tilt angles      --gx / --gy : glare position (%)
//   --px / --py : pointer offset from the centre, -0.5 .. 0.5 (for parallax)
export function tilt(e) {
  const card = e.currentTarget;
  const r = card.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5;
  const y = (e.clientY - r.top) / r.height - 0.5;
  card.style.setProperty('--ry', `${(x * 16).toFixed(2)}deg`);
  card.style.setProperty('--rx', `${(-y * 16).toFixed(2)}deg`);
  card.style.setProperty('--gx', `${((x + 0.5) * 100).toFixed(1)}%`);
  card.style.setProperty('--gy', `${((y + 0.5) * 100).toFixed(1)}%`);
  card.style.setProperty('--px', x.toFixed(3));
  card.style.setProperty('--py', y.toFixed(3));
  card.classList.add('tilting');
}

export function untilt(e) {
  const card = e.currentTarget;
  card.style.setProperty('--rx', '0deg');
  card.style.setProperty('--ry', '0deg');
  card.style.setProperty('--px', '0');
  card.style.setProperty('--py', '0');
  card.classList.remove('tilting');
}

// Pointer props to spread onto a tiltable card
export const tiltHandlers = {
  onPointerMove: tilt,
  onPointerLeave: untilt,
  onPointerUp: untilt,
  onPointerCancel: untilt,
};

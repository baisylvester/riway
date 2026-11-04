"use client";
import { useEffect } from "react";
export function InteractionRuntime() {
  useEffect(() => {
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const touch = matchMedia("(hover: none), (max-width: 760px)").matches;
    const wipe = document.createElement("div"); wipe.className = "rw-page-wipe is-idle"; wipe.innerHTML = "<span>RIWAY</span>"; document.body.append(wipe);
    const loader = document.createElement("div"); loader.className = "rw-loader"; loader.innerHTML = '<div class="rw-loader-word">RIWAY</div><div class="rw-loader-count">000</div><div class="rw-loader-bar"><i></i></div>'; document.body.append(loader);
    const cleanups: Array<() => void> = [];
    if (reduced) loader.remove(); else { const start = performance.now(); const tick = (now: number) => { const p = Math.min(1, (now - start) / 900); const count = loader.querySelector(".rw-loader-count"); const bar = loader.querySelector("i") as HTMLElement | null; if (count) count.textContent = String(Math.round(p * 100)).padStart(3, "0"); if (bar) bar.style.width = `${p * 100}%`; if (p < 1) requestAnimationFrame(tick); else { loader.classList.add("is-done"); setTimeout(() => loader.remove(), 850); } }; requestAnimationFrame(tick); }
    const reveal = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("rw-revealed"); reveal.unobserve(entry.target); } }), { threshold: .12 });
    document.querySelectorAll(".rw-section, .rw-house, .rw-track-card, .rw-editorial-pair, .rw-theme-grid figure").forEach((el) => reveal.observe(el)); cleanups.push(() => reveal.disconnect());
    if (!touch) {
      const cursor = document.createElement("div"); cursor.className = "rw-cursor"; cursor.innerHTML = '<i class="rw-cursor-ring"></i><i class="rw-cursor-dot"></i><span class="rw-cursor-label"></span>'; document.body.append(cursor); document.body.classList.add("rw-custom-cursor");
      let x = -100, y = -100, tx = -100, ty = -100; let frame = 0; const move = (e: PointerEvent) => { tx = e.clientX; ty = e.clientY; }; const over = (e: Event) => { const target = (e.target as HTMLElement | null)?.closest<HTMLElement>("a,button,[data-cursor]"); const label = target?.dataset.cursor; cursor.classList.toggle("is-hover", !!target); cursor.classList.toggle("is-label", !!label); const node = cursor.querySelector(".rw-cursor-label"); if (node) node.textContent = label || ""; }; const animate = () => { x += (tx - x) * .18; y += (ty - y) * .18; cursor.style.transform = `translate3d(${x}px,${y}px,0)`; frame = requestAnimationFrame(animate); }; window.addEventListener("pointermove", move, { passive: true }); document.addEventListener("pointerover", over, { passive: true }); frame = requestAnimationFrame(animate);
      document.querySelectorAll<HTMLElement>(".rw-pill, .button, .text-link").forEach((el) => { el.classList.add("rw-magnetic"); const moveMagnet = (e: PointerEvent) => { const r = el.getBoundingClientRect(); const s = el.classList.contains("rw-pill") ? .2 : .35; el.style.transform = `translate(${(e.clientX - (r.left + r.width / 2)) * s}px,${(e.clientY - (r.top + r.height / 2)) * s}px)`; }; const reset = () => { el.style.transform = "translate(0,0)"; }; el.addEventListener("pointermove", moveMagnet, { passive: true }); el.addEventListener("pointerleave", reset); cleanups.push(() => { el.removeEventListener("pointermove", moveMagnet); el.removeEventListener("pointerleave", reset); }); });
      cleanups.push(() => { cancelAnimationFrame(frame); window.removeEventListener("pointermove", move); document.removeEventListener("pointerover", over); document.body.classList.remove("rw-custom-cursor"); cursor.remove(); });
    }
    const navigate = (e: MouseEvent) => { if (reduced || e.button !== 0) return; const link = (e.target as HTMLElement | null)?.closest<HTMLAnchorElement>("a[href]"); if (!link || link.target || link.origin !== location.origin || link.hash || link.pathname === location.pathname) return; e.preventDefault(); wipe.classList.remove("is-idle"); setTimeout(() => { location.href = link.href; }, 520); }; document.addEventListener("click", navigate); cleanups.push(() => document.removeEventListener("click", navigate));
    return () => { cleanups.forEach((cleanup) => cleanup()); loader.remove(); wipe.remove(); };
  }, []);
  return null;
}

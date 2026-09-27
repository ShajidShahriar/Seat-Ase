'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';

const MapView = dynamic(() => import('./MapView.js'), { ssr: false, loading: () => <div className="fixed inset-0 bg-grouped" /> });

const SNAPS = { peek: 0.3, half: 0.52, full: 0.94 };
const PANEL_WIDTH = 380;
const PANEL_GAP = 16;
const StageContext = createContext(null);

// ---- Wide screens get a floating panel on the left; phones get a bottom sheet ----

function useWide() {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(min-width: 768px)');
    const update = () => setWide(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return wide;
}

// ---- The sheet: drag the grabber to peek, half or full; it settles on the nearest ----

function Sheet({ snap, onVisibleChange, wide, children }) {
  const sheet = useRef(null);
  const drag = useRef(null);
  const [height, setHeight] = useState(0);
  const [visible, setVisible] = useState(null);

  useEffect(() => {
    const update = () => setHeight(window.innerHeight);
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  useEffect(() => setVisible(null), [snap]);

  const shown = visible ?? height * SNAPS[snap];
  useEffect(() => {
    if (height) onVisibleChange(wide ? 0 : shown);
  }, [shown, height, wide, onVisibleChange]);

  function onPointerDown(event) {
    if (wide) return;
    drag.current = { startY: event.clientY, startShown: shown };
    sheet.current.setPointerCapture(event.pointerId);
    sheet.current.classList.add('dragging');
  }
  function onPointerMove(event) {
    if (!drag.current) return;
    const next = drag.current.startShown + (drag.current.startY - event.clientY);
    setVisible(Math.min(height * SNAPS.full, Math.max(height * 0.2, next)));
  }
  function onPointerUp() {
    if (!drag.current) return;
    drag.current = null;
    sheet.current.classList.remove('dragging');
    const nearest = Object.values(SNAPS).reduce((best, f) => (Math.abs(f * height - shown) < Math.abs(best * height - shown) ? f : best), SNAPS.half);
    setVisible(nearest * height);
  }

  const style = wide || !height ? undefined : { transform: `translateY(${height * SNAPS.full - shown}px)` };

  return (
    <section ref={sheet} className="stage-sheet" style={style} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-label="Seat Ase?">
      <div className="stage-grabber" onPointerDown={onPointerDown}>
        <span />
      </div>
      <div className="stage-body">{children}</div>
    </section>
  );
}

// ---- The stage: one map behind every page, one sheet in front ----

export function MapStage({ children }) {
  const wide = useWide();
  const [scene, setScene] = useState({ focus: 'home' });
  const [snap, setSnap] = useState('half');
  const [sheetShown, setSheetShown] = useState(0);
  const tap = useRef(null);

  const onVisibleChange = useCallback((value) => setSheetShown(Math.round(value)), []);
  const padding = wide ? { top: 0, bottom: 0, left: PANEL_WIDTH + PANEL_GAP * 2, right: 0 } : { top: 0, bottom: sheetShown, left: 0, right: 0 };

  return (
    <StageContext.Provider value={{ setScene, setSnap, tap }}>
      <div className="fixed inset-0">
        <MapView className="h-full w-full" scene={scene} padding={padding} onTap={(point) => tap.current?.(point)} />
      </div>
      <Sheet snap={snap} wide={wide} onVisibleChange={onVisibleChange}>
        {children}
      </Sheet>
    </StageContext.Provider>
  );
}

// ---- A page says what the map should show, how high the sheet sits, and what a tap on the map means ----

export function useStage({ scene = { focus: 'home' }, snap = 'half', onTap = null, enabled = true } = {}) {
  const stage = useContext(StageContext);
  if (enabled) stage.tap.current = onTap;
  const signature = JSON.stringify(scene);
  useEffect(() => {
    if (enabled) stage.setScene(JSON.parse(signature));
  }, [signature, enabled]);
  useEffect(() => {
    if (enabled) stage.setSnap(snap);
  }, [snap, enabled]);
}

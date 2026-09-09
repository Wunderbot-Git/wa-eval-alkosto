import type { CSSProperties } from 'react'
const paths: Record<string, string> = {
  resumen: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
  revisión: 'M14 3H5v18h14V9 M14 3v6h5 M8 13h5 M8 17h7 M14 3l5 6',
  conversaciones: 'M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z M7 9h10 M7 13h7',
  catálogos: 'M4 4h6l2 2 2-2h6v16h-6l-2 2-2-2H4Z M12 6v16',
  mejoras: 'M4 20h16 M6 16l4-5 4 2 5-8 M14 5h5v5',
  pruebas: 'M8 3h8 M10 3v6l-6 10a1 1 0 0 0 1 2h14a1 1 0 0 0 1-2L14 9V3 M8 14h8',
  checked: 'M9 12l2 2 4-4 M12 3l8 3v6c0 4-4 7-8 9-4-2-8-5-8-9V6Z',
  alert: 'M12 3 2 21h20L12 3Z M12 9v5 M12 17v1',
  clock: 'M12 8v5l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  arrow: 'M5 12h14 M14 7l5 5-5 5',
}
export default function WorkspaceIcon({ name, style }: { name: string; style?: CSSProperties }) {
  return <svg className="workspace-icon" style={style} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name] || paths.resumen} /></svg>
}

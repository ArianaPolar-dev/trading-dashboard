'use client';

type SidebarProps = {
  currentSection: string,
  setSection: (key: string) => void
};

export default function Sidebar({ currentSection, setSection }: SidebarProps) {
  const menu = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'calendario', label: 'Resumen Semanal/Mensual' },
    { key: 'config', label: 'Configuración' },
    { key: 'fondos', label: 'Fondos' }
  ];
  return (
    <aside className="bg-neutral-900 h-screen text-white flex flex-col items-start p-4 min-w-[180px] border-r border-red-800">
      <h2 className="text-xl mb-6 mt-2">Panel</h2>
      {menu.map(item => (
        <button
          key={item.key}
          onClick={() => setSection(item.key)}
          className={`mb-2 py-2 px-4 rounded text-left w-full transition-colors ${
            currentSection === item.key
              ? 'bg-red-600 font-bold'
              : 'hover:bg-neutral-800'
          }`}
        >
          {item.label}
        </button>
      ))}
    </aside>
  );
}


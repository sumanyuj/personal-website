const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round'
};

export const GridIcon = (p) => (
  <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true" {...p}>
    <g {...base}>
      <rect x="2.5" y="2.5" width="6" height="6" rx="1" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1" />
    </g>
  </svg>
);

export const ListIcon = (p) => (
  <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true" {...p}>
    <g {...base}>
      <path d="M7 4.5h11M7 10h11M7 15.5h11M2.5 4.5h.01M2.5 10h.01M2.5 15.5h.01" />
    </g>
  </svg>
);

export const PlusIcon = (p) => (
  <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true" {...p}>
    <path d="M10 3.5v13M3.5 10h13" {...base} />
  </svg>
);

export const BooksIcon = ({ size = 52, ...p }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" {...p}>
    <g fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
      <rect x="3" y="4" width="4" height="16" rx="0.7" />
      <rect x="8.5" y="4" width="4" height="16" rx="0.7" />
      <path d="M14.6 5.4 18.4 4.5a.7.7 0 0 1 .85.52l2.7 13.5a.7.7 0 0 1-.55.82l-3.4.7a.7.7 0 0 1-.82-.55L14.1 6.2a.7.7 0 0 1 .5-.8Z" />
    </g>
  </svg>
);

export const SmallBookIcon = (p) => (
  <svg width="14" height="14" viewBox="0 0 20 20" aria-hidden="true" {...p}>
    <g {...base}>
      <rect x="4" y="3" width="12" height="14" rx="1.2" />
      <path d="M7 3v14" />
    </g>
  </svg>
);

export const BigBookIcon = (p) => (
  <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true" {...p}>
    <g {...base}>
      <rect x="2.5" y="2" width="15" height="16" rx="1.2" />
      <path d="M6 2v16" />
    </g>
  </svg>
);

export const CollectionsIcon = (p) => (
  <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true" {...p}>
    <g {...base}>
      <rect x="2.5" y="4" width="3.5" height="12" rx="0.6" />
      <rect x="8" y="4" width="3.5" height="12" rx="0.6" />
      <rect x="13.5" y="4" width="3.5" height="12" rx="0.6" />
    </g>
  </svg>
);

export const SignOutIcon = (p) => (
  <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true" {...p}>
    <g {...base}>
      <path d="M12.5 6V4.2a1.2 1.2 0 0 0-1.2-1.2H4.2A1.2 1.2 0 0 0 3 4.2v11.6A1.2 1.2 0 0 0 4.2 17h7.1a1.2 1.2 0 0 0 1.2-1.2V14" />
      <path d="M8 10h9m0 0-2.6-2.6M17 10l-2.6 2.6" />
    </g>
  </svg>
);
